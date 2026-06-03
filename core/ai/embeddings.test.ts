import { describe, expect, it } from 'vitest';
import { centroid, cosineSimilarity } from './embeddings';

describe('cosineSimilarity', () => {
  it('returns 1 for identical normalised vectors', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('returns 0 when lengths mismatch', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBe(0);
  });
});

describe('centroid', () => {
  it('returns null on empty input', () => {
    expect(centroid([])).toBeNull();
  });

  it('produces a normalised average', () => {
    const c = centroid([new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0])])!;
    // Mean is (0.5, 0.5, 0); normalised → (1/√2, 1/√2, 0).
    expect(c[0]).toBeCloseTo(1 / Math.SQRT2);
    expect(c[1]).toBeCloseTo(1 / Math.SQRT2);
    expect(c[2]).toBeCloseTo(0);
  });
});
