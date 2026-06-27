import { describe, expect, it } from 'vitest';
import {
  buildUserRulesBlock,
  floorCompile,
  parseCompileResponse,
  type Clause,
} from './instruction-schema';

describe('floorCompile', () => {
  it('assigns brand tabs to a named group', () => {
    const [c] = floorCompile('Put all YouTube and Twitch tabs in Entertainment');
    expect(c?.kind).toBe('assign');
    if (c?.kind === 'assign') {
      expect(c.target).toBe('Entertainment');
      expect(c.match.hosts).toEqual(expect.arrayContaining(['youtube.com', 'twitch.tv']));
    }
  });

  it('merges (keep together) without a target', () => {
    const [c] = floorCompile('Keep github and gitlab together');
    expect(c?.kind).toBe('merge');
    if (c?.kind === 'merge') {
      expect(c.match.hosts).toEqual(expect.arrayContaining(['github.com', 'gitlab.com']));
    }
  });

  it('maps "never ... localhost" to a never clause via urlContains', () => {
    const [c] = floorCompile('Never group localhost tabs');
    expect(c?.kind).toBe('never');
    if (c?.kind === 'never') {
      expect(c.match.urlContains).toContain('localhost');
    }
  });

  it('extracts a bare domain', () => {
    const [c] = floorCompile('send news.ycombinator.com to Reading');
    expect(c?.kind).toBe('assign');
    if (c?.kind === 'assign') {
      expect(c.target).toBe('Reading');
      expect(c.match.hosts).toContain('ycombinator.com');
    }
  });

  it('falls back to steer when no host/keyword is recoverable', () => {
    const [c] = floorCompile('Email goes in Work');
    expect(c?.kind).toBe('steer');
  });

  it('returns [] for empty input', () => {
    expect(floorCompile('   ')).toEqual([]);
  });
});

describe('parseCompileResponse', () => {
  it('keeps a well-formed assign clause', () => {
    const out = parseCompileResponse(
      JSON.stringify({
        clauses: [{ kind: 'assign', target: 'Work', match: { hosts: ['gmail.com'] } }],
      }),
    );
    expect(out).toEqual([{ kind: 'assign', target: 'Work', match: { hosts: ['gmail.com'] } }]);
  });

  it('drops a clause whose matcher is empty', () => {
    const out = parseCompileResponse(
      JSON.stringify({ clauses: [{ kind: 'assign', target: 'Work', match: {} }] }),
    );
    expect(out).toEqual([]);
  });

  it('drops assign/rename with no target', () => {
    const out = parseCompileResponse(
      JSON.stringify({ clauses: [{ kind: 'assign', match: { hosts: ['x.com'] } }] }),
    );
    expect(out).toEqual([]);
  });

  it('keeps steer clauses with text', () => {
    const out = parseCompileResponse(JSON.stringify({ clauses: [{ kind: 'steer', text: 'tidy' }] }));
    expect(out).toEqual([{ kind: 'steer', text: 'tidy' }]);
  });

  it('normalizes hosts (strips scheme / www / path)', () => {
    const out = parseCompileResponse(
      JSON.stringify({
        clauses: [{ kind: 'never', match: { hosts: ['https://www.YouTube.com/watch'] } }],
      }),
    );
    expect(out).toEqual([{ kind: 'never', match: { hosts: ['youtube.com'] } }] satisfies Clause[]);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseCompileResponse('not json')).toEqual([]);
  });
});

describe('buildUserRulesBlock', () => {
  it('is empty for no rules', () => {
    expect(buildUserRulesBlock([])).toBe('');
  });

  it('lists rules under a high-priority header', () => {
    const block = buildUserRulesBlock(['Put YouTube in Fun', '  ', 'Never group localhost']);
    expect(block).toContain('HIGHEST PRIORITY');
    expect(block).toContain('- Put YouTube in Fun');
    expect(block).toContain('- Never group localhost');
    // Blank entry dropped.
    expect(block.split('\n').filter((l) => l.startsWith('- ')).length).toBe(2);
  });
});
