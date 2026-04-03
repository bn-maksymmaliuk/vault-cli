import fs from "fs";
import pLimit from "p-limit";
import { parseTemplate } from "./parser";
import { VaultClient } from "./vault";
import { log } from "./logger";
import { GenerateEnvOptions } from "../types";

export async function generateEnv(
  options: GenerateEnvOptions
): Promise<void> {
  const { templatePath, outputPath, vaultAddr, vaultToken, verbose } = options;

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, "utf-8");
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

  const limit = pLimit(5);
  const errors: string[] = [];

  const results = await Promise.all(
    entries.map((entry) =>
      limit(async () => {
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
  fs.writeFileSync(outputPath, envContent);
}
