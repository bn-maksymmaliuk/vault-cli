#!/usr/bin/env node

import { Command } from "commander";
import fs from "fs";
import path from "path";

import { resolveEnv } from "./core/env";
import { resolveTemplate } from "./core/template";
import { resolveVaultConfig } from "./core/config";
import { generateEnv } from "./core/generator";
import { log } from "./core/logger";

const program = new Command();

program
  .name("vault-cli")
  .description("Generate .env from Vault")
  .version("1.0.0");

program
  .command("env")
  .option("--addr <addr>")
  .option("--token <token>")
  .option("--github-token <token>")
  .option("-o, --output <path>", ".env")
  .option("--verbose", "Enable verbose output for debugging")
  .action(async (opts) => {
    const verbose = opts.verbose;

    try {
      const env = resolveEnv();
      const templateName = resolveTemplate(env);

      log.banner();
      log.info("Env", env);
      log.info("Template", templateName);

      if (verbose) {
        log.verbose(`NODE_ENV: ${process.env.NODE_ENV}`);
        log.verbose(`GITHUB_ACTIONS: ${process.env.GITHUB_ACTIONS}`);
        log.verbose(`GITHUB_REF_TYPE: ${process.env.GITHUB_REF_TYPE}`);
        log.verbose(`GITHUB_REF_NAME: ${process.env.GITHUB_REF_NAME}`);
      }

      const templatePath = path.resolve(process.cwd(), templateName);

      if (!fs.existsSync(templatePath)) {
        throw new Error(
          `Template not found: ${templatePath}\n` +
          `Expected file like: .env.${env}.tpl in project root`
        );
      }

      if (verbose) {
        log.verbose(`Template found at: ${templatePath}`);
      }

      const { addr, token } = await resolveVaultConfig({
        addr: opts.addr,
        token: opts.token,
        githubToken: opts.githubToken,
      });

      const authMethod = opts.token || process.env.VAULT_TOKEN
        ? "VAULT_TOKEN"
        : "GITHUB_TOKEN";

      log.info("Auth", authMethod);

      if (verbose) {
        log.verbose(`Vault address: ${addr}`);
      }

      const outputPath = opts.output ?? ".env";
      const resolvedOutputPath = path.resolve(process.cwd(), outputPath);

      const dir = path.dirname(resolvedOutputPath);
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          throw new Error(
            `Failed to create output directory "${dir}": ${err instanceof Error ? err.message : String(err)}`, { cause: err }
          );
        }
      }

      if (verbose) {
        log.verbose(`Output path: ${resolvedOutputPath}`);
      }

      await generateEnv({
        templatePath,
        outputPath: resolvedOutputPath,
        vaultAddr: addr,
        vaultToken: token,
        verbose,
      });

      const relativePath = path.relative(process.cwd(), resolvedOutputPath);
      log.success(`.env written → ${relativePath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
