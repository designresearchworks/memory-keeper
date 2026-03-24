# Multi-Archive Migration Plan

## Goal

Refactor Memory Keeper from a single hardcoded live archive at `memory-keeper-data-store/` to a multi-archive model with:

- many available archives under `archives/<id>/memory-keeper-data-store/`
- one active archive selected in `app-config.json`
- no ongoing concept of a "default" archive

This plan assumes there are no external installed users to migrate. The refactor can therefore treat the new layout as canonical immediately, with only a one-time local migration for the current working copy.

## Target Filesystem Layout

```text
dev-build/
  app-config.json
  archives/
    joe/
      memory-keeper-data-store/
    mum/
      memory-keeper-data-store/
  templates-for-blank-build/
    memory-keeper-data-store/
```

Rules:

- `archives/` contains only real user archives.
- `templates-for-blank-build/` stays at app root and is never treated as an archive.
- Archive ids are filesystem-safe and stable.
- Archive labels are user-facing and editable later if needed.

## Target Config Model

Add archive registry data to `app-config.json`.

Example:

```json
{
  "version": "1.0",
  "createdAt": "",
  "openRouterApiKey": null,
  "assemblyAiApiKey": null,
  "modelRouting": "auto",
  "modelOverride": null,
  "port": 8787,
  "debugMode": false,
  "activeArchiveId": "joe",
  "archives": [
    { "id": "joe", "label": "Joe" },
    { "id": "mum", "label": "Mum" }
  ]
}
```

Rules:

- `activeArchiveId` must match one of the entries in `archives`.
- `archives` is the source of truth for which archive ids are available.
- No archive entry is semantically special.
- The first created archive is just the only available archive, not a default archive.

## One-Time Migration Strategy

This refactor only needs to support a one-time migration for the current local repository state.

At startup:

1. Ensure `app-config.json` exists.
2. Ensure `archives/` exists.
3. If `app-config.json` already has a valid `archives` list and `activeArchiveId`, use it.
4. Otherwise, detect whether the legacy top-level `memory-keeper-data-store/` exists.
5. If the legacy folder exists, move it into `archives/<id>/memory-keeper-data-store/`.
6. Register that archive in `app-config.json` and mark it active.
7. If no archive exists anywhere, create the first archive from `templates-for-blank-build/memory-keeper-data-store/`, register it, and mark it active.

Recommended first-id strategy:

- If `archive-config.json` contains a storyteller name, derive a slug from it.
- Otherwise use a neutral generated id such as `archive-1`.

The migration code should be:

- idempotent
- safe to run more than once
- short-lived as a convenience layer, not a permanent compatibility feature

## Server Refactor Plan

The main risk area is server-side path resolution in `scripts/serve-local.mjs`.

### Current Problem

The server currently hardcodes:

- `DATA_STORE_ROOT`
- `ARCHIVE_CONFIG_PATH`
- `BACKUPS_ROOT`
- many path checks, file lists, backup lookups, import/export operations, and managed path rules tied to one archive root

This creates a high chance of partial refactors and path bugs.

### Refactor Rule

No endpoint should assemble archive paths ad hoc.

Every archive-specific path must come from one resolver layer based on the active archive id.

### New Resolver Layer

Introduce central helpers in `scripts/serve-local.mjs`, for example:

- `getAppConfig()`
- `saveAppConfig()`
- `getArchiveRegistry(appConfig)`
- `getActiveArchiveId(appConfig)`
- `getArchivesRoot()`
- `getArchiveBaseDir(archiveId)`
- `getArchiveDataStoreRoot(archiveId)`
- `getArchivePaths(archiveId)`
- `getActiveArchivePaths()`

`getArchivePaths(archiveId)` should return:

- `archiveId`
- `archiveBaseDir`
- `dataStoreRoot`
- `archiveConfigPath`
- `backupsRoot`
- `referenceDir`
- `storiesDir`
- `metaStoriesDir`

### Path Validation Updates

`resolveManagedPath()` and the allowlist rules must stop assuming a fixed top-level `memory-keeper-data-store/...` location.

Recommended approach:

- keep the client-facing managed paths in the same relative shape for the active archive, for example `memory-keeper-data-store/stories/foo.md`
- map those managed paths through the active archive resolver on the server
- do not expose the full `archives/<id>/...` filesystem path to the client for ordinary file operations

This keeps the client API stable while changing the server storage layout.

## Endpoint Changes

### Phase 1: Keep Existing Active-Archive Endpoints

Update existing endpoints to resolve against the active archive:

- `GET /api/archive-config`
- `POST /api/archive-config`
- `GET /api/archive/status`
- `POST /api/archive/ensure`
- `GET /api/archive/export`
- `POST /api/archive/import` if temporarily retained
- `GET /api/backups`
- `POST /api/backups/restore`
- file read/write/list/delete endpoints

The external contract can stay mostly unchanged if these endpoints operate on the active archive.

### Phase 2: Add Archive Registry Endpoints

Add:

- `GET /api/archives`
- `POST /api/archives/switch`
- `POST /api/archives/create`

Suggested response for `GET /api/archives`:

```json
{
  "activeArchiveId": "joe",
  "archives": [
    { "id": "joe", "label": "Joe" },
    { "id": "mum", "label": "Mum" }
  ]
}
```

Suggested body for `POST /api/archives/switch`:

```json
{
  "archiveId": "mum"
}
```

Suggested body for `POST /api/archives/create`:

```json
{
  "label": "Mum",
  "id": "mum"
}
```

Behavior:

- create copies the blank template into `archives/<id>/memory-keeper-data-store/`
- create registers the archive in `app-config.json`
- create sets the new archive active only if explicitly desired or if it is the first archive
- switch only updates app config and returns refreshed archive state

## Import and Export Semantics

### Export

Export should package the active archive's `memory-keeper-data-store/`.

This can remain at `GET /api/archive/export` initially, since "archive" already means the active archive in current UI flows.

### Import

The long-term behavior should change:

- import creates a new archive by default
- import does not overwrite the active archive as the normal path

Preferred later endpoint:

- `POST /api/archives/import`

Suggested behavior:

1. validate uploaded zip
2. find exactly one `memory-keeper-data-store/`
3. create a new archive id and folder
4. copy imported data into that new archive
5. register it in `app-config.json`
6. optionally switch to it

For the first implementation pass, import can remain temporarily unchanged until archive switching is stable, but the destructive overwrite path should be removed as soon as practical.

## Client Refactor Plan

`html/index.html` currently hardcodes the active archive shape in many places:

- path constants
- archive import/export copy
- backup copy and restore flows
- archive initialization and status loading

### Recommended UI Sequence

1. Keep current active-archive client model intact while the server storage changes under the hood.
2. Add archive registry loading from `GET /api/archives`.
3. Add UI showing:
   - active archive
   - available archives
   - switch archive action
   - create archive action
4. Refresh archive-facing state immediately after switching.
5. Update import/export copy and behavior after switching is stable.

### Client Rule

The client should continue to think in terms of the active archive for ordinary file editing.

That avoids a large simultaneous rewrite of:

- file path constants
- file APIs
- save and backup flows
- story editing behavior

## Script-Level Changes

### `scripts/run-memory-keeper.mjs`

Update startup logic to:

- ensure archive registry data exists in `app-config.json`
- perform the one-time move from top-level `memory-keeper-data-store/` if present
- ensure at least one available archive exists
- stop creating a top-level `memory-keeper-data-store/`

### `scripts/reprocess-stories.mjs`

This script currently reads the archive from a hardcoded top-level path.

Update it to:

- load `app-config.json`
- resolve the active archive
- read that archive's paths via shared logic or mirrored helper functions

### `scripts/build-transfer.mjs`

Review packaging assumptions and README text.

Questions to resolve during implementation:

- should transfer builds include all available archives or only the active archive
- should export/import remain per-archive while transfer remains whole-app

Recommended default:

- transfer build should include `archives/` and app config, because it represents the whole local app state

## Acceptance Criteria

The refactor is complete when all of the following are true:

1. No runtime path resolution depends on a top-level live `memory-keeper-data-store/`.
2. The app boots with only the new `archives/<id>/memory-keeper-data-store/` layout.
3. The current local archive is moved into the new layout automatically once.
4. `app-config.json` stores `activeArchiveId` and `archives`.
5. Existing active-archive endpoints still work against the selected archive.
6. Archive switching works without restarting the app.
7. Creating a new archive from the template works.
8. Backup listing and restore operate on the active archive.
9. Export packages the active archive.
10. Import no longer requires destructive overwrite as the normal behavior.

## Implementation Order

1. Add config schema support for `activeArchiveId` and `archives`.
2. Add one-time startup migration from legacy top-level archive into `archives/<id>/...`.
3. Introduce archive path resolvers in `scripts/serve-local.mjs`.
4. Convert all existing active-archive server operations to use resolver output.
5. Update `scripts/reprocess-stories.mjs` to use the active archive.
6. Add `GET /api/archives`, `POST /api/archives/switch`, and `POST /api/archives/create`.
7. Add minimal archive management UI.
8. Change import semantics to create a new archive by default.
9. Update transfer build behavior and docs.
10. Run the path-verification script and manually review any remaining intentional references.

## Verification Checklist

After implementation:

- run the path-verification script in `scripts/check-multi-archive-paths.mjs`
- review remaining references to `memory-keeper-data-store`
- confirm they exist only in:
  - templates
  - intentional client-facing active-archive relative path constants
  - migration code
  - documentation that is still accurate

Then manually verify:

- app startup with one archive
- create archive
- switch archive
- edit/save within active archive
- list backups
- restore backup
- export active archive
- import as a new archive
