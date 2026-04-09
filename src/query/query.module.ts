import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
