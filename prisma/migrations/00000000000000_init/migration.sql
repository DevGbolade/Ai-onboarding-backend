-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('PENDING', 'CLONING', 'EXTRACTING', 'EMBEDDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ChunkType" AS ENUM ('ROUTE_HANDLER', 'SCHEMA_MODEL', 'EVENT_HANDLER', 'SERVICE_METHOD', 'CONFIGURATION', 'README', 'FILE_SUMMARY');

-- CreateEnum
CREATE TYPE "EdgeType" AS ENUM ('HTTP_CALL', 'EVENT_PUB_SUB', 'SHARED_DATABASE', 'IMPORT');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gitUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "serviceId" TEXT NOT NULL,
    "lastIndexed" TIMESTAMP(3),
    "status" "RepositoryStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNode" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "routes" JSONB NOT NULL,
    "schema" JSONB NOT NULL,
    "publishes" JSONB NOT NULL,
    "subscribes" JSONB NOT NULL,
    "dependencies" JSONB NOT NULL,
    "techStack" TEXT,
    "keyFiles" JSONB NOT NULL,
    "envVars" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "chunkType" "ChunkType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyEdge" (
    "id" TEXT NOT NULL,
    "fromService" TEXT NOT NULL,
    "toService" TEXT NOT NULL,
    "edgeType" "EdgeType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependencyEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_name_key" ON "Repository"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_serviceId_key" ON "Repository"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNode_repositoryId_key" ON "ServiceNode"("repositoryId");

-- CreateIndex
CREATE INDEX "Chunk_serviceId_idx" ON "Chunk"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DependencyEdge_fromService_toService_edgeType_detail_key" ON "DependencyEdge"("fromService", "toService", "edgeType", "detail");

-- AddForeignKey
ALTER TABLE "ServiceNode" ADD CONSTRAINT "ServiceNode_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
