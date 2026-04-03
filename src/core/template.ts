import { AppEnv } from "./env";

export function resolveTemplate(env: AppEnv): string {
  const map: Record<AppEnv, string> = {
    development: ".env.development.tpl",
    staging: ".env.staging.tpl",
    production: ".env.production.tpl",
  };

  return map[env];
}
