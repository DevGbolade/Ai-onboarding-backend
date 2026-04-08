import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  OPENAI_API_KEY!: string;

  @IsString()
  EMBEDDING_MODEL!: string;

  @IsNumber()
  EMBEDDING_DIMENSIONS!: number;

  @IsString()
  GITHUB_WEBHOOK_SECRET!: string;

  @IsString()
  CLONE_BASE_PATH!: string;

  @IsNumber()
  SIMILARITY_THRESHOLD!: number;

  @IsNumber()
  PORT!: number;

  @IsEnum(Environment)
  NODE_ENV!: Environment;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

export default () => ({
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10),
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  cloneBasePath: process.env.CLONE_BASE_PATH ?? '/tmp/repos',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD ?? '0.78'),
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
