import { TemplateEntry } from "../types";

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function parseTemplate(content: string): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  const seenKeys = new Set<string>();
  let lineNumber = 0;

  const lines = content.split("\n");

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      throw new Error(`Invalid line ${lineNumber}: "${trimmed}" - missing '=' separator`);
    }

    const key = trimmed.slice(0, index).trim();
    const path = trimmed.slice(index + 1).trim();

    if (!key) {
      throw new Error(`Invalid line ${lineNumber}: empty key before '='`);
    }

    if (!path) {
      throw new Error(`Invalid line ${lineNumber}: empty Vault path after '='`);
    }

    // Validate ENV key format
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(
        `Invalid line ${lineNumber}: key "${key}" must match pattern ^[A-Z_][A-Z0-9_]*$`
      );
    }

    // Check for duplicate keys
    if (seenKeys.has(key)) {
      throw new Error(`Invalid line ${lineNumber}: duplicate key "${key}"`);
    }

    seenKeys.add(key);

    entries.push({
      key,
      path,
    });
  }

  if (entries.length === 0) {
    throw new Error("Template file is empty or contains only comments");
  }

  return entries;
}
