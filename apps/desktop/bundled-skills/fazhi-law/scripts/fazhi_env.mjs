// fazhi_env.mjs - Environment configuration for Fazhi Law skill
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export function getConfigPath() {
  return join(homedir(), ".fazhi", "config");
}

export function getApiKey() {
  // 1. Environment variable takes priority
  if (process.env.FAZHI_LAW_API_KEY) {
    return process.env.FAZHI_LAW_API_KEY;
  }

  // 2. Try reading from ~/.fazhi/config
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf8");
    const match = content.match(/^FAZHI_LAW_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  return null;
}

/** Save the API key to ~/.fazhi/config so it can be reused on later runs. */
export function saveApiKey(apiKey) {
  if (!apiKey) {
    throw new Error("API key is required");
  }
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = `FAZHI_LAW_API_KEY=${apiKey}\n`;
  writeFileSync(configPath, content, { mode: 0o600 });
  return configPath;
}

export const BASE_URL = process.env.FAZHI_LAW_BASE_URL || "https://bizveris.kuaicha365.com/api_route/law_gpt";