import { createServer } from "node:http";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  APP_CONFIG_PATH,
  APP_ROOT,
  ARCHIVE_DIR_NAME,
  createArchiveFromTemplate,
  deleteArchive,
  ensureArchiveRegistry,
  getActiveArchivePaths,
  getArchivePaths,
  loadAppConfig,
  renameArchive,
  saveAppConfig,
  writeJsonFile as writeArchiveLayoutJsonFile
} from "./archive-layout.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 8787);
const STARTUP_CHECK_TIMEOUT_MS = 8000;
const execFileAsync = promisify(execFile);
const REQUIRED_ARCHIVE_DIRS = [
  "reference",
  "stories",
  "meta-stories",
  "backups"
];
const REQUIRED_ARCHIVE_FILES = [
  "archive-config.json",
  "reference/profile.md",
  "reference/style-guide.md",
  "meta-stories/story-index.md",
  "meta-stories/follow-ups.md"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const ALLOWED_PREFIXES = [
  "app-config.json",
  "config.json",
  "master-index.md",
  "profile.md",
  "style-guide.md",
  "follow-ups.md",
  "system-prompts/",
  "stories/",
  `${ARCHIVE_DIR_NAME}/archive-config.json`,
  `${ARCHIVE_DIR_NAME}/reference/`,
  `${ARCHIVE_DIR_NAME}/stories/`,
  `${ARCHIVE_DIR_NAME}/meta-stories/`,
  `${ARCHIVE_DIR_NAME}/backups/`
];

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function normalizeRelativePath(inputPath = "") {
  const normalized = String(inputPath || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
  const safe = path.posix.normalize(normalized);
  if (!safe || safe === "." || safe.startsWith("../") || safe.includes("/../")) {
    throw new Error("Invalid path.");
  }
  if (path.posix.isAbsolute(safe)) {
    throw new Error("Absolute paths are not allowed.");
  }
  return safe;
}

function isAllowedRelativePath(relativePath) {
  return ALLOWED_PREFIXES.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

async function resolveManagedPath(inputPath) {
  const relativePath = normalizeRelativePath(inputPath);
  if (!isAllowedRelativePath(relativePath)) {
    throw new Error("Path is outside the managed archive.");
  }
  if (relativePath === "app-config.json") {
    return { relativePath, resolved: APP_CONFIG_PATH };
  }
  const archivePaths = await getActiveArchivePaths();
  const archiveRelativePrefix = `${ARCHIVE_DIR_NAME}/`;
  if (!relativePath.startsWith(archiveRelativePrefix)) {
    throw new Error("Managed path must resolve within the active archive.");
  }
  const archiveRelativePath = relativePath.slice(archiveRelativePrefix.length);
  const resolved = path.resolve(archivePaths.dataStoreRoot, archiveRelativePath);
  if (!resolved.startsWith(archivePaths.dataStoreRoot)) {
    throw new Error("Resolved path escaped the active archive.");
  }
  return { relativePath, resolved };
}

function getSafeStaticPath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const normalized = decoded === "/" || decoded === "/index.html" ? "/html/index.html" : decoded;
  const resolved = path.resolve(APP_ROOT, `.${normalized}`);
  if (!resolved.startsWith(APP_ROOT)) {
    return null;
  }
  return resolved;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function ensureParentDirectory(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readJsonFile(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function sanitizeAppConfig(appConfig = {}) {
  return {
    version: appConfig?.version || "1.0",
    createdAt: appConfig?.createdAt || "",
    openRouterConfigured: Boolean(String(appConfig?.openRouterApiKey || "").trim()),
    assemblyAiConfigured: Boolean(String(appConfig?.assemblyAiApiKey || "").trim()),
    modelRouting: appConfig?.modelRouting || "auto",
    modelOverride: appConfig?.modelOverride || null,
    port: Number(appConfig?.port || port) || port,
    debugMode: Boolean(appConfig?.debugMode),
    dynamicPipelineStatusMessages: appConfig?.dynamicPipelineStatusMessages !== false,
    taskMaxTokens: appConfig?.taskMaxTokens || null,
    activeArchiveId: appConfig?.activeArchiveId || null,
    archives: Array.isArray(appConfig?.archives) ? appConfig.archives : []
  };
}

async function isServerDebugEnabled() {
  const appConfig = await readJsonFile(APP_CONFIG_PATH, {});
  return Boolean(appConfig?.debugMode);
}

function formatServerDebugDetail(detail) {
  if (!detail) {
    return "";
  }
  const text = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n...[truncated]` : text;
}

async function logServerDebugEvent(payload) {
  if (!await isServerDebugEnabled()) {
    return;
  }
  const timestamp = new Date().toISOString();
  const scope = String(payload?.scope || "App");
  const title = String(payload?.title || "Debug Event");
  const status = String(payload?.status || "info");
  console.log(`[${timestamp}] ${scope} | ${title} | ${status}`);
  if (payload?.detail) {
    console.log(formatServerDebugDetail(payload.detail));
  }
}

async function writeJsonFile(filePath, value) {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listArchivesPayload() {
  const appConfig = await ensureArchiveRegistry();
  return {
    activeArchiveId: appConfig.activeArchiveId || null,
    archives: Array.isArray(appConfig.archives) ? appConfig.archives : []
  };
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/:/g, "-");
}

function quotePowerShell(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

async function runSystemCommand(file, args, options = {}) {
  try {
    return await execFileAsync(file, args, {
      ...options,
      maxBuffer: 25 * 1024 * 1024
    });
  } catch (error) {
    const detail = [error?.stdout, error?.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail ? `${error.message}\n${detail}` : (error.message || String(error)));
  }
}

async function withTempDir(prefix, task) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await task(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function createArchiveZip(sourceDir, destinationZipPath) {
  await rm(destinationZipPath, { force: true });
  if (process.platform === "win32") {
    const command = [
      `Compress-Archive -LiteralPath ${quotePowerShell(sourceDir)} -DestinationPath ${quotePowerShell(destinationZipPath)} -Force`
    ].join(" ");
    await runSystemCommand("powershell.exe", ["-NoProfile", "-Command", command]);
    return;
  }
  await runSystemCommand("zip", ["-qr", destinationZipPath, path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir)
  });
}

async function extractArchiveZip(zipPath, destinationDir) {
  if (process.platform === "win32") {
    const command = [
      `Expand-Archive -LiteralPath ${quotePowerShell(zipPath)} -DestinationPath ${quotePowerShell(destinationDir)} -Force`
    ].join(" ");
    await runSystemCommand("powershell.exe", ["-NoProfile", "-Command", command]);
    return;
  }
  await runSystemCommand("unzip", ["-q", zipPath, "-d", destinationDir]);
}

async function findArchiveRoots(rootDir) {
  const matches = [];
  const stack = [rootDir];
  while (stack.length) {
    const currentDir = stack.pop();
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nextPath = path.join(currentDir, entry.name);
      if (entry.name === "__MACOSX") {
        continue;
      }
      if (entry.name === ARCHIVE_DIR_NAME) {
        matches.push(nextPath);
        continue;
      }
      stack.push(nextPath);
    }
  }
  return matches;
}

async function validateImportedArchiveRoot(rootDir) {
  const missingDirs = [];
  const missingFiles = [];
  for (const relativeDir of REQUIRED_ARCHIVE_DIRS) {
    if (!fs.existsSync(path.join(rootDir, relativeDir))) {
      missingDirs.push(relativeDir);
    }
  }
  for (const relativeFile of REQUIRED_ARCHIVE_FILES) {
    if (!fs.existsSync(path.join(rootDir, relativeFile))) {
      missingFiles.push(relativeFile);
    }
  }
  if (missingDirs.length || missingFiles.length) {
    const details = [
      missingDirs.length ? `Missing directories: ${missingDirs.join(", ")}` : "",
      missingFiles.length ? `Missing files: ${missingFiles.join(", ")}` : ""
    ].filter(Boolean).join(". ");
    throw new Error(`The imported zip does not contain a valid ${ARCHIVE_DIR_NAME} structure. ${details}`);
  }
}

async function exportArchiveZip(archiveId = "") {
  const archivePaths = archiveId ? getArchivePaths(archiveId) : await getActiveArchivePaths();
  if (!fs.existsSync(archivePaths.dataStoreRoot)) {
    throw new Error("The local archive is not available yet.");
  }
  return withTempDir("memory-keeper-export-", async (tempDir) => {
    const storytellerName = String((await readJsonFile(archivePaths.archiveConfigPath, {}))?.storytellerName || "").trim();
    const zipFileName = storytellerName
      ? `${storytellerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "archive"}-${ARCHIVE_DIR_NAME}-${timestampForFilename()}.zip`
      : `${ARCHIVE_DIR_NAME}-${timestampForFilename()}.zip`;
    const zipPath = path.join(tempDir, zipFileName);
    await createArchiveZip(archivePaths.dataStoreRoot, zipPath);
    return {
      fileName: zipFileName,
      content: await readFile(zipPath)
    };
  });
}

async function importArchiveZip(zipBuffer) {
  if (!zipBuffer?.length) {
    throw new Error("The uploaded archive is empty.");
  }

  return withTempDir("memory-keeper-import-", async (tempDir) => {
    const zipPath = path.join(tempDir, "archive-import.zip");
    const extractDir = path.join(tempDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await writeFile(zipPath, zipBuffer);
    await extractArchiveZip(zipPath, extractDir);

    const archiveRoots = await findArchiveRoots(extractDir);
    if (!archiveRoots.length) {
      throw new Error(`The uploaded zip does not contain a ${ARCHIVE_DIR_NAME} folder.`);
    }
    if (archiveRoots.length > 1) {
      throw new Error(`The uploaded zip contains more than one ${ARCHIVE_DIR_NAME} folder.`);
    }

    const importedRoot = archiveRoots[0];
    await validateImportedArchiveRoot(importedRoot);
    const importedConfig = await readJsonFile(path.join(importedRoot, "archive-config.json"), {});
    const storytellerName = String(importedConfig?.storytellerName || "").trim();
    const createdArchive = await createArchiveFromTemplate({
      archiveId: storytellerName || `imported-${timestampForFilename()}`,
      label: storytellerName || "Imported Archive"
    });
    const createdArchivePaths = await getActiveArchivePaths({
      ...(await loadAppConfig()),
      activeArchiveId: createdArchive.id
    });
    await rm(createdArchivePaths.dataStoreRoot, { recursive: true, force: true });
    await cp(importedRoot, createdArchivePaths.dataStoreRoot, { recursive: true });
    const appConfig = await loadAppConfig();
    await saveAppConfig({
      ...appConfig,
      activeArchiveId: createdArchive.id
    });

    return {
      createdArchive,
      status: await getArchiveStatus()
    };
  });
}

async function safeReadUpstreamText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "";
  }
}

async function getOpenRouterApiKey() {
  const appConfig = await readJsonFile(APP_CONFIG_PATH, {});
  return String(appConfig?.openRouterApiKey || "").trim();
}

async function validateOpenRouterKey(apiKey) {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    return { configured: false, working: false, message: "OpenRouter key missing." };
  }
  try {
    const upstream = await fetchWithTimeout("https://openrouter.ai/api/v1/key", {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        "X-Title": "Memory Keeper"
      }
    });
    if (!upstream.ok) {
      const detail = await safeReadUpstreamText(upstream);
      return {
        configured: true,
        working: false,
        message: `OpenRouter check failed (${upstream.status}).`,
        detail: detail.slice(0, 300)
      };
    }
    return { configured: true, working: true, message: "OpenRouter key working." };
  } catch (error) {
    return {
      configured: true,
      working: false,
      message: error?.name === "AbortError" ? "OpenRouter check timed out." : "OpenRouter check failed.",
      detail: error.message || String(error)
    };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = STARTUP_CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildOpenRouterHeaders(request) {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key is missing from app-config.json.");
  }
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "X-Title": "Memory Keeper"
  };
  const origin = request.headers.origin || request.headers.referer || "";
  if (origin) {
    headers["HTTP-Referer"] = origin;
  }
  return headers;
}

function buildOpenRouterRequestBody(body) {
  const taskType = String(body?.taskType || "").trim() || "request";
  const model = String(body?.model || "").trim();
  const systemPrompt = String(body?.systemPrompt || "");
  const maxTokens = Number(body?.maxTokens || 0);
  const messages = Array.isArray(body?.messages)
    ? body.messages
      .map((message) => ({
        role: String(message?.role || "").trim(),
        content: typeof message?.content === "string" ? message.content : ""
      }))
      .filter((message) => message.role && typeof message.content === "string")
    : [];
  if (!model) {
    throw new Error("Missing model.");
  }
  if (!systemPrompt.trim()) {
    throw new Error("Missing system prompt.");
  }
  return {
    taskType,
    requestBody: {
      model,
      max_tokens: maxTokens > 0 ? Math.round(maxTokens) : 900,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    }
  };
}

async function handleOpenRouterRequest(request, response) {
  const body = await readJsonBody(request);
  const { taskType, requestBody } = buildOpenRouterRequestBody(body);
  await logServerDebugEvent({
    scope: "LLM",
    title: `${taskType} request`,
    status: "working",
    detail: `Model: ${requestBody.model}\nMax tokens: ${requestBody.max_tokens}\nMessages: ${requestBody.messages.length}`
  });
  const headers = await buildOpenRouterHeaders(request);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!upstream.ok) {
        const message = await safeReadUpstreamText(upstream);
        throw new Error(`${upstream.status} ${upstream.statusText}${message ? `: ${message}` : ""}`);
      }
      const payload = await upstream.json();
      await logServerDebugEvent({
        scope: "LLM",
        title: `${taskType} request`,
        status: "complete",
        detail: `Model: ${requestBody.model}\nUsage: ${JSON.stringify(payload.usage || {})}`
      });
      sendJson(response, 200, {
        text: payload.choices?.[0]?.message?.content || "",
        usage: payload.usage || null
      });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const retryable = /failed to fetch|fetch failed|load failed/i.test(message);
      if (attempt < 2 && retryable) {
        await logServerDebugEvent({
          scope: "LLM",
          title: `${taskType} request`,
          status: "retrying",
          detail: `Attempt ${attempt} failed. Retrying once.\n${message}`
        });
        continue;
      }
      break;
    }
  }

  await logServerDebugEvent({
    scope: "LLM",
    title: `${taskType} request`,
    status: "error",
    detail: String(lastError?.message || lastError || "Unknown error")
  });
  sendJson(response, 502, { error: String(lastError?.message || lastError || "OpenRouter request failed.") });
}

async function handleOpenRouterStream(request, response) {
  const body = await readJsonBody(request);
  const { taskType, requestBody } = buildOpenRouterRequestBody(body);
  requestBody.stream = true;
  requestBody.stream_options = { include_usage: true };
  await logServerDebugEvent({
    scope: "LLM",
    title: `${taskType} stream`,
    status: "working",
    detail: `Model: ${requestBody.model}\nMax tokens: ${requestBody.max_tokens}\nMessages: ${requestBody.messages.length}`
  });
  const headers = await buildOpenRouterHeaders(request);

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!upstream.ok || !upstream.body) {
    const message = await safeReadUpstreamText(upstream);
    await logServerDebugEvent({
      scope: "LLM",
      title: `${taskType} stream`,
      status: "error",
      detail: `${upstream.status} ${upstream.statusText}${message ? `: ${message}` : ""}`
    });
    sendJson(response, upstream.ok ? 502 : upstream.status, {
      error: `${upstream.status} ${upstream.statusText}${message ? `: ${message}` : ""}`
    });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive"
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let usageDetail = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      response.write(chunk);
      const usageMatch = chunk.match(/"usage"\s*:\s*(\{[\s\S]*?\})/);
      if (usageMatch) {
        usageDetail = usageMatch[1];
      }
    }
    response.end();
    await logServerDebugEvent({
      scope: "LLM",
      title: `${taskType} stream`,
      status: "complete",
      detail: `Model: ${requestBody.model}${usageDetail ? `\nUsage: ${usageDetail}` : ""}`
    });
  } catch (error) {
    response.write(`event: error\ndata: ${JSON.stringify({ error: String(error?.message || error || "Stream failed.") })}\n\n`);
    response.end();
    await logServerDebugEvent({
      scope: "LLM",
      title: `${taskType} stream`,
      status: "error",
      detail: String(error?.message || error || "Stream failed.")
    });
  }
}

async function ensureArchiveFromTemplate() {
  const appConfig = await ensureArchiveRegistry();
  if (appConfig.archives.length) {
    return { created: false, archive: appConfig.archives.find((entry) => entry.id === appConfig.activeArchiveId) || null };
  }
  const archive = await createArchiveFromTemplate({
    archiveId: "archive-1",
    label: "Archive 1"
  });
  return { created: true, archive };
}

async function collectFiles(rootPath, prefix = "") {
  const entries = [];
  const children = await readdir(rootPath, { withFileTypes: true });
  for (const child of children) {
    const nextPrefix = prefix ? `${prefix}/${child.name}` : child.name;
    const absolutePath = path.join(rootPath, child.name);
    if (child.isDirectory()) {
      entries.push(...await collectFiles(absolutePath, nextPrefix));
      continue;
    }
    const info = await stat(absolutePath);
    entries.push({
      path: nextPrefix.replace(/\\/g, "/"),
      size: info.size,
      modifiedAt: info.mtime.toISOString()
    });
  }
  return entries;
}

async function listManagedFiles() {
  const results = [];
  if (fs.existsSync(APP_CONFIG_PATH)) {
    const info = await stat(APP_CONFIG_PATH);
    results.push({
      path: "app-config.json",
      size: info.size,
      modifiedAt: info.mtime.toISOString()
    });
  }
  const archivePaths = await getActiveArchivePaths();
  if (fs.existsSync(archivePaths.dataStoreRoot)) {
    const archiveEntries = await collectFiles(archivePaths.dataStoreRoot, ARCHIVE_DIR_NAME);
    results.push(...archiveEntries);
  }
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function parseBackupEntry(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || "";
  let match = fileName.match(/^(profile|style-guide|story-index|follow-ups)-(\d{4}-\d{2}-\d{2}T[\d-]{8})\.md$/i);
  if (match) {
    const labelMap = {
      profile: "Profile",
      "style-guide": "Style Guide",
      "story-index": "Story Index",
      "follow-ups": "Follow-ups"
    };
    const targetMap = {
      profile: "memory-keeper-data-store/reference/profile.md",
      "style-guide": "memory-keeper-data-store/reference/style-guide.md",
      "story-index": "memory-keeper-data-store/meta-stories/story-index.md",
      "follow-ups": "memory-keeper-data-store/meta-stories/follow-ups.md"
    };
    return {
      path: normalized,
      targetPath: targetMap[match[1].toLowerCase()],
      label: labelMap[match[1].toLowerCase()],
      timestamp: match[2]
    };
  }

  match = fileName.match(/^(.+?)-(update|restore)-(\d{4}-\d{2}-\d{2}T[\d-]{8})\.md$/i);
  if (match) {
    return {
      path: normalized,
      targetPath: `memory-keeper-data-store/stories/${match[1]}.md`,
      label: `Story: ${match[1]}`,
      timestamp: match[3]
    };
  }

  return null;
}

async function listBackups() {
  const archivePaths = await getActiveArchivePaths();
  if (!fs.existsSync(archivePaths.backupsRoot)) {
    return [];
  }
  const entries = await collectFiles(archivePaths.backupsRoot, `${ARCHIVE_DIR_NAME}/backups`);
  return entries
    .filter((entry) => entry.path.endsWith(".md"))
    .map((entry) => parseBackupEntry(entry.path))
    .filter(Boolean)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

async function restoreBackup(backupPath) {
  const backup = parseBackupEntry(backupPath);
  if (!backup?.targetPath) {
    throw new Error("Backup path could not be resolved.");
  }
  const source = (await resolveManagedPath(backup.path)).resolved;
  const target = (await resolveManagedPath(backup.targetPath)).resolved;
  const content = await readFile(source, "utf8");
  await ensureParentDirectory(target);
  await writeFile(target, content, "utf8");
  return backup.targetPath;
}

async function getArchiveStatus() {
  const appConfig = await ensureArchiveRegistry();
  const archivePaths = await getActiveArchivePaths(appConfig);
  const archiveConfig = await readJsonFile(archivePaths.archiveConfigPath, {});
  const profilePath = path.join(archivePaths.referenceDir, "profile.md");
  const styleGuidePath = path.join(archivePaths.referenceDir, "style-guide.md");
  const storyIndexPath = path.join(archivePaths.metaStoriesDir, "story-index.md");
  const storiesPath = archivePaths.storiesDir;

  let storyCount = Number(archiveConfig?.storyCount || 0);
  if (fs.existsSync(storiesPath)) {
    const storyFiles = await readdir(storiesPath, { withFileTypes: true });
    storyCount = storyFiles.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  }

  return {
    archivePresent: fs.existsSync(archivePaths.dataStoreRoot),
    activeArchiveId: appConfig.activeArchiveId,
    profilePresent: fs.existsSync(profilePath),
    styleGuidePresent: fs.existsSync(styleGuidePath),
    storyIndexPresent: fs.existsSync(storyIndexPath),
    firstRun: Boolean(archiveConfig?.firstRun),
    storytellerName: String(archiveConfig?.storytellerName || ""),
    storyCount
  };
}

async function checkOpenRouterStatus() {
  return validateOpenRouterKey(await getOpenRouterApiKey());
}

async function checkAssemblyAiStatus() {
  const appConfig = await readJsonFile(APP_CONFIG_PATH, {});
  const apiKey = String(appConfig?.assemblyAiApiKey || "").trim();
  if (!apiKey) {
    return { configured: false, working: false, optional: true, message: "AssemblyAI key missing (optional)." };
  }
  return { configured: true, working: null, optional: true, message: "AssemblyAI key loaded (optional)." };
}

async function getStartupCheck() {
  const archivePaths = await getActiveArchivePaths();
  const archiveStatus = await getArchiveStatus();
  const pathChecks = {
    appRoot: APP_ROOT,
    html: fs.existsSync(path.join(APP_ROOT, "html")),
    scripts: fs.existsSync(path.join(APP_ROOT, "scripts")),
    systemPrompts: fs.existsSync(path.join(APP_ROOT, "system-prompts")),
    dataStore: fs.existsSync(archivePaths.dataStoreRoot),
    referenceDir: fs.existsSync(archivePaths.referenceDir),
    storiesDir: fs.existsSync(archivePaths.storiesDir),
    metaStoriesDir: fs.existsSync(archivePaths.metaStoriesDir),
    backupsDir: fs.existsSync(archivePaths.backupsRoot)
  };
  const fileChecks = {
    appConfig: fs.existsSync(APP_CONFIG_PATH),
    archiveConfig: fs.existsSync(archivePaths.archiveConfigPath),
    profile: fs.existsSync(path.join(archivePaths.referenceDir, "profile.md")),
    styleGuide: fs.existsSync(path.join(archivePaths.referenceDir, "style-guide.md")),
    storyIndex: fs.existsSync(path.join(archivePaths.metaStoriesDir, "story-index.md")),
    followUps: fs.existsSync(path.join(archivePaths.metaStoriesDir, "follow-ups.md"))
  };
  const openRouter = await checkOpenRouterStatus();
  const assemblyAi = await checkAssemblyAiStatus();
  const missingPaths = Object.entries(pathChecks).filter(([, ok]) => typeof ok === "boolean" && !ok).map(([key]) => key);
  const missingFiles = Object.entries(fileChecks).filter(([, ok]) => !ok).map(([key]) => key);
  const allGood = !missingPaths.length
    && !missingFiles.length
    && openRouter.working
    && (!assemblyAi.configured || assemblyAi.working);
  return {
    allGood,
    storyCount: archiveStatus.storyCount,
    storytellerName: archiveStatus.storytellerName,
    firstRun: archiveStatus.firstRun,
    pathChecks,
    fileChecks,
    missingPaths,
    missingFiles,
    openRouter,
    assemblyAi
  };
}

async function handleAssemblyToken(request, response) {
  try {
    const body = await readJsonBody(request);
    const appConfig = await readJsonFile(APP_CONFIG_PATH, {});
    const apiKey = String(appConfig?.assemblyAiApiKey || body.apiKey || "").trim();
    const expiresInSeconds = Number(body.expiresInSeconds || 540);
    const maxSessionDurationSeconds = Number(body.maxSessionDurationSeconds || 1800);

    if (!apiKey) {
      sendJson(response, 400, { error: "Missing AssemblyAI API key." });
      return;
    }

    const endpoint = new URL("https://streaming.assemblyai.com/v3/token");
    endpoint.searchParams.set("expires_in_seconds", String(expiresInSeconds));
    endpoint.searchParams.set("max_session_duration_seconds", String(maxSessionDurationSeconds));

    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: apiKey
      }
    });

    const text = await upstream.text();
    response.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
    });
    response.end(text);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Token exchange failed." });
  }
}

async function handleApi(request, response) {
  await ensureArchiveRegistry();
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/app-config") {
    sendJson(response, 200, sanitizeAppConfig(await readJsonFile(APP_CONFIG_PATH, {})));
    return true;
  }

  if (request.method === "GET" && pathname === "/api/app-settings") {
    sendJson(response, 200, sanitizeAppConfig(await readJsonFile(APP_CONFIG_PATH, {})));
    return true;
  }

  if (request.method === "POST" && pathname === "/api/app-config") {
    const body = await readJsonBody(request);
    const existing = await loadAppConfig();
    const config = {
      ...existing,
      ...body
    };
    if (!Object.prototype.hasOwnProperty.call(body || {}, "openRouterApiKey")) {
      config.openRouterApiKey = existing?.openRouterApiKey ?? null;
    }
    if (!Object.prototype.hasOwnProperty.call(body || {}, "assemblyAiApiKey")) {
      config.assemblyAiApiKey = existing?.assemblyAiApiKey ?? null;
    }
    await saveAppConfig(config);
    await logServerDebugEvent({
      scope: "Server",
      title: "Updated app-config.json",
      status: "write",
      detail: "app-config.json was written."
    });
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/credentials") {
    const body = await readJsonBody(request);
    const existing = await loadAppConfig();
    const requestedOpenRouterApiKey = typeof body?.openRouterApiKey === "string"
      ? (String(body.openRouterApiKey || "").trim() || null)
      : (existing?.openRouterApiKey ?? null);
    if (typeof body?.openRouterApiKey === "string" && requestedOpenRouterApiKey) {
      const validation = await validateOpenRouterKey(requestedOpenRouterApiKey);
      if (!validation.working) {
        sendJson(response, 400, {
          error: validation.detail ? `${validation.message} ${validation.detail}` : validation.message,
          validation
        });
        return true;
      }
    }
    const requestedAssemblyAiApiKey = typeof body?.assemblyAiApiKey === "string"
      ? (String(body.assemblyAiApiKey || "").trim() || null)
      : (existing?.assemblyAiApiKey ?? null);
    const config = {
      ...existing,
      openRouterApiKey: requestedOpenRouterApiKey,
      assemblyAiApiKey: requestedAssemblyAiApiKey
    };
    await saveAppConfig(config);
    await logServerDebugEvent({
      scope: "Server",
      title: "Updated credentials",
      status: "write",
      detail: [
        `OpenRouter: ${config.openRouterApiKey ? "set" : "missing"}`,
        `AssemblyAI: ${config.assemblyAiApiKey ? "set" : "missing"}`
      ].join("\n")
    });
    sendJson(response, 200, {
      ok: true,
      openRouterWorking: Boolean(config.openRouterApiKey),
      ...sanitizeAppConfig(config)
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/validate/openrouter") {
    const body = await readJsonBody(request);
    const suppliedKey = typeof body?.openRouterApiKey === "string"
      ? String(body.openRouterApiKey || "").trim()
      : "";
    const validation = await validateOpenRouterKey(suppliedKey || await getOpenRouterApiKey());
    sendJson(response, validation.working ? 200 : 400, validation);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/archives") {
    sendJson(response, 200, await listArchivesPayload());
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archives/switch") {
    const body = await readJsonBody(request);
    const archiveId = String(body?.archiveId || "").trim();
    const appConfig = await loadAppConfig();
    if (!archiveId || !appConfig.archives.some((entry) => entry.id === archiveId)) {
      sendJson(response, 400, { error: "Unknown archive id." });
      return true;
    }
    await saveAppConfig({
      ...appConfig,
      activeArchiveId: archiveId
    });
    sendJson(response, 200, {
      ok: true,
      ...await listArchivesPayload(),
      status: await getArchiveStatus()
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archives/create") {
    const body = await readJsonBody(request);
    const archive = await createArchiveFromTemplate({
      archiveId: String(body?.id || "").trim(),
      label: String(body?.label || "").trim() || "New Archive"
    });
    const shouldActivate = body?.setActive !== false;
    if (shouldActivate) {
      const appConfig = await loadAppConfig();
      await saveAppConfig({
        ...appConfig,
        activeArchiveId: archive.id
      });
    }
    sendJson(response, 200, {
      ok: true,
      archive,
      ...await listArchivesPayload(),
      status: await getArchiveStatus()
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archives/rename") {
    const body = await readJsonBody(request);
    const archive = await renameArchive({
      archiveId: String(body?.archiveId || "").trim(),
      label: String(body?.label || "").trim()
    });
    sendJson(response, 200, {
      ok: true,
      archive,
      ...await listArchivesPayload(),
      status: await getArchiveStatus()
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archives/delete") {
    const body = await readJsonBody(request);
    const result = await deleteArchive({
      archiveId: String(body?.archiveId || "").trim()
    });
    sendJson(response, 200, {
      ok: true,
      ...result,
      ...await listArchivesPayload(),
      status: await getArchiveStatus()
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/archive-config") {
    const archivePaths = await getActiveArchivePaths();
    sendJson(response, 200, await readJsonFile(archivePaths.archiveConfigPath, null));
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archive-config") {
    const body = await readJsonBody(request);
    const archivePaths = await getActiveArchivePaths();
    await writeArchiveLayoutJsonFile(archivePaths.archiveConfigPath, body);
    await logServerDebugEvent({
      scope: "Server",
      title: "Updated archive-config.json",
      status: "write",
      detail: "archive-config.json was written."
    });
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/archive/status") {
    sendJson(response, 200, await getArchiveStatus());
    return true;
  }

  if (request.method === "GET" && pathname === "/api/startup-check") {
    sendJson(response, 200, await getStartupCheck());
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archive/ensure") {
    const result = await ensureArchiveFromTemplate();
    await logServerDebugEvent({
      scope: "Server",
      title: "Ensured archive from template",
      status: result.created ? "create" : "ok",
      detail: result.created ? `Created ${ARCHIVE_DIR_NAME} from the blank template.` : "Archive already existed."
    });
    sendJson(response, 200, { ok: true, ...result, status: await getArchiveStatus() });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/archive/export") {
    const payload = await exportArchiveZip();
    await logServerDebugEvent({
      scope: "Server",
      title: "Exported archive zip",
      status: "download",
      detail: payload.fileName
    });
    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${payload.fileName}"`,
      "Content-Length": payload.content.length,
      "Cache-Control": "no-store"
    });
    response.end(payload.content);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/archives/export") {
    const archiveId = String(url.searchParams.get("archiveId") || "").trim();
    if (!archiveId) {
      sendJson(response, 400, { error: "Missing archive id." });
      return true;
    }
    const payload = await exportArchiveZip(archiveId);
    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${payload.fileName}"`,
      "Content-Length": payload.content.length,
      "Cache-Control": "no-store"
    });
    response.end(payload.content);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archive/import") {
    const zipBuffer = await readRawBody(request);
    const result = await importArchiveZip(zipBuffer);
    await logServerDebugEvent({
      scope: "Server",
      title: "Imported archive zip",
      status: "restore",
      detail: [
        `Created archive: ${result.createdArchive?.id || "unknown"}`,
        "Imported archive is now active."
      ].filter(Boolean).join("\n")
    });
    sendJson(response, 200, { ok: true, ...result });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/archives/import") {
    const zipBuffer = await readRawBody(request);
    const result = await importArchiveZip(zipBuffer);
    sendJson(response, 200, { ok: true, ...result, ...await listArchivesPayload() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/llm/request") {
    await handleOpenRouterRequest(request, response);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/llm/stream") {
    await handleOpenRouterStream(request, response);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/file") {
    const inputPath = url.searchParams.get("path");
    if (!inputPath) {
      sendJson(response, 400, { error: "Missing file path." });
      return true;
    }
    const { resolved } = await resolveManagedPath(inputPath);
    const content = await readFile(resolved, "utf8");
    sendText(response, 200, content);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/file") {
    const body = await readJsonBody(request);
    const inputPath = body?.path;
    const content = String(body?.content ?? "");
    if (!inputPath) {
      sendJson(response, 400, { error: "Missing file path." });
      return true;
    }
    const { resolved, relativePath } = await resolveManagedPath(inputPath);
    const existed = fs.existsSync(resolved);
    if (existed && body?.allowOverwrite === false) {
      sendJson(response, 409, { error: "File already exists." });
      return true;
    }
    await ensureParentDirectory(resolved);
    await writeFile(resolved, content, "utf8");
    await logServerDebugEvent({
      scope: "Server",
      title: "Wrote managed file",
      status: existed ? "update" : "create",
      detail: relativePath
    });
    sendJson(response, 200, { ok: true, existed });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/file-exists") {
    const inputPath = url.searchParams.get("path");
    if (!inputPath) {
      sendJson(response, 400, { error: "Missing file path." });
      return true;
    }
    const { resolved } = await resolveManagedPath(inputPath);
    sendJson(response, 200, { exists: fs.existsSync(resolved) });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/file-list") {
    sendJson(response, 200, { entries: await listManagedFiles() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/debug-log") {
    const body = await readJsonBody(request);
    await logServerDebugEvent(body);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/file-delete") {
    const body = await readJsonBody(request);
    const inputPath = String(body?.path || "").trim();
    if (!inputPath) {
      sendJson(response, 400, { error: "Missing file path." });
      return true;
    }
    const { resolved } = await resolveManagedPath(inputPath);
    await rm(resolved, { force: true });
    await logServerDebugEvent({
      scope: "Server",
      title: "Deleted managed file",
      status: "delete",
      detail: inputPath
    });
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/backups") {
    sendJson(response, 200, { entries: await listBackups() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/backups/restore") {
    const body = await readJsonBody(request);
    const backupPath = String(body?.backupPath || "").trim();
    if (!backupPath) {
      sendJson(response, 400, { error: "Missing backup path." });
      return true;
    }
    const restoredPath = await restoreBackup(backupPath);
    await logServerDebugEvent({
      scope: "Server",
      title: "Restored backup",
      status: "restore",
      detail: `Backup: ${backupPath}\nTarget: ${restoredPath}`
    });
    sendJson(response, 200, { ok: true, restoredPath });
    return true;
  }

  return false;
}

async function handleStatic(request, response) {
  const resolved = getSafeStaticPath(request.url || "/");
  if (!resolved || !fs.existsSync(resolved)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const stats = fs.statSync(resolved);
  if (stats.isDirectory()) {
    sendJson(response, 403, { error: "Directory listing is not allowed." });
    return;
  }

  const extension = path.extname(resolved).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(resolved).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL." });
      return;
    }

    if (request.method === "POST" && request.url.startsWith("/assembly-token")) {
      await handleAssemblyToken(request, response);
      return;
    }

    if (request.url.startsWith("/api/")) {
      const handled = await handleApi(request, response);
      if (!handled) {
        sendJson(response, 404, { error: "API endpoint not found." });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await handleStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Internal server error." });
  }
});

server.listen(port, "127.0.0.1", async () => {
  const indexPath = path.join(APP_ROOT, "html", "index.html");
  const exists = fs.existsSync(indexPath);
  const indexStatus = exists ? "html/index.html found" : "html/index.html missing";
  console.log(`Memory Keeper local server running at http://127.0.0.1:${port} (${indexStatus})`);
});
