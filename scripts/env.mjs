// Minimal .env.local reader for Node scripts (no dependency).
import { existsSync, readFileSync } from "node:fs";

export function loadEnv() {
  const env = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) continue;
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
