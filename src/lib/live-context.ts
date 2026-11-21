/** Live context appends allow 500 tokens. A 440 UTF-8-byte ceiling is a
 * conservative token upper bound, including Korean/emoji, without guessing
 * tokens from character count. Never split a Unicode code point. */
export function liveContextChunks(text: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "", bytes = 0;
  for (const character of text) {
    const length = encoder.encode(character).byteLength;
    if (bytes + length > 440) { chunks.push(current); current = ""; bytes = 0; }
    current += character; bytes += length;
  }
  if (current) chunks.push(current);
  return chunks;
}
