import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ReposController } from './repos.controller';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'clone' }),
    ConfigModule,
    DatabaseModule,
  ],
  controllers: [WebhookController, ReposController],
  providers: [WebhookService],
})
export class WebhookModule {}
