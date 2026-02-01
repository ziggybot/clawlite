import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface LLMProviderConfig {
  provider: "ollama" | "groq";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface Config {
  llm: {
    primary: LLMProviderConfig;
    fallback?: LLMProviderConfig;
    maxContextTokens: number;
    compactThreshold: number;
  };
  tools: {
    shell: { enabled: boolean; workingDir: string; timeout: number };
    files: { enabled: boolean; allowedPaths: string[] };
  };
  safety: {
    blockedPatterns: string[];
    requireApproval: boolean;
  };
  session: {
    dir: string;
  };
}

const DEFAULTS: Config = {
  llm: {
    primary: { provider: "ollama", model: "qwen2.5:32b" },
    fallback: undefined,
    maxContextTokens: 16384,
    compactThreshold: 0.8,
  },
  tools: {
    shell: { enabled: true, workingDir: ".", timeout: 30000 },
    files: { enabled: true, allowedPaths: ["."] },
  },
  safety: {
    blockedPatterns: [
      "rm -rf /",
      "mkfs",
      "> /dev/sd",
      "dd if=",
      ":(){:|:&};:",
    ],
    requireApproval: true,
  },
  session: {
    dir: ".clawlite/sessions",
  },
};

export function loadConfig(path?: string): Config {
  const configPath = path || resolve("clawlite.config.json");

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const user = JSON.parse(raw);
      return deepMerge(DEFAULTS, user) as Config;
    } catch (e) {
      console.error(`Failed to parse config at ${configPath}, using defaults`);
    }
  }

  return DEFAULTS;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key in override) {
    const val = override[key];
    if (val && typeof val === "object" && !Array.isArray(val) && typeof base[key] === "object") {
      result[key] = deepMerge(base[key], val);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}
