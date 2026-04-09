---
name: migrate
description: Generate, review, and run TypeORM database migrations for the onboarding agent. Use when changing entity schemas, adding columns, or modifying table structure.
allowed-tools: Bash(npm run migration:*), Bash(npm run typeorm:*), Bash(npm run build), Read(src/database/**)
---

## Migration Workflow

This project uses TypeORM with `synchronize: false`. All schema changes **must** go through migrations.

### Step 1 — Make entity changes first

Edit the relevant file in `src/database/entities/`. The `embedding` column on `ChunkEntity` is intentionally absent from the entity — do not add it; it is managed via raw SQL in the migration.

### Step 2 — Generate migration

```bash
npm run migration:generate -- --name DescribeWhatChanged
```

Generated file appears in `src/database/migrations/`. Always review it before running.

### Step 3 — Review the generated migration

Check:
- UP method creates/alters exactly what you intended
- DOWN method correctly reverses the change
- No accidental `DROP TABLE` or column drops
- For `chunks` embedding column: use `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)`

### Step 4 — Run the migration

```bash
npm run migration:run
```

### Step 5 — Verify

Restart the server and confirm the affected endpoint or worker behaves correctly.

### Revert if needed

```bash
npm run migration:revert
```

## Constraints (from CLAUDE.md)

- `synchronize: false` — always. Never set it to `true` in any environment.
- The `embedding vector(1536)` column on `chunks` is NOT in the TypeORM entity. It is created and queried via raw SQL only.
- `service_nodes.repositoryId` and `chunks.repositoryId` are `uuid` type — they must match `repositories.id`.

See [migration-patterns.md](migration-patterns.md) for SQL examples.
