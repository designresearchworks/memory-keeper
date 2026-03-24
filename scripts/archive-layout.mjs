import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, "..");
export const APP_CONFIG_PATH = path.join(APP_ROOT, "app-config.json");
export const ARCHIVES_ROOT = path.join(APP_ROOT, "archives");
export const DELETED_ARCHIVE_BACKUPS_ROOT = path.join(APP_ROOT, "deleted-archive-backups");
export const LEGACY_DATA_STORE_ROOT = path.join(APP_ROOT, "memory-keeper-data-store");
export const ARCHIVE_DIR_NAME = "memory-keeper-data-store";
export const TEMPLATE_DATA_STORE_ROOT = path.join(APP_ROOT, "templates-for-blank-build", ARCHIVE_DIR_NAME);

export const DEFAULT_APP_CONFIG = {
  version: "1.0",
  createdAt: "",
  openRouterApiKey: null,
  assemblyAiApiKey: null,
  modelRouting: "auto",
  modelOverride: null,
  port: 8787,
  debugMode: false,
  activeArchiveId: null,
  archives: []
};

function normalizeArchiveId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueArchiveId(baseId, existingIds) {
  const fallbackBase = normalizeArchiveId(baseId) || "archive";
  let candidate = fallbackBase;
  let counter = 1;
  while (existingIds.has(candidate)) {
    counter += 1;
    candidate = `${fallbackBase}-${counter}`;
  }
  return candidate;
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/:/g, "-");
}

function normalizeArchiveEntry(entry) {
  const id = normalizeArchiveId(entry?.id);
  const label = String(entry?.label || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    label: label || id
  };
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function ensureAppConfig() {
  if (existsSync(APP_CONFIG_PATH)) {
    return;
  }
  await writeJsonFile(APP_CONFIG_PATH, {
    ...DEFAULT_APP_CONFIG,
    createdAt: new Date().toISOString()
  });
}

export async function loadAppConfig() {
  await ensureAppConfig();
  const config = await readJsonFile(APP_CONFIG_PATH, {});
  return {
    ...DEFAULT_APP_CONFIG,
    ...config
  };
}

export async function saveAppConfig(config) {
  const normalizedArchives = [];
  const seenIds = new Set();
  for (const entry of Array.isArray(config?.archives) ? config.archives : []) {
    const normalized = normalizeArchiveEntry(entry);
    if (!normalized || seenIds.has(normalized.id)) {
      continue;
    }
    seenIds.add(normalized.id);
    normalizedArchives.push(normalized);
  }

  const activeArchiveId = seenIds.has(String(config?.activeArchiveId || "").trim())
    ? String(config.activeArchiveId).trim()
    : (normalizedArchives[0]?.id || null);

  await writeJsonFile(APP_CONFIG_PATH, {
    ...DEFAULT_APP_CONFIG,
    ...config,
    archives: normalizedArchives,
    activeArchiveId
  });
}

async function listArchiveDirectories() {
  if (!existsSync(ARCHIVES_ROOT)) {
    return [];
  }
  const entries = await readdir(ARCHIVES_ROOT, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const archiveId = normalizeArchiveId(entry.name);
    if (!archiveId) {
      continue;
    }
    const dataStoreRoot = path.join(ARCHIVES_ROOT, entry.name, ARCHIVE_DIR_NAME);
    if (!existsSync(dataStoreRoot)) {
      continue;
    }
    const archiveConfig = await readJsonFile(path.join(dataStoreRoot, "archive-config.json"), {});
    const storytellerName = String(archiveConfig?.storytellerName || "").trim();
    results.push({
      id: archiveId,
      label: storytellerName || archiveId
    });
  }
  return results.sort((left, right) => left.id.localeCompare(right.id));
}

async function resolveInitialArchiveLabel(dataStoreRoot) {
  const archiveConfig = await readJsonFile(path.join(dataStoreRoot, "archive-config.json"), {});
  const storytellerName = String(archiveConfig?.storytellerName || "").trim();
  return storytellerName || "Archive 1";
}

async function migrateLegacyArchive(existingIds = new Set()) {
  if (!existsSync(LEGACY_DATA_STORE_ROOT)) {
    return null;
  }
  const label = await resolveInitialArchiveLabel(LEGACY_DATA_STORE_ROOT);
  const archiveId = makeUniqueArchiveId(label, existingIds);
  const destinationRoot = path.join(ARCHIVES_ROOT, archiveId);
  await mkdir(ARCHIVES_ROOT, { recursive: true });
  await mkdir(destinationRoot, { recursive: true });
  await rename(LEGACY_DATA_STORE_ROOT, path.join(destinationRoot, ARCHIVE_DIR_NAME));
  return {
    id: archiveId,
    label
  };
}

export function getArchivesRoot() {
  return ARCHIVES_ROOT;
}

export function getArchiveBaseDir(archiveId) {
  return path.join(ARCHIVES_ROOT, archiveId);
}

export function getArchiveDataStoreRoot(archiveId) {
  return path.join(getArchiveBaseDir(archiveId), ARCHIVE_DIR_NAME);
}

export function getArchivePaths(archiveId) {
  const dataStoreRoot = getArchiveDataStoreRoot(archiveId);
  return {
    archiveId,
    archiveBaseDir: getArchiveBaseDir(archiveId),
    dataStoreRoot,
    archiveConfigPath: path.join(dataStoreRoot, "archive-config.json"),
    backupsRoot: path.join(dataStoreRoot, "backups"),
    referenceDir: path.join(dataStoreRoot, "reference"),
    storiesDir: path.join(dataStoreRoot, "stories"),
    metaStoriesDir: path.join(dataStoreRoot, "meta-stories")
  };
}

export async function createArchiveFromTemplate({ archiveId, label }) {
  if (!existsSync(TEMPLATE_DATA_STORE_ROOT)) {
    throw new Error(`Could not find the blank template at ${TEMPLATE_DATA_STORE_ROOT}`);
  }
  const config = await loadAppConfig();
  const existingIds = new Set((config.archives || []).map((entry) => entry.id));
  const id = makeUniqueArchiveId(archiveId || label, existingIds);
  const archivePaths = getArchivePaths(id);
  if (existsSync(archivePaths.dataStoreRoot)) {
    throw new Error(`Archive already exists: ${id}`);
  }
  await mkdir(path.dirname(archivePaths.dataStoreRoot), { recursive: true });
  await cp(TEMPLATE_DATA_STORE_ROOT, archivePaths.dataStoreRoot, { recursive: true });

  const entry = {
    id,
    label: String(label || id).trim() || id
  };
  const nextArchives = [...config.archives, entry];
  await saveAppConfig({
    ...config,
    activeArchiveId: config.activeArchiveId || id,
    archives: nextArchives
  });
  return entry;
}

export async function renameArchive({ archiveId, label }) {
  const config = await loadAppConfig();
  const normalizedLabel = String(label || "").trim();
  if (!archiveId) {
    throw new Error("Archive id is required.");
  }
  if (!normalizedLabel) {
    throw new Error("Archive label is required.");
  }
  const archive = config.archives.find((entry) => entry.id === archiveId);
  if (!archive) {
    throw new Error("Archive not found.");
  }
  const archives = config.archives.map((entry) => (
    entry.id === archiveId
      ? { ...entry, label: normalizedLabel }
      : entry
  ));
  await saveAppConfig({
    ...config,
    archives
  });
  return archives.find((entry) => entry.id === archiveId) || { id: archiveId, label: normalizedLabel };
}

export async function deleteArchive({ archiveId }) {
  const config = await loadAppConfig();
  if (!archiveId) {
    throw new Error("Archive id is required.");
  }
  const archive = config.archives.find((entry) => entry.id === archiveId);
  if (!archive) {
    throw new Error("Archive not found.");
  }
  if ((config.archives || []).length <= 1) {
    throw new Error("At least one archive must remain.");
  }

  const remainingArchives = config.archives.filter((entry) => entry.id !== archiveId);
  const backupDir = path.join(
    DELETED_ARCHIVE_BACKUPS_ROOT,
    `deleted-archive-backup-${archiveId}-${timestampForFilename()}`
  );
  await mkdir(backupDir, { recursive: true });
  await cp(getArchiveDataStoreRoot(archiveId), path.join(backupDir, ARCHIVE_DIR_NAME), { recursive: true });

  const archiveBaseDir = getArchiveBaseDir(archiveId);
  await rm(archiveBaseDir, { recursive: true, force: true });

  const archives = remainingArchives;
  const activeArchiveId = config.activeArchiveId === archiveId
    ? (archives[0]?.id || null)
    : config.activeArchiveId;

  await saveAppConfig({
    ...config,
    activeArchiveId,
    archives
  });

  return {
    deletedArchiveId: archiveId,
    activeArchiveId,
    backupDir
  };
}

export async function ensureArchiveRegistry() {
  const config = await loadAppConfig();
  await mkdir(ARCHIVES_ROOT, { recursive: true });

  let archives = [];
  const seenIds = new Set();
  for (const entry of Array.isArray(config.archives) ? config.archives : []) {
    const normalized = normalizeArchiveEntry(entry);
    if (!normalized || seenIds.has(normalized.id)) {
      continue;
    }
    if (!existsSync(getArchiveDataStoreRoot(normalized.id))) {
      continue;
    }
    seenIds.add(normalized.id);
    archives.push(normalized);
  }

  if (!archives.length) {
    const discovered = await listArchiveDirectories();
    for (const entry of discovered) {
      if (seenIds.has(entry.id)) {
        continue;
      }
      seenIds.add(entry.id);
      archives.push(entry);
    }
  }

  if (!archives.length) {
    const migrated = await migrateLegacyArchive(seenIds);
    if (migrated) {
      seenIds.add(migrated.id);
      archives.push(migrated);
    }
  }

  if (!archives.length) {
    const created = await createArchiveFromTemplate({ archiveId: "archive-1", label: "Archive 1" });
    return {
      ...(await loadAppConfig()),
      activeArchiveId: created.id,
      archives: [created]
    };
  }

  const activeArchiveId = archives.some((entry) => entry.id === config.activeArchiveId)
    ? config.activeArchiveId
    : archives[0].id;

  await saveAppConfig({
    ...config,
    activeArchiveId,
    archives
  });
  return loadAppConfig();
}

export async function getActiveArchivePaths(appConfig = null) {
  const config = appConfig || await ensureArchiveRegistry();
  const activeArchiveId = String(config?.activeArchiveId || "").trim();
  if (!activeArchiveId) {
    throw new Error("No active archive is configured.");
  }
  return getArchivePaths(activeArchiveId);
}
