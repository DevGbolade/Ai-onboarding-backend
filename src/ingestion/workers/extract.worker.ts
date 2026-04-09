import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { Project } from 'ts-morph';
import { Repository } from 'typeorm';
import { DependencyInfo, ExtractedMetadata, RouteInfo } from '../../common/interfaces/extracted-metadata.interface';
import { RepositoryStatus } from '../../common/enums/repository-status.enum';
import { RepositoryEntity } from '../../database/entities/repository.entity';
import { ServiceNodeEntity } from '../../database/entities/service-node.entity';
import { DependencyExtractor } from '../extractors/dependency.extractor';
import { EnvExtractor } from '../extractors/env.extractor';
import { EventExtractor } from '../extractors/event.extractor';
import { NestjsExtractor } from '../extractors/nestjs.extractor';
import { TypeormExtractor } from '../extractors/typeorm.extractor';

interface ExtractJobData {
  repositoryId: string;
  serviceId: string;
  projectPath: string;
}

@Processor('extract')
export class ExtractWorker extends WorkerHost {
  private readonly logger = new Logger('ExtractWorker');

  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositoryRepo: Repository<RepositoryEntity>,
    @InjectRepository(ServiceNodeEntity)
    private readonly serviceNodeRepo: Repository<ServiceNodeEntity>,
    @InjectQueue('embed')
    private readonly embedQueue: Queue,
    private readonly configService: ConfigService,
    private readonly nestjsExtractor: NestjsExtractor,
    private readonly typeormExtractor: TypeormExtractor,
    private readonly eventExtractor: EventExtractor,
    private readonly envExtractor: EnvExtractor,
    private readonly dependencyExtractor: DependencyExtractor,
  ) {
    super();
  }

  async process(job: Job<ExtractJobData>): Promise<void> {
    const { repositoryId, serviceId, projectPath } = job.data;

    const repo = await this.repositoryRepo.findOneByOrFail({ id: repositoryId });

    this.logger.log(`Starting extraction for ${repo.name} (${repositoryId})`);

    await this.repositoryRepo.update(repositoryId, { status: RepositoryStatus.EXTRACTING });

    try {
      const [nestjsResult, typeormResult, eventResult, envResult, depResult] =
        await Promise.allSettled([
          this.nestjsExtractor.extract(projectPath),
          this.typeormExtractor.extract(projectPath),
          this.eventExtractor.extract(projectPath),
          this.envExtractor.extract(projectPath),
          this.dependencyExtractor.extract(projectPath),
        ]);

      const merged = this.mergeResults([
        nestjsResult,
        typeormResult,
        eventResult,
        envResult,
        depResult,
      ]);

      this.logger.log(
        `Extraction results for ${repo.name}: routes=${merged.routes.length}, ` +
        `schemas=${merged.schemas.length}, events=${merged.publishedEvents.length}+${merged.subscribedEvents.length}, ` +
        `envVars=${merged.envVars.length}, deps=${merged.dependencies.length}`,
      );

      merged.techStack = this.detectTechStack(projectPath);
      merged.description = this.extractReadmeDescription(projectPath);
      merged.keyFiles = this.findKeyFiles(projectPath);

      await this.serviceNodeRepo.delete({ repositoryId });
      await this.serviceNodeRepo.save(
        this.serviceNodeRepo.create({
          repositoryId,
          name: repo.name,
          description: merged.description,
          routes: merged.routes.map((r: RouteInfo) => `${r.method} /${r.path}`),
          schemas: merged.schemas,
          publishes: merged.publishedEvents,
          subscribes: merged.subscribedEvents,
          dependencies: merged.dependencies.map((d: DependencyInfo) => d.targetService),
          techStack: merged.techStack,
          keyFiles: merged.keyFiles,
          envVars: merged.envVars,
        }),
      );

      await this.embedQueue.add('embed', { repositoryId, serviceId, projectPath });

      this.logger.log(`Extraction complete for ${repo.name} (${repositoryId}), embed job queued`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Extraction failed for ${repo.name} (${repositoryId}): ${message}`);

      await this.repositoryRepo.update(repositoryId, {
        status: RepositoryStatus.FAILED,
        metadata: { error: message },
      });
    }
  }

  private mergeResults(
    results: PromiseSettledResult<Partial<ExtractedMetadata>>[],
  ): ExtractedMetadata {
    const merged: ExtractedMetadata = {
      routes: [],
      schemas: [],
      publishedEvents: [],
      subscribedEvents: [],
      dependencies: [],
      envVars: [],
      keyFiles: [],
      description: '',
      techStack: '',
    };

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(`Extractor failed: ${String(result.reason)}`);
        continue;
      }
      const partial = result.value;
      if (partial.routes) merged.routes.push(...partial.routes);
      if (partial.schemas) merged.schemas.push(...partial.schemas);
      if (partial.publishedEvents) merged.publishedEvents.push(...partial.publishedEvents);
      if (partial.subscribedEvents) merged.subscribedEvents.push(...partial.subscribedEvents);
      if (partial.dependencies) merged.dependencies.push(...partial.dependencies);
      if (partial.envVars) merged.envVars.push(...partial.envVars);
      if (partial.keyFiles) merged.keyFiles.push(...partial.keyFiles);
      if (partial.description) merged.description = partial.description;
      if (partial.techStack) merged.techStack = partial.techStack;
    }

    // Deduplicate string arrays
    merged.schemas = [...new Set(merged.schemas)];
    merged.publishedEvents = [...new Set(merged.publishedEvents)];
    merged.subscribedEvents = [...new Set(merged.subscribedEvents)];
    merged.envVars = [...new Set(merged.envVars)];

    return merged;
  }

  private detectTechStack(projectPath: string): string {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return '';

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      const stack: string[] = [];
      if (deps['@nestjs/core']) stack.push('NestJS');
      if (deps['express']) stack.push('Express');
      if (deps['fastify']) stack.push('Fastify');
      if (deps['typeorm']) stack.push('TypeORM');
      if (deps['prisma'] || deps['@prisma/client']) stack.push('Prisma');
      if (deps['mongoose']) stack.push('Mongoose');
      if (deps['bullmq'] || deps['bull']) stack.push('BullMQ');
      if (deps['redis'] || deps['ioredis']) stack.push('Redis');
      if (deps['graphql'] || deps['@nestjs/graphql']) stack.push('GraphQL');
      return stack.join(', ');
    } catch {
      return '';
    }
  }

  private extractReadmeDescription(projectPath: string): string {
    for (const name of ['README.md', 'readme.md', 'Readme.md']) {
      const readmePath = path.join(projectPath, name);
      if (!fs.existsSync(readmePath)) continue;

      try {
        const content = fs.readFileSync(readmePath, 'utf-8');
        // Skip heading lines, find the first non-empty paragraph
        const lines = content.split('\n');
        const paragraphLines: string[] = [];
        let inParagraph = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#')) continue;
          if (trimmed === '') {
            if (inParagraph) break;
            continue;
          }
          inParagraph = true;
          paragraphLines.push(trimmed);
        }

        return paragraphLines.join(' ').slice(0, 500);
      } catch {
        return '';
      }
    }
    return '';
  }

  private findKeyFiles(projectPath: string, limit = 10): string[] {
    const srcPath = path.join(projectPath, 'src');
    if (!fs.existsSync(srcPath)) return [];

    try {
      const project = new Project({ skipAddingFilesFromTsConfig: true });
      project.addSourceFilesAtPaths([path.join(srcPath, '**/*.ts')]);

      const refCounts = new Map<string, number>();

      for (const sf of project.getSourceFiles()) {
        const refs = sf.getReferencingSourceFiles();
        const filePath = path.relative(projectPath, sf.getFilePath());
        refCounts.set(filePath, (refCounts.get(filePath) ?? 0) + refs.length);
      }

      const sorted = Array.from(refCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([file]) => file);

      for (const sf of project.getSourceFiles()) {
        project.removeSourceFile(sf);
      }

      return sorted;
    } catch {
      return [];
    }
  }
}
