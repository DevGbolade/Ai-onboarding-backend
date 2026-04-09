import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ChunkType } from '../../common/enums/chunk-type.enum';
import { RepositoryStatus } from '../../common/enums/repository-status.enum';
import { chunkText } from '../../common/utils/chunk.util';
import { ChunkEntity } from '../../database/entities/chunk.entity';
import { RepositoryEntity } from '../../database/entities/repository.entity';
import { ServiceNodeEntity } from '../../database/entities/service-node.entity';
import { OpenAIEmbeddingProvider } from '../providers/openai-embedding.provider';

interface EmbedJobData {
  repositoryId: string;
  serviceId: string;
  projectPath: string;
}

interface ChunkInsert {
  id: string;
  repositoryId: string;
  serviceId: string;
  chunkType: ChunkType;
  filePath: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown> | null;
}

@Processor('embed')
export class EmbedWorker extends WorkerHost {
  private readonly logger = new Logger('EmbedWorker');

  constructor(
    @InjectRepository(ChunkEntity)
    private readonly chunkRepo: Repository<ChunkEntity>,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    private readonly dataSource: DataSource,
    private readonly embeddingProvider: OpenAIEmbeddingProvider,
    private readonly configService: ConfigService,
    @InjectQueue('graph')
    private readonly graphQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EmbedJobData>): Promise<void> {
    const { repositoryId, serviceId, projectPath } = job.data;

    const repo = await this.repositoryRepo.findOneByOrFail({ id: repositoryId });
    this.logger.log(`Starting embedding for ${repo.name} (${repositoryId})`);

    await this.repositoryRepo.update(repositoryId, { status: RepositoryStatus.EMBEDDING });

    try {
      await this.chunkRepo.delete({ repositoryId });

      const serviceNode = await this.serviceNodeRepo.findOne({ where: { repositoryId } });
      const keyFiles: string[] = serviceNode?.keyFiles ?? [];

      const allChunks: ChunkInsert[] = [];

      // Process key files
      for (const relFilePath of keyFiles) {
        const absPath = path.join(projectPath, relFilePath);
        if (!fs.existsSync(absPath)) continue;

        let content: string;
        try {
          content = fs.readFileSync(absPath, 'utf-8');
        } catch {
          this.logger.warn(`Could not read file: ${absPath}`);
          continue;
        }

        const chunkType = this.detectChunkType(relFilePath, content);
        const textChunks = chunkText(content);

        if (textChunks.length === 0) continue;

        const embeddings = await this.embeddingProvider.generateEmbeddings(textChunks);

        for (let i = 0; i < textChunks.length; i++) {
          allChunks.push({
            id: uuidv4(),
            repositoryId,
            serviceId,
            chunkType,
            filePath: relFilePath,
            content: textChunks[i],
            embedding: embeddings[i],
            metadata: { chunkIndex: i, totalChunks: textChunks.length },
          });
        }
      }

      // Process README as FILE_SUMMARY
      for (const name of ['README.md', 'readme.md', 'Readme.md']) {
        const readmePath = path.join(projectPath, name);
        if (!fs.existsSync(readmePath)) continue;

        try {
          const content = fs.readFileSync(readmePath, 'utf-8');
          const textChunks = chunkText(content);
          if (textChunks.length === 0) break;

          const embeddings = await this.embeddingProvider.generateEmbeddings(textChunks);

          for (let i = 0; i < textChunks.length; i++) {
            allChunks.push({
              id: uuidv4(),
              repositoryId,
              serviceId,
              chunkType: ChunkType.FILE_SUMMARY,
              filePath: name,
              content: textChunks[i],
              embedding: embeddings[i],
              metadata: { chunkIndex: i, totalChunks: textChunks.length, source: 'README' },
            });
          }
        } catch {
          this.logger.warn(`Could not read README at ${readmePath}`);
        }
        break;
      }

      // Insert all chunks using raw SQL (pgvector column not in TypeORM entity)
      for (const chunk of allChunks) {
        await this.dataSource.query(
          `INSERT INTO chunks (id, "repositoryId", "serviceId", "chunkType", "filePath", content, embedding, metadata, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb, NOW())`,
          [
            chunk.id,
            chunk.repositoryId,
            chunk.serviceId,
            chunk.chunkType,
            chunk.filePath,
            chunk.content,
            JSON.stringify(chunk.embedding),
            JSON.stringify(chunk.metadata),
          ],
        );
      }

      this.logger.log(`Embedded ${allChunks.length} chunks for ${repo.name} (${repositoryId})`);

      await this.repositoryRepo.update(repositoryId, { status: RepositoryStatus.READY });

      await this.graphQueue.add('graph', { repositoryId, serviceId });

      this.logger.log(`Embedding complete for ${repo.name} (${repositoryId}), graph job queued`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Embedding failed for ${repo.name} (${repositoryId}): ${message}`);

      await this.repositoryRepo.update(repositoryId, {
        status: RepositoryStatus.FAILED,
        metadata: { error: message },
      });
    }
  }

  private detectChunkType(filePath: string, content: string): ChunkType {
    const lower = filePath.toLowerCase();

    if (lower.includes('.controller.')) return ChunkType.ROUTE_HANDLER;
    if (lower.includes('.entity.')) return ChunkType.SCHEMA_MODEL;
    if (lower.includes('.event.') || content.includes('@OnEvent(') || content.includes('@Process(')) {
      return ChunkType.EVENT_HANDLER;
    }
    if (lower.includes('.service.')) return ChunkType.SERVICE_METHOD;
    if (
      lower.includes('.config.') ||
      lower.includes('.module.') ||
      lower.includes('configuration')
    ) {
      return ChunkType.CONFIGURATION;
    }
    if (lower.endsWith('.md')) return ChunkType.FILE_SUMMARY;

    return ChunkType.FILE_SUMMARY;
  }
}
