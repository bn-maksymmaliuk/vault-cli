export type EnvKey = string;
export type VaultPath = string;
export type KVVersion = "v1" | "v2" | "unknown";

export interface TemplateEntry {
  key: EnvKey;
  path: VaultPath;
}

// KV v1 response - flat structure
export interface KVv1Response {
  data: Record<string, unknown>;
  lease_duration?: number;
  lease_id?: string;
  renewable?: boolean;
}

// KV v2 single value
export interface KVv2SingleValue {
  value: string;
}

// KV v2 response - nested structure
export interface KVv2Response<T> {
  data: {
    data: T;
    metadata: Record<string, unknown>;
  };
}

export interface GenerateEnvOptions {
  templatePath: string;
  outputPath: string;
  vaultAddr: string;
  vaultToken: string;
  verbose?: boolean;
}

export interface VaultConfig {
  addr: string;
  token: string;
}

export interface ResolveConfigOptions {
  addr?: string;
  token?: string;
  githubToken?: string;
}
