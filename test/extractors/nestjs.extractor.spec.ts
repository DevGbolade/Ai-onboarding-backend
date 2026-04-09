import * as path from 'path';
import { NestjsExtractor } from '../../src/ingestion/extractors/nestjs.extractor';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-service');

describe('NestjsExtractor', () => {
  let extractor: NestjsExtractor;

  beforeEach(() => {
    extractor = new NestjsExtractor();
  });

  it('extracts 5 routes from the sample controllers (3 users + 2 orders)', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(result.routes).toHaveLength(5);
  });

  it('extracts GET /users findAll', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    const route = result.routes?.find((r) => r.handler === 'findAll');
    expect(route).toBeDefined();
    expect(route?.method).toBe('GET');
    expect(route?.path).toBe('users');
  });

  it('extracts GET users/:id findOne with param', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    const route = result.routes?.find((r) => r.handler === 'findOne');
    expect(route).toBeDefined();
    expect(route?.method).toBe('GET');
    expect(route?.path).toBe('users/:id');
    expect(route?.params).toContain('id');
  });

  it('extracts POST /users create with DTO', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    const route = result.routes?.find((r) => r.handler === 'create');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
    expect(route?.path).toBe('users');
    expect(route?.dto).toBe('CreateUserDto');
  });
});
