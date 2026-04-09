import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check service health (DB + Redis)' })
  async check() {
    let dbOk = false;
    let redisOk = false;
    const errors: string[] = [];

    // DB check
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch (err) {
      this.logger.error('DB health check failed', err);
      errors.push('Database unreachable');
    }

    // Redis check
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const redis = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false });
    try {
      await redis.ping();
      redisOk = true;
    } catch (err) {
      this.logger.error('Redis health check failed', err);
      errors.push('Redis unreachable');
    } finally {
      redis.disconnect();
    }

    const result = {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      db: dbOk,
      redis: redisOk,
      timestamp: new Date().toISOString(),
      ...(errors.length > 0 ? { errors } : {}),
    };

    if (!dbOk || !redisOk) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
