/**
 * Right-click on the toolbar icon → quick actions.
 *
 * Context-menu items must be (re-)created on `runtime.onInstalled` to survive
 * SW respawn. Calling `chrome.contextMenus.create` twice with the same id
 * throws; the safe pattern is `removeAll` → recreate.
 *
 * Click handlers send themselves through the existing command pipeline so we
 * don't duplicate business logic.
 */

import type { Command } from '~/core/messages';

interface MenuItem {
  id: string;
  title: string;
  command?: Command;
  /** Optional dynamic enable check evaluated at install time. */
  enabledWhen?: () => Promise<boolean>;
}

const STATIC_ITEMS: MenuItem[] = [
  { id: 'organize', title: 'Organize this window', command: { type: 'groupNow' } },
  { id: 'dedupe', title: 'Close exact duplicates', command: { type: 'dedupe' } },
  { id: 'smartDedupe', title: 'Smart dedupe (AI)', command: { type: 'smartDedupe' } },
  { id: 'stash', title: 'Stash all tabs', command: { type: 'stashAll', withRecap: false } },
  { id: 'sep1', title: '---' },
  { id: 'focus', title: 'Toggle focus mode' },
  { id: 'palette', title: 'Open command palette (⌘K)' },
  { id: 'sep2', title: '---' },
  { id: 'settings', title: 'Settings…' },
];

let installed = false;

export function installContextMenu(handle: (cmd: Command) => Promise<unknown>): void {
  if (installed) return;
  installed = true;

  const register = () => {
    try {
      chrome.contextMenus.removeAll(() => {
        for (const item of STATIC_ITEMS) {
          if (item.title === '---') {
            chrome.contextMenus.create({
              id: item.id,
              type: 'separator',
              contexts: ['action'],
            });
          } else {
            chrome.contextMenus.create({
              id: item.id,
              title: item.title,
              contexts: ['action'],
            });
          }
        }
      });
    } catch (err) {
      console.warn('[ambient] context menu install failed', err);
    }
  };

  chrome.runtime.onInstalled.addListener(register);
  chrome.runtime.onStartup.addListener(register);
  // Also register immediately in case the SW respawned without onStartup.
  register();

  chrome.contextMenus.onClicked.addListener(async (info) => {
    const item = STATIC_ITEMS.find((i) => i.id === info.menuItemId);
    if (!item) return;
    try {
      if (item.command) {
        await handle(item.command);
        return;
      }
      // Special-case handlers (no direct Command equivalent).
      switch (item.id) {
        case 'focus': {
          const state = await handle({ type: 'getFocusState' });
          if ((state as { active: boolean }).active) {
            await handle({ type: 'exitFocus' });
          } else {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (active?.id != null) {
              await handle({ type: 'startFocus', anchorTabId: active.id });
            }
          }
          break;
        }
        case 'palette': {
          // Open popup; the popup detects an "open palette" flag via session storage.
          try {
            await chrome.storage.session.set({ openPalette: true });
          } catch {
            await chrome.storage.local.set({ openPalette: true });
          }
          await chrome.action.openPopup().catch(() => {
            /* not all browsers allow programmatic popup */
          });
          break;
        }
        case 'settings': {
          chrome.runtime.openOptionsPage();
          break;
        }
      }
    } catch (err) {
      console.warn('[ambient] menu click failed', err);
    }
  });
}
