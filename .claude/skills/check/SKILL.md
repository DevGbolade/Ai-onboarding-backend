---
name: check
description: Run the full quality gate — build, lint, and tests — in sequence. Use before committing or when verifying the project compiles and all tests pass.
allowed-tools: Bash(npm run build), Bash(npm run lint), Bash(npm test)
---

Run the full quality gate in order:

1. **Build** — `npm run build`
   - Must produce zero TypeScript errors
   - NestJS decorator metadata must compile correctly

2. **Lint** — `npm run lint`
   - ESLint with TypeScript rules
   - Auto-fixes applied; reports remaining errors

3. **Test** — `npm test`
   - Runs all `.spec.ts` files under `src/` and `test/`
   - Extractor unit tests + integration pipeline tests + chunk util tests

Stop at the first failure and show the exact error output. Do not continue to the next step.

On full success, report:
```
✓ build — zero errors
✓ lint  — zero errors
✓ tests — N passing
```
