/**
 * Browser notifications — used sparingly.
 *
 * Four event types only:
 *   - 'model-ready'      → Backup engine finished downloading.
 *   - 'focus-auto-exit'  → Focus mode released after extended idle.
 *   - 'quota-exhausted'  → Free Gemma quota hit zero this month.
 *   - 'stale-proposal'   → Archive nudge when many tabs go stale.
 *
 * Constraints:
 *   - Per-event dedupe: don't fire the same event twice within a cooldown.
 *   - Global mute toggle: `notificationMutedUntil` (set when user dismisses).
 *   - Clicking a notification opens the side panel; closing dismisses.
 */

import { storage } from '#imports';

export type NotificationEvent =
  | 'model-ready'
  | 'focus-auto-exit'
  | 'quota-exhausted'
  | 'stale-proposal'
  | 'auto-grouped'
  | 'auto-grouped-batch'
  | 'auto-suggested';

const COOLDOWN_MS: Record<NotificationEvent, number> = {
  'model-ready': 30 * 24 * 60 * 60 * 1000, // 30d (one-shot in practice)
  'focus-auto-exit': 60 * 60 * 1000, // 1h
  'quota-exhausted': 7 * 24 * 60 * 60 * 1000, // 1 week
  'stale-proposal': 24 * 60 * 60 * 1000, // 1d
  'auto-grouped': 5 * 60 * 1000, // 5min — per-tab autonomy nudge
  'auto-grouped-batch': 30 * 1000, // 30s — manual Organize confirmation
  'auto-suggested': 5 * 60 * 1000, // 5min — assist-mode suggestion appeared
};

const DEFAULT_SEEN: Record<NotificationEvent, number> = {
  'model-ready': 0,
  'focus-auto-exit': 0,
  'quota-exhausted': 0,
  'stale-proposal': 0,
  'auto-grouped': 0,
  'auto-grouped-batch': 0,
  'auto-suggested': 0,
};

const seenItem = storage.defineItem<Record<NotificationEvent, number>>(
  'local:notificationSeen',
  { fallback: DEFAULT_SEEN },
);

const muteItem = storage.defineItem<number | null>('local:notificationMutedUntil', {
  fallback: null,
});

export const notificationsControl = {
  muteFor: async (ms: number): Promise<void> => {
    await muteItem.setValue(Date.now() + ms);
  },
  unmute: () => muteItem.setValue(null),
  mutedUntil: () => muteItem.getValue(),
};

export interface NotifyArgs {
  event: NotificationEvent;
  title: string;
  message: string;
}

const NOTIFICATION_ID_PREFIX = 'tab-organizer:';

export async function notify({ event, title, message }: NotifyArgs): Promise<boolean> {
  const muted = await muteItem.getValue();
  if (muted && muted > Date.now()) return false;

  const seenRaw = await seenItem.getValue();
  const seen = { ...DEFAULT_SEEN, ...seenRaw };
  const last = seen[event] ?? 0;
  if (Date.now() - last < COOLDOWN_MS[event]) return false;

  try {
    chrome.notifications.create(`${NOTIFICATION_ID_PREFIX}${event}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/48.png'),
      title,
      message,
      priority: 0,
    });
  } catch (err) {
    console.warn('[notifications] create failed', err);
    return false;
  }
  await seenItem.setValue({ ...seen, [event]: Date.now() });
  return true;
}

let installed = false;
export function installNotificationHandlers(): void {
  if (installed) return;
  installed = true;
  try {
    chrome.notifications.onClicked.addListener(async (id) => {
      if (!id.startsWith(NOTIFICATION_ID_PREFIX)) return;
      try {
        const win = await chrome.windows.getLastFocused();
        if (win.id != null) await chrome.sidePanel.open({ windowId: win.id });
      } catch {
        /* tolerate */
      }
      chrome.notifications.clear(id);
    });
    chrome.notifications.onClosed.addListener((id) => {
      if (!id.startsWith(NOTIFICATION_ID_PREFIX)) return;
      chrome.notifications.clear(id);
    });
  } catch (err) {
    console.warn('[notifications] handler install failed', err);
  }
}
