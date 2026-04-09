import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { IEmbeddingProvider } from '../../common/interfaces/embedding-provider.interface';

const BATCH_SIZE = 100;
const RETRY_ATTEMPTS = 3;
const BATCH_DELAY_MS = 200;

@Injectable()
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private readonly logger = new Logger(OpenAIEmbeddingProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly _dimensions: number;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: configService.get<string>('OPENAI_API_KEY'),
    });
    this.model = configService.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-3-small';
    this._dimensions = configService.get<number>('EMBEDDING_DIMENSIONS') ?? 1536;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      if (i > 0) {
        await this.delay(BATCH_DELAY_MS);
      }

      const batchEmbeddings = await this.callWithRetry(batch);
      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  private async callWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: texts,
        });

        return response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
      } catch (err) {
        lastError = err;
        const status = this.extractStatus(err);

        if (status === 429) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited by OpenAI, backing off ${backoffMs}ms (attempt ${attempt + 1}/${RETRY_ATTEMPTS})`);
          await this.delay(backoffMs);
          continue;
        }

        // Non-retryable error
        break;
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(`OpenAI embedding call failed: ${message}`);
    throw new InternalServerErrorException(`Embedding generation failed: ${message}`);
  }

  private extractStatus(err: unknown): number | undefined {
    if (err !== null && typeof err === 'object' && 'status' in err) {
      return (err as { status: number }).status;
    }
    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
