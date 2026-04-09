import * as path from 'path';
import { EnvExtractor } from '../../src/ingestion/extractors/env.extractor';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-service');

describe('EnvExtractor', () => {
  let extractor: EnvExtractor;

  beforeEach(() => {
    extractor = new EnvExtractor();
  });

  it('extracts variable keys from .env.example', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(result.envVars).toContain('DATABASE_URL');
    expect(result.envVars).toContain('REDIS_URL');
    expect(result.envVars).toContain('JWT_SECRET');
  });

  it('returns a deduplicated array', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    const unique = new Set(result.envVars);
    expect(unique.size).toBe(result.envVars!.length);
  });
});
