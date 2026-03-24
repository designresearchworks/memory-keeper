Memory Keeper Dev Build
=======================

This folder is the working development copy of Memory Keeper.

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
- memory-keeper-data-store/

Folder layout
-------------
Memory Keeper now runs against the whole app folder through the local helper server.

At the top level you should have:
- app-config.json
- memory-keeper-data-store/
- html/
- scripts/
- system-prompts/

Inside memory-keeper-data-store/ you should have:
- archive-config.json
- reference/
- stories/
- meta-stories/
- backups/

Important working files:
- memory-keeper-data-store/reference/profile.md
- memory-keeper-data-store/reference/style-guide.md
- memory-keeper-data-store/meta-stories/story-index.md
- memory-keeper-data-store/meta-stories/follow-ups.md

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
   - create or update a local memory-keeper-data-store/ working folder from the blank template if needed
   - start the local server
4. Open: http://127.0.0.1:8787
5. The app will use the local archive in this folder automatically.

Notes
-----
- app-config.json stores app-level runtime settings.
- memory-keeper-data-store/archive-config.json stores archive-level settings.
- templates-for-blank-build/ is the source template used for packaging and first-run archive creation.
- stories/ is for actual story files only.
- meta-stories/ stores archive-wide metadata such as the story index and follow-up prompts.
- backups/ stores timestamped backups created before important overwrites.
- system-prompts/ contains the editable prompt files used by the app at runtime.
