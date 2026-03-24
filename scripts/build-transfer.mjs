#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEV_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(DEV_ROOT, "..");
const TRANSFER_DIR = path.join(WORKSPACE_ROOT, "transfer_build");
const TEMPLATE_DIR = path.join(DEV_ROOT, "templates-for-blank-build");
const DATA_STORE_DIR = "memory-keeper-data-store";
const HTML_DIR = "html";
const WITH_ORIGIN_STORY = process.argv.includes("--with-origin-story");

const COPY_FILES = [
  path.join(HTML_DIR, "style.css"),
  "memory-keeper.sh",
  "memory-keeper.bat",
  path.join("scripts", "memory-keeper.ps1"),
  path.join("scripts", "serve-local.mjs"),
  path.join("scripts", "run-memory-keeper.mjs")
];

const COPY_DIRS = [
  "system-prompts"
];

async function main() {
  await rm(TRANSFER_DIR, { recursive: true, force: true });
  await mkdir(TRANSFER_DIR, { recursive: true });

  await buildSanitizedIndex();
  await buildSanitizedAppConfig();
  for (const file of COPY_FILES) {
    const destination = path.join(TRANSFER_DIR, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(DEV_ROOT, file), destination);
  }
  for (const dir of COPY_DIRS) {
    await cp(path.join(DEV_ROOT, dir), path.join(TRANSFER_DIR, dir), { recursive: true });
  }

  await cp(TEMPLATE_DIR, path.join(TRANSFER_DIR, "templates-for-blank-build"), { recursive: true });
  if (WITH_ORIGIN_STORY) {
    await addOriginStory(path.join(TRANSFER_DIR, "templates-for-blank-build"));
  }

  await writeFile(path.join(TRANSFER_DIR, "README.txt"), buildReadme(), "utf8");
  await stripJunkFiles(TRANSFER_DIR);
  console.log(`Transfer build created at ${TRANSFER_DIR}${WITH_ORIGIN_STORY ? " with the optional origin story." : "."}`);
}

async function buildSanitizedIndex() {
  const sourcePath = path.join(DEV_ROOT, HTML_DIR, "index.html");
  let html = await readFile(sourcePath, "utf8");
  html = html.replace(
    /const PRELOADED_OPENROUTER_KEY = ".*?";/,
    'const PRELOADED_OPENROUTER_KEY = "";'
  );
  html = html.replace(
    /const PRELOADED_ASSEMBLY_API_KEY = ".*?";/,
    'const PRELOADED_ASSEMBLY_API_KEY = "";'
  );
  await mkdir(path.join(TRANSFER_DIR, HTML_DIR), { recursive: true });
  await writeFile(path.join(TRANSFER_DIR, HTML_DIR, "index.html"), html, "utf8");
}

async function buildSanitizedAppConfig() {
  const sourcePath = path.join(DEV_ROOT, "app-config.json");
  const config = JSON.parse(await readFile(sourcePath, "utf8"));
  config.openRouterApiKey = null;
  config.assemblyAiApiKey = null;
  await writeFile(path.join(TRANSFER_DIR, "app-config.json"), JSON.stringify(config, null, 2), "utf8");
}

async function addOriginStory(archiveRoot) {
  const dataRoot = path.join(archiveRoot, DATA_STORE_DIR);
  const configPath = path.join(dataRoot, "archive-config.json");
  const indexPath = path.join(dataRoot, "meta-stories", "story-index.md");
  const storyPath = path.join(dataRoot, "stories", "the-origin-story.md");

  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.storyCount = 1;
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  const storyMarkdown = `# Story: The Origin Story

## Metadata
Told: 2026-03-10T00:00:00.000Z
File: stories/the-origin-story.md
Period: [undated]
People: two lovers
Places: Vienna
Themes: beginnings, ideas, memory, love, software
Connections: none
Summary: Once upon a time, two lovers hatched a plan in Vienna and started wondering what an AI memory keeper might be like.

## Story

Once upon a time, two lovers hatched a plan in Vienna. We started wondering what an AI memory keeper might be like, and whether it could help a family hold on to the stories that would otherwise drift away.
`;
  await writeFile(storyPath, storyMarkdown, "utf8");

  const entry = `### The Origin Story
File: stories/the-origin-story.md
Told: 2026-03-10
Period: [undated]
People: two lovers
Places: Vienna
Themes: beginnings, ideas, memory, love, software
Connections: none
Summary: Once upon a time, two lovers hatched a plan in Vienna and started wondering what an AI memory keeper might be like.
`;
  let indexText = await readFile(indexPath, "utf8");
  indexText = `${indexText.trimEnd()}\n\n${entry}`;
  await writeFile(indexPath, `${indexText.trimEnd()}\n`, "utf8");
}

async function stripJunkFiles(rootDir) {
  const stack = [rootDir];
  while (stack.length) {
    const currentDir = stack.pop();
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === ".DS_Store") {
        await rm(entryPath, { force: true });
      }
    }
  }
}

function buildReadme() {
  return `Memory Keeper Transfer Build
===========================

This folder is a shareable snapshot of Memory Keeper.

What is included
----------------
- app-config.json
- html/index.html
- html/style.css
- scripts/serve-local.mjs
- scripts/run-memory-keeper.mjs
- memory-keeper.sh
- memory-keeper.bat
- scripts/memory-keeper.ps1
- system-prompts/
- templates-for-blank-build/

Folder layout
-------------
Memory Keeper now runs against the whole app folder through the local helper server.

At the top level you should have:
- app-config.json
- ${DATA_STORE_DIR}/
- html/
- scripts/
- system-prompts/

Inside ${DATA_STORE_DIR}/ you should have:
- archive-config.json
- reference/
- stories/
- meta-stories/
- backups/

Important working files:
- ${DATA_STORE_DIR}/reference/profile.md
- ${DATA_STORE_DIR}/reference/style-guide.md
- ${DATA_STORE_DIR}/meta-stories/story-index.md
- ${DATA_STORE_DIR}/meta-stories/follow-ups.md

How to use it
-------------
1. Open a terminal in this folder.
2. Run the startup script:
   - macOS: ./memory-keeper.sh
   - Windows: run memory-keeper.bat
3. The startup script will:
   - install Node.js first if it is missing
   - check app-config.json
   - ask for any missing API keys
   - create or update a local ${DATA_STORE_DIR}/ working folder from the blank template if needed
   - start the local server
4. Open: http://127.0.0.1:8787
5. The app will use the local archive in this folder automatically.
6. If this is a blank archive, the app will show a short first-run setup flow in the browser.
7. After that, it will invite you to tell your first story.

Notes
-----
- The packaged app does not include any preloaded API keys.
- The root app config lives at the top level as app-config.json.
- The archive metadata lives inside ${DATA_STORE_DIR}/archive-config.json.
- The browser no longer links to local folders directly. The local server uses the archive in this folder automatically.
- The templates-for-blank-build folder contains a starter ${DATA_STORE_DIR}/ folder with the minimum file structure Memory Keeper expects.
- By default the template is empty except for starter profile/style-guide scaffolding.
- If the build script was run with --with-origin-story, the template also includes one small starter story.
- The startup script creates or updates a working ${DATA_STORE_DIR}/ folder beside the app.
- stories/ is for actual story files only.
- meta-stories/ stores archive-wide metadata such as the story index and follow-up prompts.
- backups/ stores timestamped backups created before important overwrites.
- system-prompts/ contains the editable prompt files used by the app at runtime.
`;
}

if (!existsSync(TEMPLATE_DIR)) {
  console.error(`Missing archive template at ${TEMPLATE_DIR}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
