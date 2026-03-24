# Multi-Archive Verification Prompt

Use this prompt after the refactor to perform a focused audit for missed single-archive assumptions.

## Prompt

Review this codebase for leftover assumptions that the live archive is always at a top-level `memory-keeper-data-store/` path.

Focus on:

- hardcoded filesystem joins like `path.join(APP_ROOT, "memory-keeper-data-store")`
- hardcoded constants such as `DATA_STORE_ROOT`, `ARCHIVE_CONFIG_PATH`, and `BACKUPS_ROOT` that still resolve a single global archive
- managed-path validation code that assumes one fixed archive root
- scripts that still read or write the top-level archive directly
- import/export code that still overwrites the active archive instead of creating or selecting an archive
- client copy or API usage that implies only one available archive exists

Treat these as allowed only if they are clearly intentional:

- template paths under `templates-for-blank-build/`
- active-archive relative client paths like `memory-keeper-data-store/stories/foo.md` when the server maps them through the active archive resolver
- one-time migration code that moves the legacy top-level archive into `archives/<id>/memory-keeper-data-store/`
- documentation describing the old system only if marked historical

Return:

1. definite problems
2. suspicious leftovers that need review
3. any server code paths that still bypass the central archive resolver
4. any scripts that still need to be made archive-aware

For each issue, include:

- file path
- line reference
- why it is still a single-archive assumption
- whether it is runtime-critical or documentation-only
