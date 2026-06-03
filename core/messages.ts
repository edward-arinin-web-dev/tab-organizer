/**
 * Typed message protocol between popup/options/sidepanel and background.
 *
 * Note: messages targeting the offscreen document use a separate protocol
 * (core/ai/protocol.ts) carrying `target: 'offscreen'`.
 */

import type { AiAvailabilityState } from './ai/protocol';
import type { Settings } from './storage/settings';
import type { Entitlements, LicenseState } from './license/types';
import type { Workspace } from './storage/workspaces';
import type { ProposedWorkspace } from './bookmarks/import';
import type { AutomationSettings } from './storage/automation';
import type { ActivityEntry } from './storage/activity';
import type { LearnedRule } from './automation/rules';
import type { Suggestion } from './storage/suggestions';

export type Command =
  | { type: 'groupNow' }
  | { type: 'dedupe' }
  | { type: 'smartDedupe' }
  | { type: 'stashAll'; withRecap?: boolean }
  | { type: 'restoreSession'; sessionId: string }
  | { type: 'deleteSession'; sessionId: string }
  | { type: 'getAiStatus' }
  | { type: 'warmNanoDownload' }
  | { type: 'warmGemmaDownload' }
  | { type: 'summarizeTab'; tabId: number }
  | { type: 'startFocus'; anchorTabId: number }
  | { type: 'exitFocus' }
  | { type: 'getFocusState' }
  | { type: 'reviewUnread'; olderThanDays: number }
  | { type: 'getSettings' }
  | { type: 'patchSettings'; patch: Partial<Settings> }
  | { type: 'getEntitlements' }
  | { type: 'getLicenseState' }
  | { type: 'applyLicenseKey'; key: string }
  | { type: 'clearLicense' }
  | { type: 'setMonthlyLicense'; extPayUserId: string; active: boolean }
  | { type: 'listWorkspaces' }
  | { type: 'removeWorkspace'; workspaceId: string }
  | { type: 'patchWorkspace'; workspaceId: string; patch: Partial<Workspace> }
  | { type: 'pinWorkspace'; workspaceId: string }
  | { type: 'unpinWorkspace'; workspaceId: string }
  | { type: 'proposeBookmarkImport' }
  | { type: 'acceptBookmarkProposals'; proposals: ProposedWorkspace[] }
  | { type: 'restoreWorkspace'; workspaceId: string }
  | { type: 'getAutomation' }
  | { type: 'patchAutomation'; patch: Partial<AutomationSettings> }
  | { type: 'listActivity' }
  | { type: 'undoActivity'; entryId: string }
  | { type: 'listLearnedRules' }
  | { type: 'deleteLearnedRule'; key: string }
  | { type: 'acceptSuggestion'; tabId: number; workspaceId: string; pattern: string }
  | { type: 'rejectSuggestion'; tabId: number; workspaceId: string; pattern: string }
  | { type: 'listQueuedSuggestions' }
  | { type: 'acceptQueuedSuggestion'; suggestionId: string }
  | { type: 'dismissQueuedSuggestion'; suggestionId: string }
  | { type: 'runProjectDetection' };

export interface GroupNowResult {
  groupsCreated: number;
  tabsGrouped: number;
  tier: 'rule' | 'nano' | 'gemma';
}

export interface DedupeResult {
  closed: number;
}

export interface SmartDedupeResultMsg {
  closed: number;
  inspected: number;
}

export interface StashResult {
  sessionId: string;
  stashed: number;
  recap?: string;
}

export interface AiStatusResult {
  languageModel: AiAvailabilityState;
  summarizer: AiAvailabilityState;
  gemma: AiAvailabilityState;
  webGpu: boolean;
}

export interface SummarizeTabResult {
  summary: string;
}

export interface FocusStartResult {
  deferred: number;
  sessionId: string;
}

export interface FocusStateResult {
  active: boolean;
  anchorTitle?: string;
  deferredSessionId?: string;
}

export interface ReviewUnreadResult {
  stale: Array<{ url: string; title: string; lastAccessed: number; tabId: number }>;
}

export type CommandResponse<C extends Command = Command> = C extends { type: 'groupNow' }
  ? GroupNowResult
  : C extends { type: 'dedupe' }
    ? DedupeResult
    : C extends { type: 'smartDedupe' }
      ? SmartDedupeResultMsg
      : C extends { type: 'stashAll' }
        ? StashResult
        : C extends { type: 'restoreSession' }
          ? { restored: number }
          : C extends { type: 'deleteSession' }
            ? { ok: true }
            : C extends { type: 'getAiStatus' }
              ? AiStatusResult
              : C extends { type: 'warmNanoDownload' }
                ? { state: AiAvailabilityState }
                : C extends { type: 'warmGemmaDownload' }
                  ? { state: AiAvailabilityState }
                  : C extends { type: 'summarizeTab' }
                    ? SummarizeTabResult
                    : C extends { type: 'startFocus' }
                      ? FocusStartResult
                      : C extends { type: 'exitFocus' }
                        ? { restored: number }
                        : C extends { type: 'getFocusState' }
                          ? FocusStateResult
                          : C extends { type: 'reviewUnread' }
                            ? ReviewUnreadResult
                            : C extends { type: 'getSettings' }
                              ? Settings
                              : C extends { type: 'patchSettings' }
                                ? Settings
                                : C extends { type: 'getEntitlements' }
                                  ? Entitlements
                                  : C extends { type: 'getLicenseState' }
                                    ? LicenseState
                                    : C extends { type: 'applyLicenseKey' }
                                      ? { ok: true; plan: 'lifetime' }
                                      : C extends { type: 'clearLicense' }
                                        ? { ok: true }
                                        : C extends { type: 'setMonthlyLicense' }
                                          ? LicenseState
                                          : C extends { type: 'listWorkspaces' }
                                            ? Workspace[]
                                            : C extends { type: 'removeWorkspace' }
                                              ? { ok: true }
                                              : C extends { type: 'patchWorkspace' }
                                                ? Workspace
                                                : C extends { type: 'pinWorkspace' }
                                                  ? Workspace
                                                  : C extends { type: 'unpinWorkspace' }
                                                    ? Workspace
                                                    : C extends { type: 'proposeBookmarkImport' }
                                                      ? ProposedWorkspace[]
                                                      : C extends { type: 'acceptBookmarkProposals' }
                                                        ? Workspace[]
                                                        : C extends { type: 'restoreWorkspace' }
                                                          ? { restored: number }
                                                          : C extends { type: 'getAutomation' }
                                                            ? AutomationSettings
                                                            : C extends { type: 'patchAutomation' }
                                                              ? AutomationSettings
                                                              : C extends { type: 'listActivity' }
                                                                ? ActivityEntry[]
                                                                : C extends { type: 'undoActivity' }
                                                                  ? { ok: true }
                                                                  : C extends { type: 'listLearnedRules' }
                                                                    ? LearnedRule[]
                                                                    : C extends { type: 'deleteLearnedRule' }
                                                                      ? { ok: true }
                                                                      : C extends { type: 'acceptSuggestion' }
                                                                        ? LearnedRule
                                                                        : C extends { type: 'rejectSuggestion' }
                                                                          ? LearnedRule
                                                                          : C extends { type: 'listQueuedSuggestions' }
                                                                            ? Suggestion[]
                                                                            : C extends { type: 'acceptQueuedSuggestion' }
                                                                              ? Workspace
                                                                              : C extends { type: 'dismissQueuedSuggestion' }
                                                                                ? { ok: true }
                                                                                : C extends { type: 'runProjectDetection' }
                                                                                  ? { queued: number }
                                                                                  : never;

export type Envelope =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export async function sendCommand<C extends Command>(cmd: C): Promise<CommandResponse<C>> {
  const env = (await browser.runtime.sendMessage(cmd)) as Envelope;
  if (!env || typeof env !== 'object') throw new Error('empty response from background');
  if (!env.ok) throw new Error(env.error);
  return env.data as CommandResponse<C>;
}
