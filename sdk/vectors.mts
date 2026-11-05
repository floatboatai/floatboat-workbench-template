// ABOUTME: 工作台本地向量检索工具：余弦相似度、TopK 与 SQLite BLOB 互转，向量数据始终留在 App 自己的数据库。

/** 两个等长向量的余弦相似度；任一为零向量时返回 0。 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new RangeError('VECTOR_DIMENSION_MISMATCH');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!;
    const y = b[index]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

/** 对候选逐一计算相似度，返回得分最高的 k 项（降序）。适合万级以内的本地全量比对。 */
export function topK<T>(
  query: ArrayLike<number>,
  rows: Iterable<{ vector: ArrayLike<number>; item: T }>,
  k: number,
): Array<{ item: T; score: number }> {
  if (!Number.isInteger(k) || k < 1) throw new RangeError('VECTOR_TOP_K_INVALID');
  const best: Array<{ item: T; score: number }> = [];
  for (const row of rows) {
    const score = cosineSimilarity(query, row.vector);
    if (best.length === k && score <= best[k - 1]!.score) continue;
    let index = best.findIndex((entry) => score > entry.score);
    if (index < 0) index = best.length;
    best.splice(index, 0, { item: row.item, score });
    if (best.length > k) best.pop();
  }
  return best;
}

/** 以 Float32 小端序编码，便于存入 SQLite BLOB 列。 */
export function vectorToBlob(vector: ArrayLike<number>): Uint8Array {
  const view = new DataView(new ArrayBuffer(vector.length * 4));
  for (let index = 0; index < vector.length; index++) view.setFloat32(index * 4, vector[index]!, true);
  return new Uint8Array(view.buffer);
}

export function vectorFromBlob(blob: Uint8Array): Float32Array {
  if (blob.byteLength % 4 !== 0) throw new RangeError('VECTOR_BLOB_INVALID');
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const vector = new Float32Array(blob.byteLength / 4);
  for (let index = 0; index < vector.length; index++) vector[index] = view.getFloat32(index * 4, true);
  return vector;
}
