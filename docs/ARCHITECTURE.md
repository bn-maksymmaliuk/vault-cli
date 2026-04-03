# Architecture

## Project Structure

```
vault-cli/
├── src/
│   ├── cli.ts              # CLI entry point (commander.js)
│   ├── action.ts           # GitHub Action entry point
│   └── core/
│       ├── config.ts       # Vault address + token resolution
│       ├── env.ts          # Environment detection (dev/staging/prod)
│       ├── template.ts     # Template filename resolution
│       ├── parser.ts       # .tpl file parser
│       ├── generator.ts    # Orchestrates fetching and writing .env
│       ├── vault.ts        # Vault HTTP client (KV v1 + v2)
│       ├── githubAuth.ts   # GitHub token → Vault token exchange
│       ├── logger.ts       # Console output formatting (chalk + ora)
│       └── vault.test.ts   # Vault client tests
├── src/types/
│   └── index.ts            # Shared TypeScript types
├── dist/
│   ├── cli.js              # Built CLI binary
│   └── action.js           # Built GitHub Action binary
├── docs/                   # Documentation
├── action.yml              # GitHub Action metadata
├── package.json
└── tsconfig.json
```

## Core Modules

### `cli.ts`
CLI entry point built with Commander.js. Resolves environment, template, Vault config, then calls `generateEnv()`. Uses `logger.ts` for all console output.

### `action.ts`
GitHub Action entry point. Reads inputs from `action.yml` via `@actions/core`, resolves paths relative to `GITHUB_WORKSPACE`, then calls `generateEnv()`.

### `core/env.ts`
Detects the current environment based on context:
- In GitHub Actions: uses `GITHUB_REF_TYPE` and `GITHUB_REF_NAME` to return `production`, `staging`, or `development`
- Locally: uses `NODE_ENV`, defaults to `development`

### `core/template.ts`
Maps environment name to template filename:
```
development → .env.development.tpl
staging     → .env.staging.tpl
production  → .env.production.tpl
```

### `core/parser.ts`
Parses `.tpl` files line by line. Each line format:
```
ENV_KEY=mount/path/to/secret
```
Returns an array of `{ key, path }` entries. Validates key format, detects duplicates, skips comments and empty lines.

### `core/config.ts`
Resolves Vault connection config from CLI flags or environment variables. Priority:
1. `--token` flag → `VAULT_TOKEN` env
2. `--github-token` flag → `GITHUB_TOKEN` env (exchanges via `githubAuth.ts`)

Validates `VAULT_ADDR` URL format. Caches GitHub token exchange results in memory.

### `core/githubAuth.ts`
Exchanges a GitHub personal access token for a Vault token via:
```
POST /v1/auth/github/login  { token: "<github_token>" }
```
Returns `auth.client_token` from the response.

### `core/vault.ts`
HTTP client for Vault API built with axios. Supports KV v1 and KV v2 transparently.

**KV version detection** (per mount, cached):
1. Try `GET /v1/sys/mounts/{mount}` → read `options.version`
2. Fallback: `GET /v1/sys/internal/ui/mounts/{mount}`
3. If both fail → mark as `unknown`, probe both versions at fetch time

**Path handling:**
```
User input:  mount/path/to/secret
KV v1 API:   GET /v1/mount/path/to/secret
KV v2 API:   GET /v1/mount/data/path/to/secret
```
The `/data/` segment is added automatically — users never write it.

**Response structure:**
```
KV v1: { data: { KEY: "value" } }
KV v2: { data: { data: { KEY: "value" }, metadata: {...} } }
```

### `core/generator.ts`
Orchestrates the full flow:
1. Reads and parses the template file
2. Creates `VaultClient`
3. Fetches all secrets concurrently (via `p-limit`, max 5 in parallel)
4. Logs per-secret success/failure via `logger.ts`
5. Writes the resulting `.env` file

### `core/logger.ts`
Centralized console output using `chalk` (colors) and `ora` (spinners). Methods:
- `banner()` — golden `◆ vault-cli` header
- `info(label, value)` — cyan key-value lines
- `verbose(msg)` — gray debug lines
- `divider()` — separator line
- `secretOk(key, path)` — green ✔ per secret
- `secretFail(key, path, reason)` — red ✖ per secret
- `success(msg)` / `error(msg)` — final status

## Data Flow

### CLI
```
yarn vault-cli env
       ↓
cli.ts → resolveEnv() → resolveTemplate()
       ↓
resolveVaultConfig()  ←  VAULT_TOKEN | GITHUB_TOKEN
       ↓
generateEnv()
       ↓
parseTemplate()  ←  .env.{env}.tpl
       ↓
VaultClient.getSecret()  ←→  Vault API (KV v1 / v2)
       ↓
write .env
```

### GitHub Action
```
action.yml inputs
       ↓
action.ts → resolveVaultConfig()
       ↓
generateEnv()  →  [same as CLI flow]
       ↓
.env written to GITHUB_WORKSPACE
```

## Authentication

| Method | Variable | Flow |
|--------|----------|------|
| Direct token | `VAULT_TOKEN` | Used as-is |
| GitHub auth | `GITHUB_TOKEN` | Exchanged via `/v1/auth/github/login` |

Priority: `VAULT_TOKEN` is checked first. If absent, `GITHUB_TOKEN` is used.

## KV Engine Support

| Feature | KV v1 | KV v2 |
|---------|-------|-------|
| API path | `/v1/mount/path` | `/v1/mount/data/path` |
| Response | `data.KEY` | `data.data.KEY` |
| Detection | `sys/mounts` | `sys/mounts` options.version=2 |
| User path | `mount/path` | `mount/path` (same) |

## Concurrency

Secrets are fetched in parallel using `p-limit` with a cap of **5 concurrent requests**. This avoids overwhelming the Vault server while still being faster than sequential fetching.

## Build

Built with **tsup**:

```bash
yarn build
# → dist/cli.js    (CLI)
# → dist/action.js (GitHub Action)
```

Both outputs are CommonJS, bundled with all dependencies.

## Dependencies

| Package | Purpose |
|---------|---------|
| `axios` | HTTP client for Vault API |
| `commander` | CLI argument parsing |
| `p-limit` | Concurrency control |
| `chalk` | Terminal colors |
| `ora` | Spinner / progress |
| `@actions/core` | GitHub Action I/O |

## Error Handling

Errors are caught at each layer and re-thrown with context:
- `vault.ts` — wraps 404/403 HTTP errors with path info
- `generator.ts` — wraps per-secret errors with key name
- `cli.ts` / `action.ts` — catches top-level errors, prints via `logger.error()` or `setFailed()`, exits with code 1
