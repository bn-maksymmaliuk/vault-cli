# Installation

## 1. Install

```bash
yarn add -D @maksymmaliuk/vault-cli
```

Or globally:

```bash
npm install -g @maksymmaliuk/vault-cli
```

---

## 2. Set environment variables

### Required

```bash
export VAULT_ADDR="https://your-vault.example.com"
```

### Auth token — choose one

| Variable | When to use |
|---|---|
| `GITHUB_TOKEN` | Recommended in GitHub Actions |
| `VAULT_TOKEN` | Direct Vault token auth |

```bash
# Option A — GitHub token (recommended in CI/CD)
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"

# Option B — direct Vault token
export VAULT_TOKEN="hvs.xxxxxxxxxxxx"
```

---

## 3. Run

```bash
yarn vault-cli env
```

### One-liner example

```bash
VAULT_ADDR="https://your-vault.example.com" GITHUB_TOKEN="ghp_xxx" yarn vault-cli env
```

---

## Template file

By default, `vault-cli` looks for `.env.{environment}.tpl` in the current directory.

Example `.env.development.tpl`:

```
DB_PASSWORD=secret/myapp/dev/DB_PASSWORD
JWT_SECRET=secret/myapp/dev/JWT_SECRET
API_KEY=secret/myapp/dev/API_KEY
```

Each value is a path to a secret in Vault (KV v1 or KV v2).

