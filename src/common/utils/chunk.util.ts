export function chunkText(
  text: string,
  maxTokens: number = 500,
  overlapTokens: number = 50,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(' '));

    if (end === words.length) {
      break;
    }

    start = end - overlapTokens;
  }

  return chunks;
}
