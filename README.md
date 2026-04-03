# Vault CLI
Powerful CLI tool to manage secrets from HashiCorp Vault. Supports both KV v1 and v2 with automatic version detection.
## Features
- 🚀 **Multi-KV Support**: Automatically detects KV v1 and v2
- 🔐 **GitHub Action**: Use as native GitHub Action
- 📝 **Template-Based**: Simple `.env.tpl` files
- ✨ **Unified Path Format**: Same path format for both KV versions (no `/data/` needed)
## Quick Start
### 1. Create Template
```
DB_HOST=secret/prod/database/host
API_KEY=secret/prod/keys/api
```
### 2. Set Environment
```bash
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=s.xxxxx
```
### 3. Run
```bash
vault-cli env --output .env
```
## Installation
```bash
npm install -g @maksymmaliuk/vault-cli
```
## Usage
```bash
vault-cli env
```
## GitHub Actions
```yaml
- uses: maksymmaliuk/vault-cli@latest
  with:
    addr: ${{ secrets.VAULT_ADDR }}
    token: ${{ secrets.VAULT_TOKEN }}
    template: .env.tpl
```
## Path Format
Both KV v1 and v2 use the same user-facing path format:
```
mount/path/to/secret
```
Internally:
- **KV v1**: `GET /v1/mount/path/to/secret`
- **KV v2**: `GET /v1/mount/data/path/to/secret` (automatic)
## Documentation
- [Installation Guide](./docs/INSTALLATION.md)
- [CLI Guide](./docs/CLI.md)
- [GitHub Action Guide](./docs/GITHUB_ACTION.md)
- [Architecture](./docs/ARCHITECTURE.md)
---
**Version**: 1.0.0
