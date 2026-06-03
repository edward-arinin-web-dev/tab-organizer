import { describe, it, expect } from 'vitest';
import { parseInput } from './omnibox';

describe('parseInput', () => {
  it('returns help on empty input', () => {
    expect(parseInput('').verb).toBe('help');
    expect(parseInput('  ').verb).toBe('help');
    expect(parseInput('?').verb).toBe('help');
  });

  it('parses simple verbs', () => {
    expect(parseInput('group').verb).toBe('group');
    expect(parseInput('organize').verb).toBe('group');
    expect(parseInput('dedupe').verb).toBe('dedupe');
    expect(parseInput('dupes').verb).toBe('dedupe');
    expect(parseInput('stash').verb).toBe('stash');
    expect(parseInput('focus').verb).toBe('focus');
    expect(parseInput('unfocus').verb).toBe('exit-focus');
  });

  it('parses find with a query', () => {
    const r = parseInput('find some article');
    expect(r.verb).toBe('find');
    expect(r.query).toBe('some article');
  });

  it('treats bare unknown input as implicit find', () => {
    const r = parseInput('foo bar baz');
    expect(r.verb).toBe('find');
    expect(r.query).toBe('foo bar baz');
  });

  it('is case-insensitive on verbs', () => {
    expect(parseInput('GROUP').verb).toBe('group');
    expect(parseInput('Dedupe ').verb).toBe('dedupe');
  });
});
