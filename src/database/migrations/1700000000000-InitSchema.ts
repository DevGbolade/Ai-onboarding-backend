import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');

    // repositories
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "repositories" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "name"        character varying NOT NULL,
        "gitUrl"      character varying NOT NULL,
        "branch"      character varying NOT NULL DEFAULT 'main',
        "serviceId"   character varying NOT NULL,
        "lastIndexed" TIMESTAMP,
        "status"      character varying NOT NULL DEFAULT 'PENDING',
        "metadata"    jsonb,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_repositories_name"      UNIQUE ("name"),
        CONSTRAINT "UQ_repositories_serviceId" UNIQUE ("serviceId"),
        CONSTRAINT "PK_repositories"           PRIMARY KEY ("id")
      )
    `);

    // service_nodes
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_nodes" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "repositoryId" uuid NOT NULL,
        "name"         character varying NOT NULL,
        "description"  text,
        "routes"       jsonb NOT NULL DEFAULT '[]',
        "schemas"      jsonb NOT NULL DEFAULT '[]',
        "publishes"    jsonb NOT NULL DEFAULT '[]',
        "subscribes"   jsonb NOT NULL DEFAULT '[]',
        "dependencies" jsonb NOT NULL DEFAULT '[]',
        "techStack"    text,
        "keyFiles"     jsonb NOT NULL DEFAULT '[]',
        "envVars"      jsonb NOT NULL DEFAULT '[]',
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_service_nodes_repositoryId" UNIQUE ("repositoryId"),
        CONSTRAINT "PK_service_nodes"              PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_nodes_repository"
          FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE
      )
    `);

    // chunks
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chunks" (
        "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
        "repositoryId" uuid NOT NULL,
        "serviceId"    character varying NOT NULL,
        "chunkType"    character varying NOT NULL,
        "filePath"     character varying NOT NULL,
        "content"      text NOT NULL,
        "metadata"     jsonb,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chunks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chunks_repository"
          FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE
      )
    `);

    // embedding column (pgvector — not in TypeORM entity)
    await queryRunner.query(
      'ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS embedding vector(1536)',
    );

    // index for vector similarity search
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_chunks_serviceId" ON "chunks" ("serviceId")'
    );

    // dependency_edges
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dependency_edges" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "fromService" character varying NOT NULL,
        "toService"   character varying NOT NULL,
        "edgeType"    character varying NOT NULL,
        "detail"      text,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_dependency_edges" UNIQUE ("fromService", "toService", "edgeType", "detail"),
        CONSTRAINT "PK_dependency_edges" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "dependency_edges"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_chunks_serviceId"');
    await queryRunner.query('DROP TABLE IF EXISTS "chunks"');
    await queryRunner.query('DROP TABLE IF EXISTS "service_nodes"');
    await queryRunner.query('DROP TABLE IF EXISTS "repositories"');
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}
