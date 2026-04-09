import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAIEmbeddingProvider } from '../ingestion/providers/openai-embedding.provider';

@Module({
  imports: [ConfigModule],
  providers: [OpenAIEmbeddingProvider],
  exports: [OpenAIEmbeddingProvider],
})
export class EmbeddingModule {}
