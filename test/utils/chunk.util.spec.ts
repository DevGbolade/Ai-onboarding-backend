import { chunkText } from '../../src/common/utils/chunk.util';

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('returns single chunk for text under maxTokens', () => {
    const text = 'word1 word2 word3 word4 word5';
    const result = chunkText(text, 500, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('returns single chunk for text exactly at maxTokens', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const result = chunkText(words.join(' '), 500, 50);
    expect(result).toHaveLength(1);
  });

  it('returns multiple chunks for text longer than maxTokens', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const result = chunkText(words.join(' '), 500, 50);
    expect(result.length).toBeGreaterThan(1);
  });

  it('overlap words match between consecutive chunks', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = chunkText(text, 500, 50);

    // Last 50 words of chunk[0] should equal first 50 words of chunk[1]
    const chunk0Words = chunks[0].split(' ');
    const chunk1Words = chunks[1].split(' ');
    const tailOfFirst = chunk0Words.slice(-50);
    const headOfSecond = chunk1Words.slice(0, 50);
    expect(tailOfFirst).toEqual(headOfSecond);
  });

  it('no chunk exceeds maxTokens words', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(' '), 500, 50);
    for (const chunk of chunks) {
      expect(chunk.split(' ').length).toBeLessThanOrEqual(500);
    }
  });
});
