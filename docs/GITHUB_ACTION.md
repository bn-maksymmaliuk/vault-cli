# GitHub Action Guide

Complete guide for using Vault CLI as a GitHub Action in your workflows.

## Overview

Vault CLI can be used directly in GitHub Actions workflows to automatically fetch secrets from HashiCorp Vault and inject them into your environment or generate configuration files.

## Quick Start

### Basic Workflow

```yaml
name: Using Vault CLI

on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate environment from Vault
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: https://vault.example.com
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.production.tpl
          output: .env
      
      - name: Deploy with secrets
        run: npm run deploy
```

## Input Parameters

### Required Inputs

#### `addr`
Vault server address.

```yaml
with:
  addr: https://vault.example.com
```

#### `template`
Path to the template file containing secret references.

```yaml
with:
  template: .env.production.tpl
```

### Optional Inputs

#### `token`
Vault authentication token. If not provided, defaults to `GITHUB_TOKEN` if available.

```yaml
with:
  token: ${{ secrets.VAULT_TOKEN }}
```

#### `github-token`
GitHub token for GitHub-based authentication to Vault. Uses `secrets.GITHUB_TOKEN` by default if no token is specified.

```yaml
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

#### `output`
Path where the generated environment file will be saved. Defaults to `.env`.

```yaml
with:
  output: .env.production
```

#### `working-dir`
Working directory for the action. Defaults to `GITHUB_WORKSPACE`.

```yaml
with:
  working-dir: ${{ github.workspace }}/backend
```

## Authentication Methods

### Method 1: Vault Token (Recommended)

Most secure and recommended for CI/CD:

```yaml
- uses: maksymmaliuk/vault-cli@latest
  with:
    addr: ${{ secrets.VAULT_ADDR }}
    token: ${{ secrets.VAULT_TOKEN }}
    template: .env.tpl
```

**Setup:**
1. Generate a Vault token with appropriate policies
2. Add `VAULT_ADDR` and `VAULT_TOKEN` to GitHub Secrets
3. Use in workflow as shown above

### Method 2: GitHub Token Authentication

Requires GitHub auth method configured in Vault:

```yaml
- uses: maksymmaliuk/vault-cli@latest
  with:
    addr: ${{ secrets.VAULT_ADDR }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    template: .env.tpl
```

**Setup:**
1. Configure GitHub auth method in Vault
2. Create appropriate Vault policies for GitHub
3. Use in workflow as shown above

### Method 3: Auto-Detection (Default)

The action automatically uses available tokens:

```yaml
- uses: maksymmaliuk/vault-cli@latest
  with:
    addr: ${{ secrets.VAULT_ADDR }}
    template: .env.tpl
```

Priority order:
1. `VAULT_TOKEN` environment variable
2. `GITHUB_TOKEN` (if GitHub auth is configured in Vault)
3. Token passed via `token` input

## Template Files

Template files define which secrets to fetch from Vault. They contain environment variable names and secret paths.

### Template Format

```
ENV_VAR_NAME=secret/path/in/vault
ANOTHER_VAR=other/secret/path
```

### KV v2 Example

```
# Template: .env.production.tpl
DB_HOST=secret/data/prod/database/host
DB_USER=secret/data/prod/database/user
DB_PASSWORD=secret/data/prod/database/password
API_KEY=secret/data/prod/integrations/api/key
JWT_SECRET=secret/data/prod/auth/jwt_secret
```

Generated `.env` file:

```
DB_HOST=postgres.example.com
DB_USER=admin
DB_PASSWORD=secure_password_123
API_KEY=sk_live_xxxxx
JWT_SECRET=jwt_secret_key
```

### KV v1 Example

```
# Template: .env.staging.tpl
DATABASE_URL=postgres/staging/url
REDIS_URL=redis/staging/url
API_TOKEN=services/staging/api_token
```

### Best Practices for Templates

1. **Use descriptive names**: Make it clear what each variable is for
2. **Environment-specific templates**: Create separate templates per environment
   - `.env.development.tpl`
   - `.env.staging.tpl`
   - `.env.production.tpl`
3. **Comments are safe**: You can add comments to templates
   ```
   # Database configuration
   DB_HOST=secret/data/prod/db/host
   DB_PASSWORD=secret/data/prod/db/password
   ```
4. **Never include sensitive values**: Only include secret paths

## Complete Workflow Examples

### Example 1: Simple Deployment

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate .env from Vault
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: ${{ secrets.VAULT_ADDR }}
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.production.tpl
          output: .env
      
      - name: Deploy
        run: npm run deploy
```

### Example 2: Multi-Environment

```yaml
name: Deploy to All Environments

on:
  push:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        env: [development, staging, production]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate .env.${{ matrix.env }}
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: ${{ secrets.VAULT_ADDR }}
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.${{ matrix.env }}.tpl
          output: .env.${{ matrix.env }}
      
      - name: Deploy to ${{ matrix.env }}
        run: npm run deploy:${{ matrix.env }}
        env:
          ENV: ${{ matrix.env }}
```

### Example 3: Docker Build with Secrets

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate build secrets
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: ${{ secrets.VAULT_ADDR }}
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.docker.tpl
          output: .env.docker
      
      - name: Build Docker image
        run: |
          docker build \
            --env-file .env.docker \
            -t myapp:latest .
      
      - name: Push to registry
        run: docker push myapp:latest
```

### Example 4: Testing with Multiple Configurations

```yaml
name: Test with Vault Secrets

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      
      - name: Generate test environment
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: ${{ secrets.VAULT_ADDR }}
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.test.tpl
          output: .env.test
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
```

### Example 5: Pull Request with Generated Secrets

```yaml
name: Update Secrets from Vault

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate .env.prod
        uses: maksymmaliuk/vault-cli@latest
        with:
          addr: ${{ secrets.VAULT_ADDR }}
          token: ${{ secrets.VAULT_TOKEN }}
          template: .env.production.tpl
          output: .env.prod.generated
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          commit-message: 'chore: update secrets from Vault'
          title: 'Update secrets from Vault'
          body: |
            This PR updates environment variables from Vault.
            
            **Auto-generated by vault-cli action**
          branch: chore/update-vault-secrets
          delete-branch: true
```

## Error Handling

### Common Errors and Solutions

#### Error: `Failed to fetch secret: Secret not found`

**Cause**: The secret path doesn't exist in Vault.

**Solution**: Verify the secret exists:
```bash
vault read secret/data/prod/database/host  # KV v2
vault read postgres/prod/host              # KV v1
```

#### Error: `Permission denied`

**Cause**: The token doesn't have permission to read the secret.

**Solution**: Check token policies:
```bash
vault token lookup
vault policy read your-policy
```

#### Error: `Invalid path format`

**Cause**: Secret path is malformed.

**Solution**: Ensure your template has correct format:
```
# Correct
DB_HOST=secret/data/prod/database/host

# Incorrect (extra slashes or quotes)
DB_HOST="secret/data/prod/database/host"
DB_HOST=secret/data/prod/database/host/
```

#### Error: `Template file not found`

**Cause**: The template file doesn't exist in the repository.

**Solution**: Verify the template file:
```bash
ls -la .env.production.tpl
```

## Security Best Practices

### 1. Secret Management

✅ **Do:**
- Store Vault tokens as GitHub Secrets
- Create environment-specific tokens
- Use principle of least privilege

❌ **Don't:**
- Commit `.env` files to repository
- Log sensitive values
- Use overly permissive Vault policies

### 2. Workflow Security

```yaml
# Good: Use GitHub Secrets
with:
  token: ${{ secrets.VAULT_TOKEN }}

# Bad: Never hardcode secrets
with:
  token: s.xxxxx
```

### 3. File Security

```bash
# Add to .gitignore
.env
.env.*
!.env.*.tpl  # Template files are safe to commit

# Generated files should be temporary
output: /tmp/.env
```

### 4. Token Rotation

Regularly rotate Vault tokens:

```bash
# Generate new token
vault token create -policy="your-policy" -ttl=168h

# Update GitHub Secret
# Update workflow with new token
```

### 5. Audit Logging

Enable audit logging in Vault:

```bash
vault audit enable file file_path=/var/log/vault-audit.log
```

## Troubleshooting

### Debug Mode

Add debugging to understand action behavior:

```yaml
- uses: maksymmaliuk/vault-cli@latest
  with:
    addr: ${{ secrets.VAULT_ADDR }}
    token: ${{ secrets.VAULT_TOKEN }}
    template: .env.tpl
  env:
    DEBUG: 'true'
```

### Check Action Logs

1. Go to your repository
2. Click "Actions" tab
3. Select the workflow run
4. View "Generate environment from Vault" step logs

### Test Locally

Test your template locally before pushing:

```bash
# Set environment variables
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=your-token

# Run CLI
vault-cli env --template .env.production.tpl
```

### Validate Vault Connectivity

```bash
# Test Vault access
curl -X GET \
  -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/secret/data/prod/test"
```

## FAQ

**Q: Can I use Vault CLI in private repositories?**
A: Yes, the action works the same in public and private repositories.

**Q: What if Vault is behind a firewall?**
A: As long as GitHub Actions runner can access Vault, it will work. Consider using self-hosted runners if needed.

**Q: Can I use multiple templates?**
A: Currently, you need to call the action multiple times for multiple templates. Each call can have different output files.

**Q: Is the action free?**
A: Yes, it's open source and free to use.

**Q: How often should I rotate tokens?**
A: Rotate tokens at least quarterly, or more frequently for critical environments.

## Additional Resources

- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Project Repository](https://github.com/maksymmaliuk/vault-cli)

## Support

For issues or questions:
- [Open an Issue](https://github.com/maksymmaliuk/vault-cli/issues)
- [Email Support](mailto:maksymmaliuk.dev@gmail.com)

