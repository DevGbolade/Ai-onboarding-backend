import { plainToInstance, Transform } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from "class-validator";

// ─── Defaults ────────────────────────────────────────────────────────────────
// All optional env vars have their defaults here. Change these values and git
// will track the diff — no need to touch .env files for non-secret tunables.

export const DEFAULTS = {
  PORT: 3000,
  NODE_ENV: "development",
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: 1536,
  CLONE_BASE_PATH: "/tmp/repos",
  LLM_MODEL: "gpt-4o",
  SIMILARITY_THRESHOLD: 0.78,
} as const;

// ─── Validation ───────────────────────────────────────────────────────────────

enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

class EnvironmentVariables {
  // Required — must be supplied via .env / environment
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  OPENAI_API_KEY!: string;

  @IsString()
  GITHUB_WEBHOOK_SECRET!: string;

  // Optional — fall back to DEFAULTS when absent
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value !== undefined ? Number(value) : DEFAULTS.PORT,
  )
  PORT: number = DEFAULTS.PORT;

  @IsOptional()
  @IsEnum(Environment)
  @Transform(({ value }) => value ?? DEFAULTS.NODE_ENV)
  NODE_ENV: Environment = DEFAULTS.NODE_ENV as Environment;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? DEFAULTS.EMBEDDING_MODEL)
  EMBEDDING_MODEL: string = DEFAULTS.EMBEDDING_MODEL;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value !== undefined ? Number(value) : DEFAULTS.EMBEDDING_DIMENSIONS,
  )
  EMBEDDING_DIMENSIONS: number = DEFAULTS.EMBEDDING_DIMENSIONS;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? DEFAULTS.CLONE_BASE_PATH)
  CLONE_BASE_PATH: string = DEFAULTS.CLONE_BASE_PATH;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ?? DEFAULTS.LLM_MODEL)
  LLM_MODEL: string = DEFAULTS.LLM_MODEL;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value !== undefined ? Number(value) : DEFAULTS.SIMILARITY_THRESHOLD,
  )
  SIMILARITY_THRESHOLD: number = DEFAULTS.SIMILARITY_THRESHOLD;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false, // rely on @Transform for type coercion
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export default () => ({
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),

  database: {
    url: process.env.DATABASE_URL || "",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    embeddingDimensions: parseInt(
      process.env.EMBEDDING_DIMENSIONS || "1536",
      10,
    ),
    llmModel: process.env.LLM_MODEL || "gpt-4o",
  },

  ingestion: {
    cloneBasePath: process.env.CLONE_BASE_PATH || "/tmp/repos",
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || "0.78"),
  },

  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  },
});
