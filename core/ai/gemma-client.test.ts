import { describe, expect, it } from 'vitest';
import { extractJson } from './gemma-client';

describe('extractJson', () => {
  it('extracts a clean JSON object from prose-wrapped output', () => {
    const raw = 'Here is the answer:\n```json\n{"clusters": [{"a":1}]}\n```\nDone.';
    expect(extractJson(raw)).toBe('{"clusters": [{"a":1}]}');
  });

  it('returns raw if no braces found', () => {
    expect(extractJson('no json here')).toBe('no json here');
  });

  it('keeps nested braces intact', () => {
    expect(extractJson('prefix {"a": {"b": 1}} suffix')).toBe('{"a": {"b": 1}}');
  });
});
