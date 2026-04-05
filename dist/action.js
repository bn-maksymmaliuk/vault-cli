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
      throw new Error(errorMessage, { cause: err });
    }
    if (err instanceof Error) {
      throw new Error(`GitHub auth failed: ${err.message}`, { cause: err });
    }
    throw new Error("GitHub auth failed: unknown error", { cause: err });
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
      `Invalid VAULT_ADDR: "${url}" - ${err instanceof Error ? err.message : "Invalid URL format"}`,
      { cause: err }
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
    this.client = import_axios2.default.create({
      baseURL: `${addr}/v1`,
      headers: {
        "X-Vault-Token": token
      }
    });
  }
  client;
  kvVersionCache = /* @__PURE__ */ new Map();
  /**
   * Determines KV version via sys/mounts API.
   * Falls back to probing both KV versions if sys/mounts is not accessible (403).
   *
   * mountPath — first segment of the secret path, e.g. "projects" or "infrastructure"
   */
  async detectKVVersion(mountPath) {
    const cached = this.kvVersionCache.get(mountPath);
    if (cached) {
      return cached;
    }
    try {
      const res = await this.client.get(`/sys/mounts/${mountPath}`);
      const options = res.data?.options ?? res.data?.data?.options;
      const version = options?.version;
      const detected = version === "2" ? "v2" : "v1";
      this.kvVersionCache.set(mountPath, detected);
      return detected;
    } catch {
    }
    try {
      const res = await this.client.get(`/sys/internal/ui/mounts/${mountPath}`);
      const version = res.data?.data?.options?.version;
      const detected = version === "2" ? "v2" : "v1";
      this.kvVersionCache.set(mountPath, detected);
      return detected;
    } catch {
    }
    this.kvVersionCache.set(mountPath, "unknown");
    return "unknown";
  }
  /**
   * Build the actual API path for reading a secret based on KV version
   * KV v2: mount/data/path/to/secret
   * KV v1: mount/path/to/secret
   */
  buildReadPath(secretPath, kvVersion) {
    const parts = secretPath.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error(
        `Invalid secret path format: "${secretPath}" - expected "mount/path/to/secret"`
      );
    }
    const mount = parts[0];
    const restPath = parts.slice(1).join("/");
    return kvVersion === "v2" ? `${mount}/data/${restPath}` : `${mount}/${restPath}`;
  }
  /**
   * Fetch secret supporting both KV v1 and KV v2.
   * Input path format: mount/path/to/secret (without /data/)
   * When KV version cannot be determined, tries v1 then v2 automatically.
   */
  async getSecret(secretPath, key) {
    try {
      const mount = secretPath.split("/")[0];
      if (!mount) {
        throw new Error(`Invalid secret path: "${secretPath}"`);
      }
      const kvVersion = await this.detectKVVersion(mount);
      if (kvVersion === "v1" || kvVersion === "v2") {
        const readPath = this.buildReadPath(secretPath, kvVersion);
        const value = kvVersion === "v2" ? await this.getSecretV2(readPath, key) : await this.getSecretV1(readPath, key);
        if (typeof value !== "string") {
          throw new Error(
            `Key "${key}" value is not a string at path: ${secretPath} (got ${typeof value})`
          );
        }
        this.kvVersionCache.set(mount, kvVersion);
        return value;
      }
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
        const v2Path = this.buildReadPath(secretPath, "v2");
        try {
          const value = await this.getSecretV2(v2Path, key);
          if (typeof value !== "string") {
            throw new Error(
              `Key "${key}" value is not a string at path: ${secretPath} (got ${typeof value})`,
              { cause: v1Err }
            );
          }
          this.kvVersionCache.set(mount, "v2");
          return value;
        } catch (v2Err) {
          throw v1Err;
        }
      }
    } catch (err) {
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
  async getKVVersion(mountPath) {
    return this.detectKVVersion(mountPath);
  }
};

// src/core/logger.ts
var import_chalk = __toESM(require("chalk"));
var import_ora = __toESM(require("ora"));
var log = {
  /** Header banner */
  banner() {
    console.log();
    console.log(import_chalk.default.hex("#FFD700").bold("  \u25C6 vault-cli"));
    console.log(import_chalk.default.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  },
  /** Key-value info line */
  info(label, value) {
    console.log(`  ${import_chalk.default.dim(label + ":")} ${import_chalk.default.cyan(value)}`);
  },
  /** Verbose debug line */
  verbose(msg) {
    console.log(`  ${import_chalk.default.dim("\u203A")} ${import_chalk.default.gray(msg)}`);
  },
  /** Section divider */
  divider() {
    console.log(import_chalk.default.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  },
  /** Success message */
  success(msg) {
    console.log();
    console.log(`  ${import_chalk.default.green("\u2714")} ${import_chalk.default.green(msg)}`);
    console.log();
  },
  /** Error message */
  error(msg) {
    console.log();
    console.log(`  ${import_chalk.default.red("\u2716")} ${import_chalk.default.red(msg)}`);
    console.log();
  },
  /** Warning message */
  warn(msg) {
    console.log(`  ${import_chalk.default.yellow("\u26A0")} ${import_chalk.default.yellow(msg)}`);
  },
  /** Start a spinner — available for future use */
  spinner(text) {
    return (0, import_ora.default)({
      text: import_chalk.default.dim(text),
      prefixText: "  ",
      color: "yellow"
    }).start();
  },
  /** Per-secret success line */
  secretOk(key, path2) {
    console.log(
      `  ${import_chalk.default.green("\u2714")} ${import_chalk.default.white(key.padEnd(24))} ${import_chalk.default.dim("\u2190")} ${import_chalk.default.dim(path2)}`
    );
  },
  /** Per-secret failure line */
  secretFail(key, path2, reason) {
    console.log(
      `  ${import_chalk.default.red("\u2716")} ${import_chalk.default.white(key.padEnd(24))} ${import_chalk.default.dim("\u2190")} ${import_chalk.default.dim(path2)}`
    );
    console.log(`    ${import_chalk.default.red(reason)}`);
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
  if (verbose) {
    log.divider();
    const uniqueMounts = [...new Set(entries.map((e) => e.path.split("/")[0]))];
    for (const mount of uniqueMounts) {
      try {
        const version = await client.getKVVersion(mount);
        log.verbose(`Mount "${mount}": KV ${version}`);
      } catch {
        log.verbose(`Mount "${mount}": version detection failed, will auto-detect`);
      }
    }
  }
  log.divider();
  const limit = (0, import_p_limit.default)(5);
  const errors = [];
  const results = await Promise.all(
    entries.map(
      (entry) => limit(async () => {
        try {
          const value = await client.getSecret(entry.path, entry.key);
          log.secretOk(entry.key, entry.path);
          return `${entry.key}=${value}`;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const fullMsg = `Failed to load secret for key "${entry.key}": ${errorMsg}`;
          log.secretFail(entry.key, entry.path, errorMsg);
          errors.push(fullMsg);
          throw new Error(fullMsg, { cause: err });
        }
      })
    )
  );
  const envContent = results.join("\n") + "\n";
  import_fs.default.writeFileSync(outputPath, envContent);
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
    if (!vaultAddr) {
      throw new Error("Input 'addr' is required");
    }
    if (!templateInput) {
      throw new Error("Input 'template' is required");
    }
    const templatePath = import_path.default.resolve(workspaceDir, templateInput);
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
