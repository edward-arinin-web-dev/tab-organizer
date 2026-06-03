import { storage } from '#imports';

/**
 * A pending classifier proposal that has NOT yet been auto-applied.
 *
 * Lives in `local:suggestionQueue` so the toolbar badge can surface "N
 * suggestions ready" without the popup being open. Two producers:
 *   - The classifier when running in `assist` automation level.
 *   - The project detector (Phase G) when it spots a multi-tab project.
 *
 * Suggestions are claimed by the popup UI (accept/dismiss) or auto-expire
 * after `EXPIRES_MS` to keep the queue from growing unbounded.
 */

export const SUGGESTION_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24h

export interface SuggestionTab {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

interface GroupSuggestion {
  kind: 'group';
  id: string;
  createdAt: number;
  pattern: string;
  proposedWorkspaceName: string;
  proposedColor: chrome.tabGroups.Color;
  tabs: SuggestionTab[];
  confidence: number;
}
interface ProjectSuggestion {
  kind: 'project';
  id: string;
  createdAt: number;
  /** Identifier for the detected project, e.g. "github.com/org/repo". */
  projectKey: string;
  proposedWorkspaceName: string;
  tabs: SuggestionTab[];
}
interface StaleArchiveSuggestion {
  kind: 'stale-archive';
  id: string;
  createdAt: number;
  tabs: SuggestionTab[];
  staleDays: number;
}

export type Suggestion = GroupSuggestion | ProjectSuggestion | StaleArchiveSuggestion;

export type SuggestionInput =
  | Omit<GroupSuggestion, 'id' | 'createdAt'>
  | Omit<ProjectSuggestion, 'id' | 'createdAt'>
  | Omit<StaleArchiveSuggestion, 'id' | 'createdAt'>;

const item = storage.defineItem<Suggestion[]>('local:suggestionQueue', {
  fallback: [],
});

function isExpired(s: Suggestion, now = Date.now()): boolean {
  return now - s.createdAt > SUGGESTION_EXPIRES_MS;
}

function newId(): string {
  return `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const suggestionQueue = {
  list: async (): Promise<Suggestion[]> => {
    const all = await item.getValue();
    const now = Date.now();
    const fresh = all.filter((s) => !isExpired(s, now));
    if (fresh.length !== all.length) await item.setValue(fresh);
    return fresh;
  },

  count: async (): Promise<number> => {
    return (await suggestionQueue.list()).length;
  },

  add: async (input: SuggestionInput): Promise<Suggestion> => {
    const s: Suggestion = { ...input, id: newId(), createdAt: Date.now() } as Suggestion;
    const cur = await suggestionQueue.list();
    // Dedupe by pattern/projectKey to avoid badge spam.
    const dedupKey = s.kind === 'group' ? `group:${s.pattern}` : s.kind === 'project' ? `project:${s.projectKey}` : `stale:${s.tabs.length}`;
    const filtered = cur.filter((x) => {
      const k = x.kind === 'group' ? `group:${x.pattern}` : x.kind === 'project' ? `project:${x.projectKey}` : `stale:${x.tabs.length}`;
      return k !== dedupKey;
    });
    await item.setValue([...filtered, s]);
    return s;
  },

  remove: async (id: string): Promise<void> => {
    const cur = await suggestionQueue.list();
    await item.setValue(cur.filter((s) => s.id !== id));
  },

  clear: async (): Promise<void> => {
    await item.setValue([]);
  },

  watch: (cb: (next: Suggestion[]) => void) => item.watch(cb),
};
