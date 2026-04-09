# Codebase Onboarding Agent — Backend

A NestJS pipeline that ingests microservice repositories, extracts structured metadata (routes, schemas, events, dependencies, environment variables) via AST analysis, generates OpenAI embeddings, and stores them in PostgreSQL + pgvector. It exposes a RAG endpoint that new engineers can query to understand how services interact — tracing flows across HTTP calls, events, and shared databases — without reading every codebase manually.

## Architecture

```text
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

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- OpenAI API key (`text-embedding-3-small` + `gpt-4o` access)

## Quick Start

```bash
# 1. Start infrastructure (PostgreSQL with pgvector + Redis)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_URL, OPENAI_API_KEY, GITHUB_WEBHOOK_SECRET

# 4. Run database migrations
npm run migration:run

# 5. Start the server in development mode
npm run start:dev
```

The API will be available at `http://localhost:3000/api`.  
Swagger UI is at `http://localhost:3000/api/docs`.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | yes | — | Redis connection string |
| `OPENAI_API_KEY` | yes | — | OpenAI API key |
| `EMBEDDING_MODEL` | no | `text-embedding-3-small` | Embedding model name |
| `EMBEDDING_DIMENSIONS` | no | `1536` | Embedding vector dimensions |
| `GITHUB_WEBHOOK_SECRET` | yes | — | HMAC secret for GitHub webhook verification |
| `CLONE_BASE_PATH` | no | `/tmp/repos` | Directory for cloned repos |
| `SIMILARITY_THRESHOLD` | no | `0.78` | Minimum cosine similarity for chunk retrieval |
| `LLM_MODEL` | no | `gpt-4o` | Chat completion model |
| `PORT` | no | `3000` | HTTP server port |
| `NODE_ENV` | no | `development` | Runtime environment |

## API Reference

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/repos/register` | Register a new repository for indexing |
| `POST` | `/api/repos/:id/reindex` | Trigger a manual reindex of a repository |
| `GET` | `/api/repos` | List all registered repositories with their service node data |
| `GET` | `/api/repos/:id` | Get a single repository with its service node |
| `POST` | `/api/query/ask` | Ask a cross-service question (RAG endpoint) |
| `GET` | `/api/graph` | Get the full service dependency graph |
| `POST` | `/api/webhooks/github` | Receive a GitHub push webhook and trigger ingestion |
| `GET` | `/api/health` | Check DB and Redis health |

## Register a Repository

```bash
curl -X POST http://localhost:3000/api/repos/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user-service",
    "gitUrl": "https://github.com/your-org/user-service.git",
    "branch": "main",
    "serviceId": "user-service"
  }'
```

The pipeline runs asynchronously: clone → extract → embed → build dependency graph. Poll `GET /api/repos/:id` and check `status` (`PENDING` → `CLONING` → `EXTRACTING` → `EMBEDDING` → `READY`).

## Ask a Question

```bash
curl -X POST http://localhost:3000/api/query/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How does a new user get created and what events are published?",
    "serviceFilter": ["user-service", "notification-service"]
  }'
```

Response shape:

```json
{
  "answer": "When POST /users is called on user-service...",
  "consultedServices": ["user-service", "notification-service"],
  "sources": [
    {
      "serviceId": "user-service",
      "filePath": "src/users/users.controller.ts",
      "chunkType": "ROUTE_HANDLER",
      "similarity": 0.91
    }
  ]
}
```

`serviceFilter` is optional — omit it to search across all indexed services.

## GitHub Webhook Setup

1. In your GitHub repository go to **Settings → Webhooks → Add webhook**.
2. Set **Payload URL** to `https://your-domain/api/webhooks/github`.
3. Set **Content type** to `application/json`.
4. Set **Secret** to the same value as `GITHUB_WEBHOOK_SECRET` in your `.env`.
5. Select **Just the push event**.

On every push to a tracked branch, the pipeline will automatically re-index the repository.

## Development

```bash
npm run build                                          # compile TypeScript
npm run start:dev                                      # dev mode with file watch
npm run test                                           # unit + integration tests
npm run test:cov                                       # test coverage report
npm run lint                                           # ESLint (auto-fix)
npm run migration:generate -- --name MyMigration       # generate migration from entity changes
npm run migration:run                                  # apply pending migrations
npm run migration:revert                               # revert last migration
```
