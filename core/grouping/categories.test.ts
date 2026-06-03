import { describe, expect, it } from 'vitest';
import { categorize, CATEGORIES } from './categories';

describe('categorize — protocol rules', () => {
  it('chrome:// → System Tabs', () => {
    expect(categorize('chrome://extensions')?.id).toBe('system');
    expect(categorize('chrome://settings/passwords')?.id).toBe('system');
  });

  it('chrome-extension:// → System Tabs', () => {
    expect(categorize('chrome-extension://abc/popup.html')?.id).toBe('system');
  });

  it('about: → System Tabs', () => {
    expect(categorize('about:blank')?.id).toBe('system');
    expect(categorize('about:preferences')?.id).toBe('system');
  });

  it('edge:// → System Tabs', () => {
    expect(categorize('edge://flags')?.id).toBe('system');
  });

  it('file:// → Local Files', () => {
    expect(categorize('file:///C:/Users/foo/doc.pdf')?.id).toBe('local-files');
  });

  it('protocol check is case-insensitive', () => {
    expect(categorize('CHROME://EXTENSIONS')?.id).toBe('system');
  });
});

describe('categorize — loopback / local hosts', () => {
  it('localhost → Local Dev', () => {
    expect(categorize('http://localhost:3000/')?.id).toBe('local-dev');
    expect(categorize('http://localhost/foo')?.id).toBe('local-dev');
  });

  it('127.0.0.1 → Local Dev', () => {
    expect(categorize('http://127.0.0.1:5173/')?.id).toBe('local-dev');
  });

  it('.local TLD → Local Dev', () => {
    expect(categorize('http://app.local/')?.id).toBe('local-dev');
  });

  it('.test TLD → Local Dev', () => {
    expect(categorize('http://foo.test/')?.id).toBe('local-dev');
  });
});

describe('categorize — host overrides (subdomain rules)', () => {
  it('maps.google.com → Travel (not Search)', () => {
    expect(categorize('https://maps.google.com/?q=berlin')?.id).toBe('travel');
  });

  it('mail.google.com → Email', () => {
    expect(categorize('https://mail.google.com/mail/u/0/')?.id).toBe('email');
  });

  it('drive.google.com → Cloud Files', () => {
    expect(categorize('https://drive.google.com/drive/my-drive')?.id).toBe('files');
  });

  it('docs.google.com → Productivity', () => {
    expect(categorize('https://docs.google.com/document/d/abc/edit')?.id).toBe('productivity');
  });

  it('music.youtube.com → Music', () => {
    expect(categorize('https://music.youtube.com/playlist')?.id).toBe('music');
  });

  it('host override wins over eTLD+1 domain rule', () => {
    // google.com base is Search, but news.google.com overrides to News.
    expect(categorize('https://news.google.com/topstories')?.id).toBe('news');
  });
});

describe('categorize — domain rules', () => {
  it('youtube.com → Video', () => {
    expect(categorize('https://www.youtube.com/watch?v=x')?.id).toBe('video');
  });

  it('gmail.com → Email', () => {
    expect(categorize('https://gmail.com')?.id).toBe('email');
  });

  it('github.com → Code', () => {
    expect(categorize('https://github.com/foo/bar/pull/3')?.id).toBe('code');
  });

  it('claude.ai → AI Tools', () => {
    expect(categorize('https://claude.ai/chats/abc')?.id).toBe('ai-tools');
  });

  it('news.ycombinator.com → News (via eTLD+1 = ycombinator.com)', () => {
    expect(categorize('https://news.ycombinator.com/')?.id).toBe('news');
  });

  it('bscscan.com → Finance', () => {
    expect(categorize('https://bscscan.com/token/0x123')?.id).toBe('finance');
  });

  it('steamcommunity.com → Gaming', () => {
    expect(categorize('https://steamcommunity.com/profiles/abc')?.id).toBe('gaming');
  });
});

describe('categorize — fallthrough', () => {
  it('unknown domain → null', () => {
    expect(categorize('https://obscure-blog-xyz-123.com/post')).toBeNull();
  });

  it('empty string → null', () => {
    expect(categorize('')).toBeNull();
  });

  it('unparseable URL → null', () => {
    expect(categorize('not a url')).toBeNull();
  });
});

describe('CATEGORIES integrity', () => {
  it('every CategoryId has a label, emoji, and Chrome-valid color', () => {
    const validColors = new Set([
      'grey',
      'blue',
      'red',
      'yellow',
      'green',
      'pink',
      'purple',
      'cyan',
      'orange',
    ]);
    for (const c of Object.values(CATEGORIES)) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(validColors.has(c.color)).toBe(true);
    }
  });
});
