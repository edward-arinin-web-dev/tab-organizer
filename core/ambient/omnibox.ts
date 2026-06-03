/**
 * Omnibox — typing `tabs` + space in the address bar fires this handler.
 *
 * Supported verbs:
 *   tabs group           → groupNow
 *   tabs dedupe          → dedupe
 *   tabs stash           → stashAll
 *   tabs focus           → enter focus on the active tab
 *   tabs exit-focus      → exit focus
 *   tabs find <query>    → return matching workspaces + tabs as suggestions
 *
 * Find is title-substring only — no AI required, instant.
 */

import type { Command } from '~/core/messages';
import { workspaces } from '~/core/storage/workspaces';

export interface OmniboxDeps {
  handle: (cmd: Command) => Promise<unknown>;
}

interface ParsedInput {
  verb: 'group' | 'dedupe' | 'stash' | 'focus' | 'exit-focus' | 'find' | 'help' | 'unknown';
  query: string;
}

export function parseInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === 'help' || trimmed === '?') {
    return { verb: 'help', query: '' };
  }
  const [head, ...rest] = trimmed.split(/\s+/);
  const query = rest.join(' ');
  const v = (head ?? '').toLowerCase();
  switch (v) {
    case 'group':
    case 'organize':
      return { verb: 'group', query };
    case 'dedupe':
    case 'dupes':
      return { verb: 'dedupe', query };
    case 'stash':
      return { verb: 'stash', query };
    case 'focus':
      return { verb: 'focus', query };
    case 'exit-focus':
    case 'unfocus':
      return { verb: 'exit-focus', query };
    case 'find':
    case 'search':
      return { verb: 'find', query };
    default:
      // Bare "tabs <query>" — implicit find.
      return { verb: 'find', query: trimmed };
  }
}

interface OmniboxSuggestion {
  content: string;
  description: string;
}

function help(): OmniboxSuggestion[] {
  return [
    {
      content: 'group',
      description: '<dim>tabs group</dim> — cluster tabs in this window into spaces',
    },
    {
      content: 'dedupe',
      description: '<dim>tabs dedupe</dim> — close exact duplicate tabs',
    },
    {
      content: 'stash',
      description: '<dim>tabs stash</dim> — stash all tabs to the Vault',
    },
    {
      content: 'focus',
      description: '<dim>tabs focus</dim> — enter focus mode on the active tab',
    },
    {
      content: 'find ',
      description: '<dim>tabs find &lt;query&gt;</dim> — search live + saved tabs',
    },
  ];
}

async function findSuggestions(query: string): Promise<OmniboxSuggestion[]> {
  if (!query) return help();
  const q = query.toLowerCase();
  const out: OmniboxSuggestion[] = [];

  // Live tabs first.
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.title || !t.url) continue;
      if (
        t.title.toLowerCase().includes(q) ||
        t.url.toLowerCase().includes(q)
      ) {
        out.push({
          content: `__tab:${t.id ?? -1}`,
          description: `<dim>tab</dim> <match>${escapeXml(t.title)}</match> · <url>${escapeXml(stripScheme(t.url))}</url>`,
        });
      }
      if (out.length >= 5) break;
    }
  } catch {
    /* tolerate */
  }

  // Workspaces.
  try {
    const all = await workspaces.list();
    for (const w of all) {
      if (w.name.toLowerCase().includes(q)) {
        out.push({
          content: `__ws:${w.id}`,
          description: `<dim>space</dim> <match>${escapeXml(w.name)}</match>`,
        });
      }
      if (out.length >= 10) break;
    }
  } catch {
    /* tolerate */
  }

  if (out.length === 0) {
    out.push({ content: 'find ' + query, description: `No matches for "${escapeXml(query)}"` });
  }
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

let installed = false;

export function installOmnibox({ handle }: OmniboxDeps): void {
  if (installed) return;
  installed = true;
  if (typeof chrome.omnibox === 'undefined') return;

  chrome.omnibox.setDefaultSuggestion({
    description: 'Type a verb: group · dedupe · stash · focus · find &lt;query&gt;',
  });

  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    const parsed = parseInput(text);
    if (parsed.verb === 'help') {
      suggest(help());
      return;
    }
    if (parsed.verb === 'find') {
      void findSuggestions(parsed.query).then(suggest);
      return;
    }
    suggest([
      {
        content: parsed.verb,
        description: `<match>tabs ${parsed.verb}</match>`,
      },
    ]);
  });

  chrome.omnibox.onInputEntered.addListener(async (text) => {
    const parsed = parseInput(text);

    // Handle tab/workspace selection by ID.
    if (text.startsWith('__tab:')) {
      const id = Number(text.slice('__tab:'.length));
      if (Number.isFinite(id) && id > 0) {
        try {
          await chrome.tabs.update(id, { active: true });
          const tab = await chrome.tabs.get(id);
          if (tab.windowId != null) {
            await chrome.windows.update(tab.windowId, { focused: true });
          }
        } catch {
          /* gone */
        }
      }
      return;
    }
    if (text.startsWith('__ws:')) {
      const id = text.slice('__ws:'.length);
      await handle({ type: 'restoreWorkspace', workspaceId: id }).catch(() => {});
      return;
    }

    switch (parsed.verb) {
      case 'group':
        await handle({ type: 'groupNow' }).catch(() => {});
        return;
      case 'dedupe':
        await handle({ type: 'dedupe' }).catch(() => {});
        return;
      case 'stash':
        await handle({ type: 'stashAll', withRecap: false }).catch(() => {});
        return;
      case 'focus': {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active?.id != null) {
          await handle({ type: 'startFocus', anchorTabId: active.id }).catch(() => {});
        }
        return;
      }
      case 'exit-focus':
        await handle({ type: 'exitFocus' }).catch(() => {});
        return;
      default:
        return;
    }
  });
}
