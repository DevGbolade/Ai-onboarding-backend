# Migration Patterns

## Add a nullable column

```typescript
await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "description" text`);
```

## Add a non-nullable column with default

```typescript
await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "retryCount" integer NOT NULL DEFAULT 0`);
```

## Add a new table

```typescript
await queryRunner.query(`
  CREATE TABLE IF NOT EXISTS "my_table" (
    "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
    "name"      character varying NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_my_table" PRIMARY KEY ("id")
  )
`);
```

## Add a foreign key (uuid → uuid)

```typescript
await queryRunner.query(`
  ALTER TABLE "my_table"
  ADD CONSTRAINT "FK_my_table_repository"
  FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE
`);
```

## Add a pgvector column (chunks only — do not add to entity)

```typescript
await queryRunner.query(
  `ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS embedding vector(1536)`
);
```

## Add a unique constraint

```typescript
await queryRunner.query(`
  ALTER TABLE "dependency_edges"
  ADD CONSTRAINT "UQ_dependency_edges"
  UNIQUE ("fromService", "toService", "edgeType", "detail")
`);
```

## Rollback pattern

```typescript
public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN IF EXISTS "description"`);
}
```
