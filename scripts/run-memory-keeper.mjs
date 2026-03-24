import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import {
  APP_ROOT,
  APP_CONFIG_PATH,
  DEFAULT_APP_CONFIG,
  ensureArchiveRegistry,
  saveAppConfig
} from "./archive-layout.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function log(message) {
  output.write(`${String(message)}\n`);
}

async function loadAppConfig() {
  const raw = JSON.parse(await readFile(APP_CONFIG_PATH, "utf8"));
  return {
    ...DEFAULT_APP_CONFIG,
    ...raw
  };
}

async function validateOpenRouterApiKey(apiKey) {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    return { working: false, message: "OpenRouter API key is required." };
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/key", {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        "X-Title": "Memory Keeper"
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        working: false,
        message: `OpenRouter key check failed (${response.status}).${detail ? ` ${detail.slice(0, 300)}` : ""}`.trim()
      };
    }
    return { working: true, message: "OpenRouter key working." };
  } catch (error) {
    return {
      working: false,
      message: error?.message || String(error)
    };
  }
}

async function validateAssemblyAiApiKey(apiKey) {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    return { working: false, message: "AssemblyAI API key is empty." };
  }
  try {
    const endpoint = new URL("https://streaming.assemblyai.com/v3/token");
    endpoint.searchParams.set("expires_in_seconds", "60");
    endpoint.searchParams.set("max_session_duration_seconds", "300");
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: trimmed
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        working: false,
        message: `AssemblyAI key check failed (${response.status}).${detail ? ` ${detail.slice(0, 300)}` : ""}`.trim()
      };
    }
    return { working: true, message: "AssemblyAI key working." };
  } catch (error) {
    return {
      working: false,
      message: error?.message || String(error)
    };
  }
}

async function ensureKeys(config) {
  const rl = readline.createInterface({ input, output });
  try {
    let changed = false;
    let openRouterApiKey = String(config.openRouterApiKey || "").trim();
    if (openRouterApiKey) {
      const validation = await validateOpenRouterApiKey(openRouterApiKey);
      if (!validation.working) {
        log(`Saved OpenRouter API key did not validate: ${validation.message}`);
        openRouterApiKey = "";
      }
    }
    while (!openRouterApiKey) {
      const value = (await rl.question("OpenRouter API key: ")).trim();
      const validation = await validateOpenRouterApiKey(value);
      if (!validation.working) {
        log(`That key did not work: ${validation.message}`);
        continue;
      }
      openRouterApiKey = value;
      changed = true;
    }
    config.openRouterApiKey = openRouterApiKey || null;
    let assemblyAiApiKey = String(config.assemblyAiApiKey || "").trim();
    if (assemblyAiApiKey) {
      const validation = await validateAssemblyAiApiKey(assemblyAiApiKey);
      if (!validation.working) {
        log(`Saved AssemblyAI API key did not validate: ${validation.message}`);
        assemblyAiApiKey = "";
      }
    }
    while (true) {
      if (!assemblyAiApiKey) {
        const value = (await rl.question("AssemblyAI API key (optional, used for voice input, leave blank to skip): ")).trim();
        if (!value) {
          assemblyAiApiKey = "";
          if (String(config.assemblyAiApiKey || "").trim()) {
            changed = true;
          }
          break;
        }
        const validation = await validateAssemblyAiApiKey(value);
        if (!validation.working) {
          log(`That AssemblyAI key did not work: ${validation.message}`);
          continue;
        }
        assemblyAiApiKey = value;
        changed = true;
        break;
      }
      break;
    }
    config.assemblyAiApiKey = assemblyAiApiKey || null;
    if (changed) {
      await saveAppConfig(config);
    }
  } finally {
    rl.close();
  }
}

async function ensureArchiveTemplateExists() {
  await ensureArchiveRegistry();
}

async function main() {
  await ensureArchiveRegistry();
  const config = await loadAppConfig();
  await ensureKeys(config);
  await ensureArchiveTemplateExists();

  const port = Number(config.port || DEFAULT_APP_CONFIG.port) || DEFAULT_APP_CONFIG.port;
  output.write(`\nStarting Memory Keeper on http://127.0.0.1:${port}\n`);
  output.write("Open that page in your browser. Memory Keeper will use the local archive in this folder automatically.\n\n");

  const child = spawn(process.execPath, [path.join(__dirname, "serve-local.mjs")], {
    cwd: APP_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port)
    }
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
  child.on("error", (error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
