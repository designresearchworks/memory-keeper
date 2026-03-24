#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

const TEXT_EXTENSIONS = new Set([
  ".bat",
  ".cjs",
  ".css",
  ".example",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".sh",
  ".txt",
  ".yaml",
  ".yml"
]);

const IGNORE_DIRS = new Set([
  ".git",
  "archives",
  "node_modules"
]);

const ALLOWED_FILE_PREFIXES = [
  "docs/multi-archive-migration-plan.md",
  "docs/multi-archive-verification-prompt.md",
  "scripts/archive-layout.mjs",
  "scripts/check-multi-archive-paths.mjs",
  "templates-for-blank-build/"
];

const PATTERNS = [
  {
    name: "hardcoded-app-root-datastore",
    regex: /path\.(?:join|resolve)\(\s*APP_ROOT\s*,\s*["'`]memory-keeper-data-store["'`]/g
  },
  {
    name: "hardcoded-top-level-datastore-string",
    regex: /(?<!templates-for-blank-build\/)["'`]memory-keeper-data-store(?:\/[^"'`]*)?["'`]/g
  },
  {
    name: "legacy-datastore-constant",
    regex: /\b(?:DATA_STORE_ROOT|ARCHIVE_CONFIG_PATH|BACKUPS_ROOT)\b/g
  },
  {
    name: "legacy-import-overwrite-copy",
    regex: /\breplace the current memory-keeper-data-store\b/gi
  }
];

function isAllowedFinding(finding) {
  if (ALLOWED_FILE_PREFIXES.some((prefix) => finding.file === prefix || finding.file.startsWith(prefix))) {
    return true;
  }
  if (
    finding.file === "html/index.html"
    && finding.pattern === "hardcoded-top-level-datastore-string"
    && finding.text.includes('const ACTIVE_ARCHIVE_ROOT = "memory-keeper-data-store";')
  ) {
    return true;
  }
  if (
    finding.file === "scripts/serve-local.mjs"
    && finding.pattern === "hardcoded-top-level-datastore-string"
    && (
      finding.text.includes('"memory-keeper-data-store/reference/')
      || finding.text.includes('"memory-keeper-data-store/meta-stories/')
      || finding.text.includes('`memory-keeper-data-store/stories/${match[1]}.md`')
    )
  ) {
    return true;
  }
  return false;
}

function shouldScan(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || path.basename(relativePath) === "README.txt";
}

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.relative(APP_ROOT, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...await walk(absolutePath));
      continue;
    }
    if (shouldScan(relativePath)) {
      results.push({ absolutePath, relativePath });
    }
  }
  return results;
}

function findMatches(relativePath, text) {
  const lines = text.split("\n");
  const matches = [];
  for (const pattern of PATTERNS) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      pattern.regex.lastIndex = 0;
      if (!pattern.regex.test(line)) {
        continue;
      }
      matches.push({
        file: relativePath,
        line: index + 1,
        pattern: pattern.name,
        text: line.trim()
      });
    }
  }
  return matches;
}

async function main() {
  const files = await walk(APP_ROOT);
  const findings = [];

  for (const file of files) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const matches = findMatches(file.relativePath, text);
    for (const match of matches) {
      findings.push({
        ...match,
        allowed: isAllowedFinding(match)
      });
    }
  }

  const actionable = findings.filter((finding) => !finding.allowed);
  if (!findings.length) {
    console.log("No legacy single-archive path markers found.");
    return;
  }

  for (const finding of findings) {
    const prefix = finding.allowed ? "ALLOW" : "FAIL";
    console.log(`${prefix} ${finding.file}:${finding.line} [${finding.pattern}]`);
    console.log(`  ${finding.text}`);
  }

  if (actionable.length) {
    console.error(`\nFound ${actionable.length} actionable legacy path reference(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nOnly allowed references were found (${findings.length} total).`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
