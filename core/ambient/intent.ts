/**
 * Pure computation of what the toolbar icon should display.
 *
 * One central function — `computeBadgeIntent` — takes a snapshot of every
 * state we care about and returns a single `BadgeIntent`. Pure, easy to test,
 * easy to reason about. The badge controller calls this on every input
 * change and reconciles via `chrome.action.*` APIs.
 *
 * Precedence (only one shown):
 *   error > download > success > working > thinking > focus > quota >
 *   suggestions > duplicates > idle
 *
 * Persistent counters (suggestions, duplicates) surface as a small corner
 * `dot` painted into the icon canvas — not as a native Chrome badge — so
 * the glyph stays visible at 16 px. Symbolic signals (`!`, `✓`) still use
 * the native badge text because a single glyph there carries clear meaning.
 */

import type { DownloadProgress } from '~/core/storage/ai-status';
import type { Entitlements } from '~/core/license/types';

export type BadgeColor =
  | 'accent' // burnt orange — working / success
  | 'amber' // download in progress
  | 'red' // error or quota exhausted
  | 'grey' // duplicates, low-priority
  | 'accent-strong'; // focus mode

export type IconVariant = 'idle' | 'working' | 'thinking' | 'success' | 'focus';

/**
 * Small corner overlay painted into the icon canvas. Used in place of the
 * native chrome badge for persistent counters so the glyph stays visible.
 */
export interface BadgeDot {
  /** Fill color of the dot — hex. */
  color: string;
}

export interface BadgeIntent {
  /** Text shown in the native chrome badge. `''` clears it. Max ~4 chars. */
  text: string;
  /** Background color of the native badge text. */
  color: BadgeColor | null;
  /** Icon variant to swap in. */
  icon: IconVariant;
  /** Optional corner-dot overlay painted into the icon canvas itself. */
  dot?: BadgeDot | null;
  /** Tooltip — explains what the badge means. */
  tooltip: string;
  /** Higher = more urgent. For tie-breaking when state changes rapidly. */
  priority: number;
  /** Stable kind tag so the controller can avoid redundant updates. */
  kind:
    | 'idle'
    | 'error'
    | 'download'
    | 'working'
    | 'thinking'
    | 'success'
    | 'focus'
    | 'suggestions'
    | 'duplicates'
    | 'quota';
  /**
   * When set, the badge controller should re-render at this rate while the
   * intent is active — used to power the animated frames of `working` /
   * `thinking`. Higher = smoother but more wakeups.
   */
  animationHz?: number;
}

export interface AmbientSnapshot {
  nanoDownload: DownloadProgress | null;
  gemmaDownload: DownloadProgress | null;
  focusActive: boolean;
  focusAnchorTitle?: string;
  focusDeferredCount?: number;
  suggestionCount: number;
  duplicateCount: number;
  working: boolean;
  /** Transient — the classifier is mid-decision on a new tab. Short-lived. */
  thinking: boolean;
  /** Transient — last action succeeded; ~2s burst. */
  successUntil: number | null;
  successMessage: string | null;
  /** Last error message, if the user has not opened the popup since it occurred. */
  lastError: string | null;
  entitlements: Entitlements | null;
}

// Dot colors — jade/teal brand, rendered directly onto the dark icon canvas
// (full hex, no map). These are glow pips, not text backgrounds.
const DOT = {
  accent: '#2DD4BF', // jade glow
  amber: '#F59E0B', // download / quota warning
  red: '#F43F5E', // rose — error / over limit
  grey: '#94A3B8', // slate — low-priority
} as const;

const IDLE: BadgeIntent = {
  text: '',
  color: null,
  icon: 'idle',
  dot: null,
  tooltip: 'Tab Organizer',
  priority: 0,
  kind: 'idle',
};

// Shared animation rate for `working` and `thinking`. Both states drive the
// same conic-gradient rotation on the icon, so the visual is continuous if
// state flips between them mid-run.
// Aurora flow rate. `working` runs hotter/faster than `thinking` so the icon
// visibly intensifies when real work (not just classification) is in flight.
// The MV3 worker has no rAF and throttles timers, so these stay modest — the
// per-frame `energy` (icons.ts) does most of the "intensity" lifting.
const WORKING_HZ = 14;
const THINKING_HZ = 6;

export function computeBadgeIntent(s: AmbientSnapshot): BadgeIntent {
  // 1. Error — highest. Only shown when user has not seen popup since the error.
  if (s.lastError) {
    return {
      text: '!',
      color: 'red',
      icon: 'idle',
      dot: { color: DOT.red },
      tooltip: `Last action failed: ${truncate(s.lastError, 80)}`,
      priority: 100,
      kind: 'error',
    };
  }

  // 2. Download — actionable real-time signal. Keeps the native badge
  //    percentage because the precise number is the point.
  const dl = pickActiveDownload(s.nanoDownload, s.gemmaDownload);
  if (dl) {
    const pct = Math.round(dl.progress.loaded * 100);
    return {
      text: dl.progress.state === 'extracting' ? '…' : `${Math.min(pct, 99)}`,
      color: 'amber',
      icon: 'working',
      tooltip:
        dl.progress.state === 'extracting'
          ? `${dl.label} · initializing model`
          : `${dl.label} · downloading · ${pct}%`,
      priority: 80,
      kind: 'download',
      animationHz: WORKING_HZ,
    };
  }

  // 3a. Success burst — transient, beats working/thinking so the user sees it.
  if (s.successUntil && s.successUntil > Date.now()) {
    return {
      text: '✓',
      color: 'accent',
      icon: 'success',
      tooltip: s.successMessage ?? 'Done',
      priority: 75,
      kind: 'success',
    };
  }

  // 3b. Working — synchronous job in flight, animated conic gradient.
  if (s.working) {
    return {
      text: '',
      color: null,
      icon: 'working',
      tooltip: 'Tab Organizer · working…',
      priority: 70,
      kind: 'working',
      animationHz: WORKING_HZ,
    };
  }

  // 3c. Thinking — classifier mid-decision. Same animation as working.
  if (s.thinking) {
    return {
      text: '',
      color: null,
      icon: 'thinking',
      tooltip: 'Thinking about this tab…',
      priority: 65,
      kind: 'thinking',
      animationHz: THINKING_HZ,
    };
  }

  // 4. Focus — bullseye icon swap.
  if (s.focusActive) {
    const anchor = s.focusAnchorTitle ? truncate(s.focusAnchorTitle, 50) : 'current tab';
    const deferred = s.focusDeferredCount ?? 0;
    return {
      text: '',
      color: 'accent-strong',
      icon: 'focus',
      tooltip:
        deferred > 0
          ? `Focus on: ${anchor} · ${deferred} tab${deferred === 1 ? '' : 's'} deferred`
          : `Focus on: ${anchor}`,
      priority: 60,
      kind: 'focus',
    };
  }

  // 5. Quota near/over limit — surfaced even when no other signal.
  if (s.entitlements && !s.entitlements.isPro) {
    const { used, limit } = s.entitlements.gemma;
    if (used >= limit) {
      return {
        text: '!',
        color: 'red',
        icon: 'idle',
        dot: { color: DOT.red },
        tooltip: `Gemma quota: ${used}/${limit} used this month · rule-based fallback active`,
        priority: 55,
        kind: 'quota',
      };
    }
    if (limit > 0 && used / limit >= 0.9) {
      return {
        text: '!',
        color: 'amber',
        icon: 'idle',
        dot: { color: DOT.amber },
        tooltip: `Gemma quota: ${used}/${limit} (${Math.round((used / limit) * 100)}%) used this month`,
        priority: 54,
        kind: 'quota',
      };
    }
  }

  // 6. Suggestions ready — surface as a corner dot, exact count in tooltip.
  if (s.suggestionCount > 0) {
    return {
      text: '',
      color: 'accent',
      icon: 'idle',
      dot: { color: DOT.accent },
      tooltip: `${s.suggestionCount} suggestion${s.suggestionCount === 1 ? '' : 's'} ready · click to review`,
      priority: 40,
      kind: 'suggestions',
    };
  }

  // 7. Duplicates — same corner-dot treatment, grey to read as low-priority.
  if (s.duplicateCount > 0) {
    return {
      text: '',
      color: 'grey',
      icon: 'idle',
      dot: { color: DOT.grey },
      tooltip: `${s.duplicateCount} duplicate tab${s.duplicateCount === 1 ? '' : 's'} in this window`,
      priority: 20,
      kind: 'duplicates',
    };
  }

  return IDLE;
}

function pickActiveDownload(
  nano: DownloadProgress | null,
  gemma: DownloadProgress | null,
): { progress: DownloadProgress; label: string } | null {
  if (isActive(nano)) return { progress: nano!, label: 'Gemini Nano' };
  if (isActive(gemma)) return { progress: gemma!, label: 'Backup engine' };
  return null;
}

function isActive(p: DownloadProgress | null): boolean {
  if (!p) return false;
  return p.state === 'starting' || p.state === 'downloading' || p.state === 'extracting';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
