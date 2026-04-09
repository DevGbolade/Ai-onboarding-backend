import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { DependencyExtractor } from './extractors/dependency.extractor';
import { EnvExtractor } from './extractors/env.extractor';
import { EventExtractor } from './extractors/event.extractor';
import { NestjsExtractor } from './extractors/nestjs.extractor';
import { TypeormExtractor } from './extractors/typeorm.extractor';
import { CloneWorker } from './workers/clone.worker';
import { EmbedWorker } from './workers/embed.worker';
import { ExtractWorker } from './workers/extract.worker';
import { GraphWorker } from './workers/graph.worker';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'clone' },
      { name: 'extract' },
      { name: 'embed' },
      { name: 'graph' },
    ),
    DatabaseModule,
    EmbeddingModule,
  ],
  providers: [
    CloneWorker,
    ExtractWorker,
    EmbedWorker,
    GraphWorker,
    NestjsExtractor,
    TypeormExtractor,
    EventExtractor,
    EnvExtractor,
    DependencyExtractor,
  ],
})
export class IngestionModule {}
