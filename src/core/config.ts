import { ResolveConfigOptions, VaultConfig } from "../types";
import { exchangeGithubToken } from "./githubAuth";

// Simple in-memory cache for GitHub token exchange results
// Cache key: `{addr}:{githubToken}`
const tokenCache = new Map<string, string>();

function validateVaultUrl(url: string): void {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Vault URL must use http or https protocol");
    }
  } catch (err) {
    throw new Error(
      `Invalid VAULT_ADDR: "${url}" - ${err instanceof Error ? err.message : "Invalid URL format"}`, { cause: err }
    );
  }
}

export async function resolveVaultConfig(
  opts: ResolveConfigOptions
): Promise<VaultConfig> {
  const addr = opts.addr || process.env.VAULT_ADDR;

  if (!addr) {
    throw new Error("VAULT_ADDR is required");
  }

  // Validate URL format
  validateVaultUrl(addr);

  const directToken = opts.token || process.env.VAULT_TOKEN;

  if (directToken) {
    return {
      addr,
      token: directToken,
    };
  }

  const githubToken = opts.githubToken || process.env.GITHUB_TOKEN;

  if (githubToken) {
    // Check cache first
    const cacheKey = `${addr}:${githubToken}`;
    const cachedToken = tokenCache.get(cacheKey);

    if (cachedToken) {
      return {
        addr,
        token: cachedToken,
      };
    }

    // Exchange GitHub token for Vault token
    const token = await exchangeGithubToken(addr, githubToken);

    // Cache the result
    tokenCache.set(cacheKey, token);

    return {
      addr,
      token,
    };
  }

  throw new Error("No auth method found. Provide VAULT_TOKEN or GITHUB_TOKEN");
}
