/**
 * Ambient surfaces — toolbar icon, badge, tooltip, context menu.
 *
 * Call `installAmbient(handle)` once at SW boot. The `handle` argument is the
 * same async command router the message listener uses; the context menu
 * funnels its clicks through it so business logic stays single-sourced.
 */

import type { Command } from '~/core/messages';
import { installBadge, reconcile, working, thinking, success, ambientError } from './badge';
import { installContextMenu } from './contextMenu';
import { installNotificationHandlers, notify, notificationsControl } from './notifications';
import { installOmnibox } from './omnibox';

export function installAmbient(handle: (cmd: Command) => Promise<unknown>): void {
  installBadge();
  installContextMenu(handle);
  installNotificationHandlers();
  installOmnibox({ handle });
}

export {
  reconcile as reconcileBadge,
  working,
  thinking,
  success,
  ambientError,
  notify,
  notificationsControl,
};
export * from './intent';
