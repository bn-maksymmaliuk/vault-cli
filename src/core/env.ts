export type AppEnv = "development" | "staging" | "production";

export function resolveEnv(): AppEnv {
  if (process.env.GITHUB_ACTIONS === "true") {
    if (process.env.GITHUB_REF_TYPE === "tag") {
      return "production";
    }

    // Tag-based or main branch = production
    if (process.env.GITHUB_REF_NAME?.startsWith("v")) {
      return "production";
    }

    // Main branch = staging
    if (process.env.GITHUB_REF_NAME === "main") {
      return "staging";
    }

    // Other branches = development
    return "development";
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}
