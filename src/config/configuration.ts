import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY!: string;

  @IsString()
  @IsOptional()
  EMBEDDING_MODEL: string = 'text-embedding-3-small';

  @IsInt()
  @IsOptional()
  EMBEDDING_DIMENSIONS: number = 1536;

  @IsString()
  @IsOptional()
  GITHUB_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  CLONE_BASE_PATH: string = '/tmp/repos';

  @IsNumber()
  @IsOptional()
  SIMILARITY_THRESHOLD: number = 0.78;

  @IsInt()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  NODE_ENV: string = 'development';
}

export interface AppConfig {
  databaseUrl: string;
  redisUrl: string;
  openaiApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  githubWebhookSecret?: string;
  cloneBasePath: string;
  similarityThreshold: number;
  port: number;
  nodeEnv: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

export default (): AppConfig => ({
  databaseUrl: process.env['DATABASE_URL'] as string,
  redisUrl: process.env['REDIS_URL'] as string,
  openaiApiKey: process.env['OPENAI_API_KEY'] as string,
  embeddingModel: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env['EMBEDDING_DIMENSIONS'] ?? '1536', 10),
  githubWebhookSecret: process.env['GITHUB_WEBHOOK_SECRET'],
  cloneBasePath: process.env['CLONE_BASE_PATH'] ?? '/tmp/repos',
  similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] ?? '0.78'),
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
});
