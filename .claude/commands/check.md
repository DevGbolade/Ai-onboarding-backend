---
name: check
description: Run the full quality gate — build, lint, and tests — in sequence. Use before committing or when verifying the project is healthy.
allowed-tools: Bash(npm run build), Bash(npm run lint), Bash(npm test)
---

Run the full quality gate in order and report results:

1. `npm run build` — TypeScript compilation, zero errors required
2. `npm run lint` — ESLint with auto-fix
3. `npm test` — all Jest unit + integration tests

If any step fails, stop and show the exact errors. Do not proceed to the next step after a failure.

Report a final summary: ✓ build, ✓ lint, ✓ tests — or which step failed and why.
