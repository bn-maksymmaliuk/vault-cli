#!/usr/bin/env node

import { getInput, setFailed } from "@actions/core";
import path from "path";
import fs from "fs";
import { resolveVaultConfig } from "./core/config";
import { generateEnv } from "./core/generator";

/**
 * Executes as GitHub Action entrypoint
 * Reads inputs from action.yml and generates .env file
 */
async function run(): Promise<void> {
  try {
    // Get inputs from action.yml
    const workspaceDir = getInput("working-dir") ?? process.env.GITHUB_WORKSPACE ?? process.cwd();
    const vaultAddr = getInput("addr");
    const vaultToken = getInput("token");
    const githubToken = getInput("github-token");
    const templateInput = getInput("template");
    const outputInput = getInput("output") ?? ".env";

    // Validate required inputs
    if (!vaultAddr) {
      throw new Error("Input 'addr' is required");
    }
    if (!templateInput) {
      throw new Error("Input 'template' is required");
    }

    // Resolve paths
    const templatePath = path.resolve(workspaceDir, templateInput);
    const outputPath = path.resolve(workspaceDir, outputInput);

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found at: ${templatePath}`);
    }

    // Resolve Vault configuration
    const { addr, token } = await resolveVaultConfig({
      addr: vaultAddr,
      token: vaultToken,
      githubToken: githubToken,
    });

    // Create output directory if needed
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate .env file
    await generateEnv({
      templatePath,
      outputPath,
      vaultAddr: addr,
      vaultToken: token,
      verbose: false,
    });

    console.log(`✔ .env generated at: ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setFailed(message);
    process.exit(1);
  }
}

run().catch(console.error);

