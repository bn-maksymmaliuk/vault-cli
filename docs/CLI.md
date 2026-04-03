# CLI Usage Guide

Complete guide for using Vault CLI from the command line.

## Installation

### Global Installation

```bash
npm install -g @maksymmaliuk/vault-cli
```

Then use anywhere:

```bash
vault-cli env --template .env.tpl
```

### Local Installation

```bash
npm install @maksymmaliuk/vault-cli
```

Then use with npx:

```bash
npx vault-cli env --template .env.tpl
```

Or add to package.json scripts:

```json
{
  "scripts": {
    "vault": "vault-cli env"
  }
}
```

Then run:

```bash
npm run vault -- --template .env.tpl
```

## Configuration

### Environment Variables

```bash
# Vault server address (required)
export VAULT_ADDR=https://vault.example.com

# Authentication - choose one:

# Option 1: Vault token
export VAULT_TOKEN=s.xxxxx

# Option 2: GitHub token
export GITHUB_TOKEN=ghp_xxxxx
```

## Basic Commands

### Simple Usage

```bash
vault-cli env --template .env.tpl
```

### With Output File

```bash
vault-cli env \
  --template .env.development.tpl \
  --output .env.development
```

### With Working Directory

```bash
vault-cli env \
  --template .env.tpl \
  --output .env \
  --working-dir /path/to/project
```

## Command Reference

```
vault-cli env [options]

Options:
-t, --template <path>      Path to template file (required)
-o, --output <path>        Path to output file (default: .env)
-w, --working-dir <dir>    Working directory (default: current)
-a, --auth <type>          Auth type: 'token' or 'github' (auto-detect)
-h, --help                 Show help message
-v, --version              Show version
```

## Template Files

Template files are simple text files where each line defines a secret reference:

```
VARIABLE_NAME=secret/path/in/vault
```

### KV v2 Template

```
POSTGRES_URL=postgres/prod/connection/url
REDIS_URL=cache/prod/redis/url
API_TOKEN=services/prod/api/token
```

### KV v1 Template

```
POSTGRES_URL=postgres/prod/connection/url
REDIS_URL=cache/prod/redis/url
API_TOKEN=services/prod/api/token
```

## Common Workflows

### Development Environment

```bash
# Setup once
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=s.xxxx

# Generate .env before starting
vault-cli env --template .env.development.tpl --output .env

# Start development server
npm run dev
```

### NPM Script

```json
{
  "scripts": {
    "setup:dev": "vault-cli env -t .env.development.tpl",
    "setup:prod": "vault-cli env -t .env.production.tpl -o .env.prod",
    "dev": "npm run setup:dev && next dev",
    "build": "npm run setup:prod && next build",
    "start": "npm run setup:prod && next start"
  }
}
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to Vault

**Solutions**:
1. Verify Vault address is correct
2. Check network connectivity
3. Verify firewall rules
4. Check Vault server is running

### Authentication Issues

**Problem**: Token invalid or expired

**Solutions**:
1. Generate new token
2. Check token TTL
3. Verify token policies

### Path Issues

**Problem**: Secret not found at path

**Solutions**:
1. Verify correct KV version (v1 vs v2)
2. Check path format
3. Verify secret actually exists

## Support

For issues or questions:
- GitHub Issues: https://github.com/maksymmaliuk/vault-cli/issues
- Email: maksymmaliuk.dev@gmail.com
For issues or questions:
- GitHub Issues: https://github.com/maksymmaliuk/vault-cli/issues
- Email: maksymmaliuk.dev@gmail.com
