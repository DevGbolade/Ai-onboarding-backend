import * as path from 'path';
import { EventExtractor } from '../../src/ingestion/extractors/event.extractor';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample-service');

describe('EventExtractor', () => {
  let extractor: EventExtractor;

  beforeEach(() => {
    extractor = new EventExtractor();
  });

  it('extracts published events from eventEmitter.emit calls', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(result.publishedEvents).toContain('user.created');
    expect(result.publishedEvents).toContain('user.welcome.sent');
  });

  it('extracts subscribed events from @OnEvent decorators', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(result.subscribedEvents).toContain('order.placed');
    expect(result.subscribedEvents).toContain('payment.confirmed');
  });

  it('returns arrays for both published and subscribed events', async () => {
    const result = await extractor.extract(FIXTURE_PATH);
    expect(Array.isArray(result.publishedEvents)).toBe(true);
    expect(Array.isArray(result.subscribedEvents)).toBe(true);
  });
});
