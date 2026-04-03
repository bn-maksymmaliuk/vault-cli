#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/action.ts
var import_core = require("@actions/core");
var import_path = __toESM(require("path"));
var import_fs2 = __toESM(require("fs"));

// src/core/githubAuth.ts
var import_axios = __toESM(require("axios"));
async function exchangeGithubToken(addr, githubToken) {
  if (!addr) {
    throw new Error("Vault address (addr) is required");
  }
  if (!githubToken) {
    throw new Error("GitHub token is required");
  }
  try {
    const res = await import_axios.default.post(
      `${addr}/v1/auth/github/login`,
      { token: githubToken },
      {
        timeout: 5e3,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    const token = res.data?.auth?.client_token;
    if (!token) {
      throw new Error("Vault did not return a client_token");
    }
    return token;
  } catch (err) {
    if (import_axios.default.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      let errorMessage = `GitHub auth failed (${status ?? "no-status"})`;
      if (status === 401 || status === 403) {
        errorMessage += ": Invalid or expired GitHub token";
      } else if (status === 404) {
        errorMessage += ": Vault GitHub auth method not configured";
      } else if (status === 500 || status === 502 || status === 503) {
        errorMessage += ": Vault server error";
      }
      if (data) {
        try {
          errorMessage += `: ${JSON.stringify(data)}`;
        } catch {
          errorMessage += `: ${String(data)}`;
        }
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      }
      throw new Error(errorMessage);
    }
    if (err instanceof Error) {
      throw new Error(`GitHub auth failed: ${err.message}`);
    }
    throw new Error("GitHub auth failed: unknown error");
  }
}

// src/core/config.ts
var tokenCache = /* @__PURE__ */ new Map();
function validateVaultUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Vault URL must use http or https protocol");
    }
  } catch (err) {
    throw new Error(
      `Invalid VAULT_ADDR: "${url}" - ${err instanceof Error ? err.message : "Invalid URL format"}`
    );
  }
}
async function resolveVaultConfig(opts) {
  const addr = opts.addr || process.env.VAULT_ADDR;
  if (!addr) {
    throw new Error("VAULT_ADDR is required");
  }
  validateVaultUrl(addr);
  const directToken = opts.token || process.env.VAULT_TOKEN;
  if (directToken) {
    return {
      addr,
      token: directToken
    };
  }
  const githubToken = opts.githubToken || process.env.GITHUB_TOKEN;
  if (githubToken) {
    const cacheKey = `${addr}:${githubToken}`;
    const cachedToken = tokenCache.get(cacheKey);
    if (cachedToken) {
      return {
        addr,
        token: cachedToken
      };
    }
    const token = await exchangeGithubToken(addr, githubToken);
    tokenCache.set(cacheKey, token);
    return {
      addr,
      token
    };
  }
  throw new Error("No auth method found. Provide VAULT_TOKEN or GITHUB_TOKEN");
}

// src/core/generator.ts
var import_fs = __toESM(require("fs"));
var import_p_limit = __toESM(require("p-limit"));

// src/core/parser.ts
var ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
function parseTemplate(content) {
  const entries = [];
  const seenKeys = /* @__PURE__ */ new Set();
  let lineNumber = 0;
  const lines = content.split("\n");
  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      throw new Error(`Invalid line ${lineNumber}: "${trimmed}" - missing '=' separator`);
    }
    const key = trimmed.slice(0, index).trim();
    const path2 = trimmed.slice(index + 1).trim();
    if (!key) {
      throw new Error(`Invalid line ${lineNumber}: empty key before '='`);
    }
    if (!path2) {
      throw new Error(`Invalid line ${lineNumber}: empty Vault path after '='`);
    }
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(
        `Invalid line ${lineNumber}: key "${key}" must match pattern ^[A-Z_][A-Z0-9_]*$`
      );
    }
    if (seenKeys.has(key)) {
      throw new Error(`Invalid line ${lineNumber}: duplicate key "${key}"`);
    }
    seenKeys.add(key);
    entries.push({
      key,
      path: path2
    });
  }
  if (entries.length === 0) {
    throw new Error("Template file is empty or contains only comments");
  }
  return entries;
}

// src/core/vault.ts
var import_axios2 = __toESM(require("axios"));
var VaultClient = class {
  constructor(addr, token) {
    this.addr = addr;
    this.token = token;
    this.kvVersionCache = /* @__PURE__ */ new Map();
    this.client = import_axios2.default.create({
      baseURL: `${addr}/v1`,
      headers: {
        "X-Vault-Token": token
      }
    });
  }
  /**
   * Determines KV version by probing the mount path metadata
   * Tries both KV v1 and KV v2 patterns to detect the version
   */
  async detectKVVersion(mountPath) {
    const cached = this.kvVersionCache.get(mountPath);
    if (cached) {
      return cached;
    }
    try {
      const metadataPath = `${mountPath}/metadata`;
      try {
        await this.client.get(metadataPath);
        this.kvVersionCache.set(mountPath, "v2");
        return "v2";
      } catch (metadataErr) {
        if (metadataErr?.response?.status === 404) {
          this.kvVersionCache.set(mountPath, "v1");
          return "v1";
        }
        this.kvVersionCache.set(mountPath, "v2");
        return "v2";
      }
    } catch (err) {
      this.kvVersionCache.set(mountPath, "v2");
      return "v2";
    }
  }
  /**
   * Extract mount path and key from secret path
   * Examples:
   *   - secret/data/projects/api/db_url -> mount: secret, key: db_url, path: projects/api
   *   - kv/teams/backend/token -> mount: kv, key: token, path: teams/backend
   */
  parsePath(path2) {
    const parts = path2.split("/");
    if (parts.length < 2) {
      throw new Error(
        `Invalid path format: "${path2}" - expected format: "mount/path/to/key" or "mount/data/path/to/key"`
      );
    }
    const mount = parts[0];
    let basePath;
    let key;
    const dataIndex = parts.indexOf("data");
    if (dataIndex > 0) {
      basePath = parts.slice(0, dataIndex + 1).join("/");
      const pathParts = parts.slice(dataIndex + 1);
      key = pathParts.pop() || "";
      basePath = [basePath, ...pathParts].join("/");
    } else {
      const pathParts = parts.slice(1);
      key = pathParts.pop() || "";
      basePath = mount + (pathParts.length > 0 ? "/" + pathParts.join("/") : "");
    }
    if (!key) {
      throw new Error(`Invalid path format: "${path2}" - no key specified`);
    }
    return { mount, basePath, key };
  }
  /**
   * Extract mount path from secret path (first component)
   */
  extractMount(path2) {
    const parts = path2.split("/");
    return parts[0];
  }
  /**
   * Extract mount and basePath from secret path (for getSecret with separate key)
   */
  parsePathForSecret(path2) {
    const parts = path2.split("/");
    const mount = parts[0];
    const basePath = path2;
    return { mount, basePath };
  }
  /**
   * Fetch secret supporting both KV v1 and KV v2
   */
  async getSecret(path2, key) {
    try {
      const { mount, basePath } = this.parsePathForSecret(path2);
      const kvVersion = await this.detectKVVersion(mount);
      let value;
      if (kvVersion === "v2") {
        value = await this.getSecretV2(basePath, key);
      } else {
        value = await this.getSecretV1(basePath, key);
      }
      if (typeof value !== "string") {
        throw new Error(
          `Key "${key}" value is not a string at path: ${basePath} (got ${typeof value})`
        );
      }
      return value;
    } catch (err) {
      if (err instanceof Error) {
        throw new Error(`Failed to fetch secret "${path2}" with key "${key}": ${err.message}`);
      }
      throw err;
    }
  }
  /**
   * Fetch secret from KV v2 store
   * Structure: { data: { data: { key: value }, metadata: {...} } }
   */
  async getSecretV2(basePath, key) {
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
    } catch (err) {
      if (import_axios2.default.isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new Error(`Secret not found at path: ${basePath}`);
        }
        if (err.response?.status === 403) {
          throw new Error(`Permission denied accessing: ${basePath}`);
        }
      }
      throw err;
    }
  }
  /**
   * Fetch secret from KV v1 store
   * Structure: { data: { key: value }, lease_id: "...", ... }
   */
  async getSecretV1(basePath, key) {
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
    } catch (err) {
      if (import_axios2.default.isAxiosError(err)) {
        if (err.response?.status === 404) {
          throw new Error(`Secret not found at path: ${basePath}`);
        }
        if (err.response?.status === 403) {
          throw new Error(`Permission denied accessing: ${basePath}`);
        }
      }
      throw err;
    }
  }
  /**
   * Get detected KV version for a mount (for debugging/logging)
   */
  async getKVVersion(mountPath) {
    return this.detectKVVersion(mountPath);
  }
};

// src/core/generator.ts
async function generateEnv(options) {
  const { templatePath, outputPath, vaultAddr, vaultToken, verbose } = options;
  if (!import_fs.default.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const template = import_fs.default.readFileSync(templatePath, "utf-8");
  const entries = parseTemplate(template);
  const client = new VaultClient(vaultAddr, vaultToken);
  const uniqueMounts = /* @__PURE__ */ new Set();
  const detectedVersions = /* @__PURE__ */ new Map();
  if (verbose) {
    for (const entry of entries) {
      const mount = entry.path.split("/")[0];
      uniqueMounts.add(mount);
    }
    for (const mount of uniqueMounts) {
      try {
        const version = await client.getKVVersion(mount);
        detectedVersions.set(mount, version);
        console.log(`[VERBOSE] Mount "${mount}": KV ${version}`);
      } catch (err) {
        console.log(`[VERBOSE] Mount "${mount}": version detection failed, will auto-detect per secret`);
      }
    }
  }
  const limit = (0, import_p_limit.default)(5);
  const results = await Promise.all(
    entries.map(
      (entry) => limit(async () => {
        try {
          const value = await client.getSecret(entry.path, entry.key);
          return `${entry.key}=${value}`;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to load secret for key "${entry.key}": ${errorMsg}`);
        }
      })
    )
  );
  const envContent = results.join("\n") + "\n";
  import_fs.default.writeFileSync(outputPath, envContent);
}

// src/core/env.ts
function resolveEnv() {
  if (process.env.GITHUB_ACTIONS === "true") {
    if (process.env.GITHUB_REF_TYPE === "tag") {
      return "production";
    }
    if (process.env.GITHUB_REF_NAME === process.env.GITHUB_DEFAULT_BRANCH) {
      return "staging";
    }
    return "development";
  }
  return "development";
}

// src/action.ts
async function run() {
  try {
    const workspaceDir = (0, import_core.getInput)("working-dir") ?? process.env.GITHUB_WORKSPACE ?? process.cwd();
    const vaultAddr = (0, import_core.getInput)("addr");
    const vaultToken = (0, import_core.getInput)("token");
    const githubToken = (0, import_core.getInput)("github-token");
    const templateInput = (0, import_core.getInput)("template");
    const outputInput = (0, import_core.getInput)("output") ?? ".env";
    const env = resolveEnv();
    const templateName = templateInput || `.env.${env}.tpl`;
    if (!vaultAddr) {
      throw new Error("Input 'addr' is required");
    }
    const templatePath = import_path.default.resolve(workspaceDir, templateName);
    const outputPath = import_path.default.resolve(workspaceDir, outputInput);
    if (!import_fs2.default.existsSync(templatePath)) {
      throw new Error(`Template not found at: ${templatePath}`);
    }
    const { addr, token } = await resolveVaultConfig({
      addr: vaultAddr,
      token: vaultToken,
      githubToken
    });
    const dir = import_path.default.dirname(outputPath);
    if (!import_fs2.default.existsSync(dir)) {
      import_fs2.default.mkdirSync(dir, { recursive: true });
    }
    await generateEnv({
      templatePath,
      outputPath,
      vaultAddr: addr,
      vaultToken: token,
      verbose: false
    });
    console.log(`\u2714 .env generated at: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (0, import_core.setFailed)(message);
    process.exit(1);
  }
}
run().catch(console.error);
