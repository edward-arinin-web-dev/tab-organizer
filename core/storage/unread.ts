import { storage } from '#imports';

/** Map of canonical URL -> last-visited timestamp (epoch ms). */
export type UnreadIndex = Record<string, number>;

const item = storage.defineItem<UnreadIndex>('local:unread', { fallback: {} });

export const unreadIndex = {
  get: () => item.getValue(),
  set: (v: UnreadIndex) => item.setValue(v),
  /** Stamp a URL as visited "now". */
  touch: async (url: string) => {
    const cur = await item.getValue();
    cur[url] = Date.now();
    await item.setValue(cur);
  },
  /** Remove any entry older than `olderThanDays`, or for URLs not in the keepers list. */
  trim: async (keepUrls: ReadonlySet<string>) => {
    const cur = await item.getValue();
    const next: UnreadIndex = {};
    for (const url of keepUrls) if (cur[url] != null) next[url] = cur[url]!;
    await item.setValue(next);
  },
};
