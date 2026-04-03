import axios, { AxiosInstance } from "axios";
import { KVVersion } from "../types";

/**
 * VaultClient handles all communication with HashiCorp Vault
 * Supports both KV v1 and v2 secret engines with automatic version detection
 *
 * Path Format (user-facing - without /data/):
 *   KV v1: mount/path/to/secret
 *   KV v2: mount/path/to/secret
 *
 * Examples:
 *   - projects/test/dev (both KV v1 and v2)
 *   - postgres/prod/credentials
 *   - services/staging/api_keys
 *
 * Internally, paths are automatically expanded:
 *   KV v1: GET /v1/mount/path/to/secret
 *   KV v2: GET /v1/mount/data/path/to/secret
 *
 * The /data/ component is added automatically for KV v2, hidden from users
 */

export class VaultClient {
  private client: AxiosInstance;
  private kvVersionCache: Map<string, KVVersion> = new Map();

  constructor(
    private readonly addr: string,
    private readonly token: string
  ) {
    this.client = axios.create({
      baseURL: `${addr}/v1`,
      headers: {
        "X-Vault-Token": token,
      },
    });
  }

  /**
   * Determines KV version via sys/mounts API.
   * Falls back to probing both KV versions if sys/mounts is not accessible (403).
   *
   * mountPath — first segment of the secret path, e.g. "projects" or "infrastructure"
   */
  private async detectKVVersion(mountPath: string): Promise<KVVersion> {
    const cached = this.kvVersionCache.get(mountPath);
    if (cached) {
      return cached;
    }

    // 1. Try the official sys/mounts endpoint (requires sys/mounts:read policy)
    try {
      const res = await this.client.get(`/sys/mounts/${mountPath}`);
      const options = res.data?.options ?? res.data?.data?.options;
      const version: string | undefined = options?.version;
      const detected: KVVersion = version === "2" ? "v2" : "v1";
      this.kvVersionCache.set(mountPath, detected);
      return detected;
    } catch {
      // sys/mounts not accessible — proceed to probe
    }

    // 2. Probe: try KV v1 first (direct read without /data/)
    //    KV v1 responds with { data: { ... } }
    //    KV v2 responds with { data: { data: { ... }, metadata: { ... } } }
    //    We can't probe without a real path, so try sys/internal/ui/mounts
    try {
      const res = await this.client.get(`/sys/internal/ui/mounts/${mountPath}`);
      const version: string | undefined = res.data?.data?.options?.version;
      const detected: KVVersion = version === "2" ? "v2" : "v1";
      this.kvVersionCache.set(mountPath, detected);
      return detected;
    } catch {
      // Not accessible either — use response-shape probing below
    }

    // 3. Last resort: default to v1, let getSecret try v1 first then v2
    //    (handled in getSecret via tryBothVersions)
    this.kvVersionCache.set(mountPath, "unknown" as KVVersion);
    return "unknown" as KVVersion;
  }

  /**
   * Build the actual API path for reading a secret based on KV version
   * KV v2: mount/data/path/to/secret
   * KV v1: mount/path/to/secret
   */
  private buildReadPath(secretPath: string, kvVersion: KVVersion): string {
    const parts = secretPath.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error(
        `Invalid secret path format: "${secretPath}" - expected "mount/path/to/secret"`
      );
    }

    const mount = parts[0];
    const restPath = parts.slice(1).join("/");

    // For KV v2, add /data/ after mount
    return kvVersion === "v2" ? `${mount}/data/${restPath}` : `${mount}/${restPath}`;
  }

  /**
   * Fetch secret supporting both KV v1 and KV v2.
   * Input path format: mount/path/to/secret (without /data/)
   * When KV version cannot be determined, tries v1 then v2 automatically.
   */
  async getSecret(secretPath: string, key: string): Promise<string> {
    try {
      const mount = secretPath.split("/")[0];
      if (!mount) {
        throw new Error(`Invalid secret path: "${secretPath}"`);
      }

      const kvVersion = await this.detectKVVersion(mount);

      // If version detected — use it directly
      if (kvVersion === "v1" || kvVersion === "v2") {
        const readPath = this.buildReadPath(secretPath, kvVersion);
        const value = kvVersion === "v2"
          ? await this.getSecretV2(readPath, key)
          : await this.getSecretV1(readPath, key);

        if (typeof value !== "string") {
          throw new Error(
            `Key "${key}" value is not a string at path: ${secretPath} (got ${typeof value})`
          );
        }

        // Cache the confirmed version
        this.kvVersionCache.set(mount, kvVersion);
        return value;
      }

      // Version unknown — probe: try v1 first, then v2
      const v1Path = this.buildReadPath(secretPath, "v1");
      try {
        const value = await this.getSecretV1(v1Path, key);
        if (typeof value !== "string") {
          throw new Error(
            `Key "${key}" value is not a string at path: ${secretPath} (got ${typeof value})`
          );
        }
        this.kvVersionCache.set(mount, "v1");
        return value;
      } catch (v1Err) {
        // v1 failed — try v2
        const v2Path = this.buildReadPath(secretPath, "v2");
        try {
          const value = await this.getSecretV2(v2Path, key);
          if (typeof value !== "string") {
            throw new Error(
              `Key "${key}" value is not a string at path: ${secretPath} (got ${typeof value})`, { cause: v1Err }
            );
          }
          this.kvVersionCache.set(mount, "v2");
          return value;
        } catch (v2Err) {
          // Both failed — report v1 error as it's more likely the intended version
          throw v1Err;
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(`Failed to fetch secret "${secretPath}" with key "${key}": ${err.message}`, { cause: err });
      }
      throw err;
    }
  }

  /**
   * Fetch secret from KV v2 store
   * Structure: { data: { data: { key: value }, metadata: {...} } }
   */
  private async getSecretV2(basePath: string, key: string): Promise<unknown> {
    try {
      const res = await this.client.get(basePath);
      const secretData = res.data?.data?.data;

      if (!secretData || typeof secretData !== "object") {
        throw new Error(`Invalid KV v2 response structure at path: ${basePath}`);
      }

      if (!(key in secretData)) {
        throw new Error(`Key "${key}" not found in KV v2 secret at: ${basePath}`);
      }

      return secretData[key];
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new Error(`Secret not found at path: ${basePath}`, { cause: err });
        }
        if (err.response?.status === 403) {
          throw new Error(`Permission denied accessing: ${basePath}`, { cause: err });
        }
      }
      throw err;
    }
  }

  /**
   * Fetch secret from KV v1 store
   * Structure: { data: { key: value }, lease_id: "...", ... }
   */
  private async getSecretV1(basePath: string, key: string): Promise<unknown> {
    try {
      const res = await this.client.get(basePath);
      const secretData = res.data?.data;

      if (!secretData || typeof secretData !== "object") {
        throw new Error(`Invalid KV v1 response structure at path: ${basePath}`);
      }

      if (!(key in secretData)) {
        throw new Error(`Key "${key}" not found in KV v1 secret at: ${basePath}`);
      }

      return secretData[key];
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new Error(`Secret not found at path: ${basePath}`, { cause: err });
        }
        if (err.response?.status === 403) {
          throw new Error(`Permission denied accessing: ${basePath}`, { cause: err });
        }
      }
      throw err;
    }
  }

  /**
   * Get detected KV version for a mount (for debugging/logging)
   */
  async getKVVersion(mountPath: string): Promise<KVVersion> {
    return this.detectKVVersion(mountPath);
  }
}
