import * as path from 'path';
import { TypeormExtractor } from '../../src/ingestion/extractors/typeorm.extractor';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-service');

describe('TypeormExtractor', () => {
  let extractor: TypeormExtractor;

  beforeEach(() => {
    extractor = new TypeormExtractor();
  });

  it('extracts entity table names from .entity.ts files', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(result.schemas).toBeDefined();
    expect(result.schemas).toContain('users');
  });

  it('returns an array for schemas', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(Array.isArray(result.schemas)).toBe(true);
  });
});
