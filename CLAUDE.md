# CLAUDE.md — Codebase Onboarding Agent: Repo Ingestion Pipeline

## Project Overview

A NestJS-based pipeline that ingests microservice repositories, extracts structured metadata (routes, schemas, events, dependencies, env vars), generates embeddings, and stores them in PostgreSQL + pgvector. This powers an AI onboarding agent that answers cross-service questions for new engineers.

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.x (strict mode)
- **Framework**: NestJS 10 (modular monolith pattern)
- **ORM**: Prisma 5 with PostgreSQL 16
- **Vector Store**: pgvector extension for PostgreSQL
- **Queue**: BullMQ with Redis 7
- **AST Parsing**: ts-morph (TypeScript AST analysis)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions) — configurable via provider interface
- **Git Operations**: simple-git
- **Testing**: Jest + supertest
- **Containerization**: Docker + Docker Compose

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    NestJS Application                      │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Webhook     │  │  Ingestion   │  │  Query           │  │
│  │  Module      │──│  Module      │  │  Module          │  │
│  └─────────────┘  └──────┬───────┘  └────────┬────────┘  │
│                          │                     │           │
│  ┌───────────────────────┴─────────────────────┘          │
│  │                                                         │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  │  Clone   │→│ Extract  │→│ Chunk +  │→│ Dep Graph│  │
│  │  │  Worker  │ │ Worker   │ │ Embed    │ │ Builder  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  │         BullMQ Job Pipeline                             │
│  └─────────────────────────────────────────────────────────│
│                                                            │
│  ┌──────────────────────┐  ┌─────────────┐                │
│  │  PostgreSQL + pgvector│  │  Redis       │                │
│  └──────────────────────┘  └─────────────┘                │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app.module.ts
├── main.ts
├── config/
│   ├── config.module.ts
│   ├── config.service.ts
│   └── configuration.ts          # typed env config
├── common/
│   ├── interfaces/
│   │   ├── extracted-metadata.interface.ts
│   │   ├── service-node.interface.ts
│   │   └── embedding-provider.interface.ts
│   ├── dto/
│   │   ├── register-repo.dto.ts
│   │   └── query.dto.ts
│   └── utils/
│       └── chunk.util.ts
├── webhook/
│   ├── webhook.module.ts
│   ├── webhook.controller.ts     # POST /webhooks/github
│   └── webhook.service.ts
├── ingestion/
│   ├── ingestion.module.ts
│   ├── ingestion.service.ts      # orchestrates pipeline
│   ├── workers/
│   │   ├── clone.worker.ts       # clones/pulls repos
│   │   ├── extract.worker.ts     # AST extraction
│   │   ├── embed.worker.ts       # chunking + embedding
│   │   └── graph.worker.ts       # dependency graph rebuild
│   ├── extractors/
│   │   ├── base.extractor.ts     # abstract base class
│   │   ├── nestjs.extractor.ts   # NestJS-specific extraction
│   │   ├── prisma.extractor.ts   # Prisma schema parser
│   │   ├── event.extractor.ts    # event publisher/subscriber detection
│   │   ├── env.extractor.ts      # env var extraction
│   │   └── dependency.extractor.ts # inter-service call detection
│   └── providers/
│       ├── embedding.provider.ts       # interface
│       └── openai-embedding.provider.ts # OpenAI implementation
├── knowledge/
│   ├── knowledge.module.ts
│   ├── knowledge.service.ts      # vector search + retrieval
│   └── graph.service.ts          # dependency graph queries
├── query/
│   ├── query.module.ts
│   ├── query.controller.ts       # POST /query/ask
│   └── query.service.ts          # multi-service RAG orchestration
└── prisma/
    ├── schema.prisma
    └── migrations/
```

## Database Schema (Prisma)

```prisma
model Repository {
  id          String   @id @default(uuid())
  name        String   @unique
  gitUrl      String
  branch      String   @default("main")
  serviceId   String   @unique
  lastIndexed DateTime?
  status      RepositoryStatus @default(PENDING)
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  chunks      Chunk[]
  serviceNode ServiceNode?
}

model ServiceNode {
  id           String   @id @default(uuid())
  repositoryId String   @unique
  repository   Repository @relation(fields: [repositoryId], references: [id])
  name         String
  description  String?
  routes       Json     // string[]
  schema       Json     // string[] (table names)
  publishes    Json     // string[] (event names)
  subscribes   Json     // string[] (event names)
  dependencies Json     // string[] (service IDs)
  techStack    String?
  keyFiles     Json     // string[]
  envVars      Json     // string[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Chunk {
  id           String   @id @default(uuid())
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id])
  serviceId    String
  chunkType    ChunkType
  filePath     String
  content      String
  embedding    Unsupported("vector(1536)")
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([serviceId])
}

model DependencyEdge {
  id         String   @id @default(uuid())
  fromService String
  toService   String
  edgeType   EdgeType
  detail     String?  // e.g., "POST /api/users" or "user.registered"
  createdAt  DateTime @default(now())

  @@unique([fromService, toService, edgeType, detail])
}

enum RepositoryStatus {
  PENDING
  CLONING
  EXTRACTING
  EMBEDDING
  READY
  FAILED
}

enum ChunkType {
  ROUTE_HANDLER
  SCHEMA_MODEL
  EVENT_HANDLER
  SERVICE_METHOD
  CONFIGURATION
  README
  FILE_SUMMARY
}

enum EdgeType {
  HTTP_CALL
  EVENT_PUB_SUB
  SHARED_DATABASE
  IMPORT
}
```

## Coding Conventions

### General Rules

- **Strict TypeScript**: no `any` types. Use proper interfaces from `src/common/interfaces/`.
- **NestJS patterns**: use dependency injection, decorators, modules. No raw imports between modules — export via module providers.
- **Error handling**: use NestJS built-in exception filters. Workers must catch all errors and update repository status to FAILED with error details in metadata.
- **Logging**: use NestJS Logger (injected per class). Log at INFO for pipeline stage transitions, DEBUG for extraction details, ERROR for failures.
- **Environment variables**: all config via `src/config/configuration.ts` with validation using `class-validator`. Never hardcode secrets.
- **File operations**: use temp directories under `/tmp/repos/{serviceId}/` for cloned repos. Clean up after embedding is complete.

### Naming Conventions

- Files: `kebab-case` (e.g., `clone.worker.ts`, `nestjs.extractor.ts`)
- Classes: `PascalCase` with NestJS suffix (e.g., `CloneWorker`, `NestjsExtractor`)
- Interfaces: prefix with `I` only if needed to avoid collision, otherwise just `PascalCase`
- DTOs: `PascalCase` + `Dto` suffix (e.g., `RegisterRepoDto`)
- Queue names: `SCREAMING_SNAKE_CASE` constants (e.g., `CLONE_QUEUE`, `EXTRACT_QUEUE`)

### BullMQ Patterns

- Each pipeline stage is a separate queue: `clone`, `extract`, `embed`, `graph`
- Workers use the `@Processor` decorator from `@nestjs/bullmq`
- Jobs carry `{ repositoryId, serviceId }` as minimum payload
- On completion, each worker dispatches to the next queue
- On failure, update `Repository.status = FAILED` and store error in `Repository.metadata`

### Extractor Pattern

All extractors extend `BaseExtractor`:

```typescript
export abstract class BaseExtractor {
  abstract extract(projectPath: string): Promise<Partial<ExtractedMetadata>>;
}

export interface ExtractedMetadata {
  routes: RouteInfo[];
  schemas: string[];
  publishedEvents: string[];
  subscribedEvents: string[];
  dependencies: DependencyInfo[];
  envVars: string[];
  keyFiles: string[];
  description: string;
  techStack: string;
}
```

### Embedding Provider Pattern

```typescript
export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}
```

### Vector Search

- Use pgvector's `<=>` cosine distance operator
- Always filter by `serviceId` when searching within a service
- For cross-service queries, retrieve top-K per service then re-rank
- Similarity threshold: 0.78 (configurable)

## API Endpoints

```
POST /webhooks/github           - GitHub webhook receiver
POST /api/repos/register        - Register a new repo for indexing
POST /api/repos/:id/reindex     - Trigger manual reindex
GET  /api/repos                 - List all registered repos with status
GET  /api/repos/:id             - Get repo details + service node
GET  /api/graph                 - Get full dependency graph
POST /api/query/ask             - Ask a question (RAG endpoint)
GET  /api/health                - Health check
```

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/onboarding_agent
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
GITHUB_WEBHOOK_SECRET=whsec_...
CLONE_BASE_PATH=/tmp/repos
SIMILARITY_THRESHOLD=0.78
PORT=3000
NODE_ENV=development
```

## Docker Compose Services

- `app` — NestJS application
- `postgres` — PostgreSQL 16 with pgvector extension
- `redis` — Redis 7

## Build & Run Commands

```bash
npm run build              # compile TypeScript
npm run start:dev          # dev mode with watch
npm run start:prod         # production
npm run test               # unit tests
npm run test:e2e           # e2e tests
npm run prisma:generate    # generate Prisma client
npm run prisma:migrate     # run migrations
npm run prisma:studio      # open Prisma Studio
docker compose up -d       # start infrastructure
docker compose down        # stop infrastructure
```

## Testing Requirements

- Unit tests for every extractor (mock file system with fixture repos)
- Unit tests for chunking logic
- Integration tests for the full pipeline (clone → extract → embed → graph)
- E2e tests for API endpoints
- Test fixtures: create a minimal NestJS project under `test/fixtures/sample-service/`

## Important Constraints

1. **Never commit secrets** — .env files are gitignored
2. **pgvector must be enabled** — migration must run `CREATE EXTENSION IF NOT EXISTS vector`
3. **ts-morph is read-only** — never modify the cloned repos
4. **Chunking limit** — each chunk max 500 tokens. Overlap 50 tokens between consecutive chunks from the same file.
5. **Rate limiting** — OpenAI embedding calls must be batched (max 100 texts per call) with retry logic
6. **Idempotent reindex** — re-indexing a repo must delete old chunks/nodes before inserting new ones (upsert pattern)
7. **Git credentials** — support both HTTPS (token-based) and SSH clone URLs