import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './common/health.module';
import { DatabaseModule } from './database/database.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { QueryModule } from './query/query.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
    }),
    HealthModule,
    WebhookModule,
    IngestionModule,
    KnowledgeModule,
    QueryModule,
  ],
})
export class AppModule {}
