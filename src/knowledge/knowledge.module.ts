import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { GraphService } from './graph.service';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [DatabaseModule, EmbeddingModule, ConfigModule],
  providers: [GraphService, KnowledgeService],
  exports: [GraphService, KnowledgeService],
})
export class KnowledgeModule {}
