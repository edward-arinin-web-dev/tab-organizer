import { storage } from '#imports';

/** Active focus mode session. Only one at a time. */
export interface ActiveFocus {
  startedAt: number;
  /** Stash session id holding the off-topic tabs that were swept aside. */
  deferredSessionId: string;
  anchorTitle: string;
  windowId: number;
}

const focusItem = storage.defineItem<ActiveFocus | null>('local:activeFocus', {
  fallback: null,
});

export const focus = {
  get: () => focusItem.getValue(),
  set: (v: ActiveFocus | null) => focusItem.setValue(v),
  clear: () => focusItem.setValue(null),
  watch: (cb: (next: ActiveFocus | null) => void) => focusItem.watch(cb),
};
