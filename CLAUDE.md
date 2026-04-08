# CLAUDE.md — Codebase Onboarding Agent: Repo Ingestion Pipeline

## Project Overview

A NestJS-based pipeline that ingests microservice repositories, extracts structured metadata (routes, schemas, events, dependencies, env vars), generates embeddings, and stores them in PostgreSQL + pgvector. This powers an AI onboarding agent that answers cross-service questions for new engineers.

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.x (strict mode)
- **Framework**: NestJS 10 (modular monolith pattern)
- **ORM**: TypeORM 0.3.x with PostgreSQL 16
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
│   └── configuration.ts          # typed env config
├── database/
│   ├── database.module.ts        # TypeORM configuration
│   ├── entities/
│   │   ├── repository.entity.ts
│   │   ├── service-node.entity.ts
│   │   ├── chunk.entity.ts
│   │   └── dependency-edge.entity.ts
│   └── migrations/
│       └── 1700000000000-InitSchema.ts
├── common/
│   ├── interfaces/
│   │   ├── extracted-metadata.interface.ts
│   │   └── embedding-provider.interface.ts
│   ├── dto/
│   │   ├── register-repo.dto.ts
│   │   └── query.dto.ts
│   ├── enums/
│   │   ├── repository-status.enum.ts
│   │   ├── chunk-type.enum.ts
│   │   └── edge-type.enum.ts
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
│   │   ├── typeorm.extractor.ts  # TypeORM entity parser
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
└── query/
    ├── query.module.ts
    ├── query.controller.ts       # POST /query/ask
    └── query.service.ts          # multi-service RAG orchestration
```

## Database Entities (TypeORM)

### Repository Entity

```typescript
@Entity('repositories')
export class RepositoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  gitUrl: string;

  @Column({ default: 'main' })
  branch: string;

  @Column({ unique: true })
  serviceId: string;

  @Column({ type: 'timestamp', nullable: true })
  lastIndexed: Date | null;

  @Column({ type: 'enum', enum: RepositoryStatus, default: RepositoryStatus.PENDING })
  status: RepositoryStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ChunkEntity, (chunk) => chunk.repository)
  chunks: ChunkEntity[];

  @OneToOne(() => ServiceNodeEntity, (node) => node.repository)
  serviceNode: ServiceNodeEntity;
}
```

### ServiceNode Entity

```typescript
@Entity('service_nodes')
export class ServiceNodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  repositoryId: string;

  @OneToOne(() => RepositoryEntity, (repo) => repo.serviceNode)
  @JoinColumn({ name: 'repositoryId' })
  repository: RepositoryEntity;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: [] })
  routes: string[];

  @Column({ type: 'jsonb', default: [] })
  schemas: string[];

  @Column({ type: 'jsonb', default: [] })
  publishes: string[];

  @Column({ type: 'jsonb', default: [] })
  subscribes: string[];

  @Column({ type: 'jsonb', default: [] })
  dependencies: string[];

  @Column({ type: 'text', nullable: true })
  techStack: string | null;

  @Column({ type: 'jsonb', default: [] })
  keyFiles: string[];

  @Column({ type: 'jsonb', default: [] })
  envVars: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Chunk Entity

```typescript
@Entity('chunks')
@Index(['serviceId'])
export class ChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  repositoryId: string;

  @ManyToOne(() => RepositoryEntity, (repo) => repo.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repositoryId' })
  repository: RepositoryEntity;

  @Column()
  serviceId: string;

  @Column({ type: 'enum', enum: ChunkType })
  chunkType: ChunkType;

  @Column()
  filePath: string;

  @Column({ type: 'text' })
  content: string;

  // IMPORTANT: The `embedding` column is NOT declared here.
  // pgvector's vector(1536) type is not supported by TypeORM.
  // It is created via migration raw SQL and accessed via raw queries only.

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

### DependencyEdge Entity

```typescript
@Entity('dependency_edges')
@Unique(['fromService', 'toService', 'edgeType', 'detail'])
export class DependencyEdgeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fromService: string;

  @Column()
  toService: string;

  @Column({ type: 'enum', enum: EdgeType })
  edgeType: EdgeType;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Enums

```typescript
// src/common/enums/repository-status.enum.ts
export enum RepositoryStatus {
  PENDING = 'PENDING',
  CLONING = 'CLONING',
  EXTRACTING = 'EXTRACTING',
  EMBEDDING = 'EMBEDDING',
  READY = 'READY',
  FAILED = 'FAILED',
}

// src/common/enums/chunk-type.enum.ts
export enum ChunkType {
  ROUTE_HANDLER = 'ROUTE_HANDLER',
  SCHEMA_MODEL = 'SCHEMA_MODEL',
  EVENT_HANDLER = 'EVENT_HANDLER',
  SERVICE_METHOD = 'SERVICE_METHOD',
  CONFIGURATION = 'CONFIGURATION',
  README = 'README',
  FILE_SUMMARY = 'FILE_SUMMARY',
}

// src/common/enums/edge-type.enum.ts
export enum EdgeType {
  HTTP_CALL = 'HTTP_CALL',
  EVENT_PUB_SUB = 'EVENT_PUB_SUB',
  SHARED_DATABASE = 'SHARED_DATABASE',
  IMPORT = 'IMPORT',
}
```

## TypeORM Configuration

```typescript
// src/database/database.module.ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [RepositoryEntity, ServiceNodeEntity, ChunkEntity, DependencyEdgeEntity],
        migrations: ['dist/database/migrations/*.js'],
        synchronize: false, // NEVER true — always use migrations
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([RepositoryEntity, ServiceNodeEntity, ChunkEntity, DependencyEdgeEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
```

## Coding Conventions

### General Rules

- **Strict TypeScript**: no `any` types. Use proper interfaces from `src/common/interfaces/`.
- **NestJS patterns**: use dependency injection, decorators, modules. No raw imports between modules — export via module providers.
- **TypeORM patterns**: inject repositories via `@InjectRepository(Entity)`. Use QueryBuilder for complex queries. Use `DataSource.query()` for raw SQL ONLY for pgvector operations.
- **Error handling**: use NestJS built-in exception filters. Workers must catch all errors and update repository status to FAILED with error details in metadata.
- **Logging**: use NestJS Logger (injected per class). Log at INFO for pipeline stage transitions, DEBUG for extraction details, ERROR for failures.
- **Environment variables**: all config via `src/config/configuration.ts` with validation using `class-validator`. Never hardcode secrets.
- **File operations**: use temp directories under `/tmp/repos/{serviceId}/` for cloned repos. Clean up after embedding is complete.

### Naming Conventions

- Files: `kebab-case` (e.g., `clone.worker.ts`, `nestjs.extractor.ts`)
- Classes: `PascalCase` with NestJS suffix (e.g., `CloneWorker`, `NestjsExtractor`)
- Entities: `PascalCase` + `Entity` suffix (e.g., `RepositoryEntity`, `ChunkEntity`)
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

- Use pgvector's `<=>` cosine distance operator via `DataSource.query()` raw SQL
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
npm run typeorm            # run TypeORM CLI
npm run migration:generate # generate migration from entity changes
npm run migration:run      # run pending migrations
npm run migration:revert   # revert last migration
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
8. **TypeORM synchronize: false** — always use migrations, never auto-sync in any environment
9. **pgvector column not in entity** — the `embedding` column on ChunkEntity is NOT declared as a TypeORM column. It is created and queried via raw SQL only.