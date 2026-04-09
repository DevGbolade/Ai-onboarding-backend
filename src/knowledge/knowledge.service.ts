import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { ChunkType } from "../common/enums/chunk-type.enum";
import { OpenAIEmbeddingProvider } from "../ingestion/providers/openai-embedding.provider";
import { RepositoryEntity } from "../database/entities/repository.entity";
import { ServiceNodeEntity } from "../database/entities/service-node.entity";

export interface ChunkSearchResult {
  id: string;
  repositoryId: string;
  serviceId: string;
  chunkType: ChunkType;
  filePath: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

export interface ServiceSearchResults {
  serviceId: string;
  chunks: ChunkSearchResult[];
}

interface SearchOptions {
  serviceIds?: string[];
  chunkTypes?: ChunkType[];
  limit?: number;
  threshold?: number;
}

@Injectable()
export class KnowledgeService {
  private readonly defaultThreshold: number;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    private readonly embeddingProvider: OpenAIEmbeddingProvider,
    private readonly configService: ConfigService,
  ) {
    this.defaultThreshold =
      this.configService.get<number>("similarityThreshold") ?? 0.25;
  }

  async searchChunks(
    query: string,
    options: SearchOptions = {},
  ): Promise<ChunkSearchResult[]> {
    const {
      serviceIds,
      chunkTypes,
      limit = 10,
      threshold = this.defaultThreshold,
    } = options;

    const embedding = await this.embeddingProvider.generateEmbedding(query);
    const embeddingJson = JSON.stringify(embedding);

    const params: unknown[] = [embeddingJson, threshold];
    let paramIndex = 3;

    let sql = `
      SELECT id, "repositoryId", "serviceId", "chunkType", "filePath", content, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM chunks
      WHERE 1 - (embedding <=> $1::vector) > $2
    `;

    if (serviceIds && serviceIds.length > 0) {
      sql += ` AND "serviceId" = ANY($${paramIndex}::text[])`;
      params.push(serviceIds);
      paramIndex++;
    }

    if (chunkTypes && chunkTypes.length > 0) {
      sql += ` AND "chunkType" = ANY($${paramIndex}::text[])`;
      params.push(chunkTypes);
      paramIndex++;
    }

    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(limit);

    const rows = (await this.dataSource.query(
      sql,
      params,
    )) as ChunkSearchResult[];
    return rows.map((row) => ({
      ...row,
      similarity: parseFloat(String(row.similarity)),
    }));
  }

  async searchAcrossServices(
    query: string,
    limit: number = 5,
  ): Promise<ServiceSearchResults[]> {
    const rows = (await this.dataSource.query(
      'SELECT DISTINCT "serviceId" FROM chunks',
    )) as Array<{ serviceId: string }>;
    const serviceIds = rows.map((r) => r.serviceId);

    const allResults = await Promise.all(
      serviceIds.map((serviceId) =>
        this.searchChunks(query, { serviceIds: [serviceId], limit: 3 }),
      ),
    );

    const flat = allResults
      .flat()
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    const grouped = new Map<string, ChunkSearchResult[]>();
    for (const chunk of flat) {
      if (!grouped.has(chunk.serviceId)) grouped.set(chunk.serviceId, []);
      grouped.get(chunk.serviceId)!.push(chunk);
    }

    return Array.from(grouped.entries()).map(([serviceId, chunks]) => ({
      serviceId,
      chunks,
    }));
  }

  async getServiceContext(serviceId: string): Promise<string> {
    const repo = await this.repositoryRepo.findOne({ where: { serviceId } });
    const node = repo
      ? await this.serviceNodeRepo.findOne({ where: { repositoryId: repo.id } })
      : null;
    if (!node) return `No service context found for serviceId=${serviceId}`;

    const lines: string[] = [`Service: ${node.name}`];

    if (node.description) lines.push(`Description: ${node.description}`);
    if (node.techStack) lines.push(`Tech Stack: ${node.techStack}`);

    if (node.routes.length > 0) {
      lines.push(`\nRoutes (${node.routes.length}):`);
      node.routes.forEach((r) => lines.push(`  - ${r}`));
    }

    if (node.schemas.length > 0) {
      lines.push(`\nSchemas/Entities: ${node.schemas.join(", ")}`);
    }

    if (node.publishes.length > 0) {
      lines.push(`\nPublishes Events: ${node.publishes.join(", ")}`);
    }

    if (node.subscribes.length > 0) {
      lines.push(`\nSubscribes Events: ${node.subscribes.join(", ")}`);
    }

    if (node.dependencies.length > 0) {
      lines.push(`\nDepends On: ${node.dependencies.join(", ")}`);
    }

    if (node.envVars.length > 0) {
      lines.push(`\nEnvironment Variables: ${node.envVars.join(", ")}`);
    }

    if (node.keyFiles.length > 0) {
      lines.push(`\nKey Files: ${node.keyFiles.join(", ")}`);
    }

    return lines.join("\n");
  }
}
