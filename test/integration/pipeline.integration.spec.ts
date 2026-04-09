import * as path from 'path';
import { chunkText } from '../../src/common/utils/chunk.util';
import { DependencyExtractor } from '../../src/ingestion/extractors/dependency.extractor';
import { EnvExtractor } from '../../src/ingestion/extractors/env.extractor';
import { EventExtractor } from '../../src/ingestion/extractors/event.extractor';
import { NestjsExtractor } from '../../src/ingestion/extractors/nestjs.extractor';
import { TypeormExtractor } from '../../src/ingestion/extractors/typeorm.extractor';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-service');

describe('Pipeline Integration', () => {
  describe('NestjsExtractor', () => {
    let extractor: NestjsExtractor;

    beforeEach(() => {
      extractor = new NestjsExtractor();
    });

    it('extracts 5 routes (3 from users, 2 from orders)', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      expect(result.routes).toHaveLength(5);
    });

    it('includes routes from both controllers', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      const methods = result.routes?.map((r) => r.handler) ?? [];
      expect(methods).toContain('findAll');
      expect(methods).toContain('findOne');
      expect(methods).toContain('create');
    });
  });

  describe('TypeormExtractor', () => {
    let extractor: TypeormExtractor;

    beforeEach(() => {
      extractor = new TypeormExtractor();
    });

    it('extracts 2 entity table names: users, orders', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      expect(result.schemas).toContain('users');
      expect(result.schemas).toContain('orders');
      expect(result.schemas).toHaveLength(2);
    });
  });

  describe('EventExtractor', () => {
    let extractor: EventExtractor;

    beforeEach(() => {
      extractor = new EventExtractor();
    });

    it('detects at least 1 published event', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      expect(result.publishedEvents?.length).toBeGreaterThanOrEqual(1);
      expect(result.publishedEvents).toContain('user.created');
    });
  });

  describe('DependencyExtractor', () => {
    let extractor: DependencyExtractor;

    beforeEach(() => {
      extractor = new DependencyExtractor();
    });

    it('detects 1 HTTP dependency from orders.service', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      const httpDeps = result.dependencies?.filter((d) => d.type === 'http') ?? [];
      expect(httpDeps).toHaveLength(1);
      expect(httpDeps[0].detail).toContain('user-service');
    });
  });

  describe('EnvExtractor', () => {
    let extractor: EnvExtractor;

    beforeEach(() => {
      extractor = new EnvExtractor();
    });

    it('extracts 3 env vars from .env.example', async () => {
      const result = await extractor.extract(FIXTURE_PATH);
      expect(result.envVars).toContain('DATABASE_URL');
      expect(result.envVars).toContain('REDIS_URL');
      expect(result.envVars).toContain('JWT_SECRET');
      expect(result.envVars?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('chunkText with large input', () => {
    it('a 1000-word text produces multiple chunks', () => {
      const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, 500, 50);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('consecutive chunks share the overlap words', () => {
      const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, 500, 50);
      const tailOfFirst = chunks[0].split(' ').slice(-50);
      const headOfSecond = chunks[1].split(' ').slice(0, 50);
      expect(tailOfFirst).toEqual(headOfSecond);
    });

    it('mock embedding provider returns 1536-dimension vectors', () => {
      const mockEmbeddingProvider = {
        generateEmbedding: async (_text: string): Promise<number[]> =>
          Array.from({ length: 1536 }, () => Math.random()),
        generateEmbeddings: async (texts: string[]): Promise<number[][]> =>
          texts.map(() => Array.from({ length: 1536 }, () => Math.random())),
        dimensions: 1536,
      };

      const texts = ['chunk one', 'chunk two', 'chunk three'];
      return mockEmbeddingProvider.generateEmbeddings(texts).then((embeddings) => {
        expect(embeddings).toHaveLength(3);
        for (const embedding of embeddings) {
          expect(embedding).toHaveLength(1536);
        }
      });
    });
  });
});
