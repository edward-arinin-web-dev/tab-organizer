/**
 * Reconciles the toolbar icon state with a `BadgeIntent`.
 *
 * Owns the side-effects: chrome.action.setBadgeText / setBadgeBackgroundColor /
 * setTitle / setIcon. The intent is computed pure in `intent.ts`; this module
 * is a thin renderer + change detector with a frame-loop for animations.
 *
 * Important MV3 detail: state cannot live in module scope because the service
 * worker may respawn. Every input is derived from chrome.storage so the
 * controller can rebuild from cold start.
 */

import {
  computeBadgeIntent,
  type BadgeColor,
  type BadgeIntent,
  type IconVariant,
  type AmbientSnapshot,
} from './intent';
import { getIcon } from './icons';
import { nanoDownload, gemmaDownload } from '~/core/storage/ai-status';
import { suggestionQueue } from '~/core/storage/suggestions';
import { focus } from '~/core/storage/focus';
import { getEntitlements } from '~/core/license';
import { settings } from '~/core/storage/settings';
import { storage } from '#imports';

// ----- ephemeral flags -----------------------------------------------------

const workingFlag = storage.defineItem<{ until: number; jobId: string } | null>(
  'local:ambient.working',
  { fallback: null },
);

const thinkingFlag = storage.defineItem<{ until: number } | null>(
  'local:ambient.thinking',
  { fallback: null },
);

const successFlag = storage.defineItem<{ until: number; message: string } | null>(
  'local:ambient.success',
  { fallback: null },
);

const errorFlag = storage.defineItem<string | null>('local:ambient.lastError', {
  fallback: null,
});

const WORKING_AUTO_EXPIRE_MS = 30 * 1000;
const THINKING_AUTO_EXPIRE_MS = 4_000;
const SUCCESS_VISIBLE_MS = 2_500;

// Keep the working animation visible for at least this long so a fast
// (sub-second) grouping is still noticed.
const MIN_WORKING_MS = 1400;
// Idle "breathe" window: the icon gently breathes for this long after any
// activity, then settles still so the service worker can sleep.
const BREATHE_WINDOW_MS = 20_000;
const BREATHE_HZ = 2.5;
const BREATHE_ENERGY = 0.22;

let workingBeganAt = 0;
let workingEndTimer: ReturnType<typeof setTimeout> | null = null;

async function clearWorking(jobId: string): Promise<void> {
  const cur = await workingFlag.getValue();
  if (cur && cur.jobId === jobId) {
    await workingFlag.setValue(null);
    await reconcile();
  }
}

export const working = {
  begin: async (jobId: string): Promise<void> => {
    workingBeganAt = Date.now();
    if (workingEndTimer) {
      clearTimeout(workingEndTimer);
      workingEndTimer = null;
    }
    await workingFlag.setValue({ until: Date.now() + WORKING_AUTO_EXPIRE_MS, jobId });
    await reconcile();
  },
  end: async (jobId: string): Promise<void> => {
    // Defer the clear if the job finished faster than the minimum visible time.
    const remaining = MIN_WORKING_MS - (Date.now() - workingBeganAt);
    if (remaining > 0) {
      if (workingEndTimer) clearTimeout(workingEndTimer);
      workingEndTimer = setTimeout(() => {
        workingEndTimer = null;
        void clearWorking(jobId);
      }, remaining);
      return;
    }
    await clearWorking(jobId);
  },
};

export const thinking = {
  begin: async (): Promise<void> => {
    await thinkingFlag.setValue({ until: Date.now() + THINKING_AUTO_EXPIRE_MS });
    await reconcile();
  },
  end: async (): Promise<void> => {
    await thinkingFlag.setValue(null);
    await reconcile();
  },
};

export const success = {
  flash: async (message: string): Promise<void> => {
    await successFlag.setValue({ until: Date.now() + SUCCESS_VISIBLE_MS, message });
    await reconcile();
  },
};

export const ambientError = {
  set: async (msg: string): Promise<void> => {
    await errorFlag.setValue(msg);
    await reconcile();
  },
  clear: async (): Promise<void> => {
    const cur = await errorFlag.getValue();
    if (cur !== null) {
      await errorFlag.setValue(null);
      await reconcile();
    }
  },
};

// ----- snapshot ------------------------------------------------------------

async function snapshot(): Promise<AmbientSnapshot> {
  const [nano, gemma, sugs, foc, work, think, succ, err] = await Promise.all([
    nanoDownload.get(),
    gemmaDownload.get(),
    suggestionQueue.list(),
    focus.get(),
    workingFlag.getValue(),
    thinkingFlag.getValue(),
    successFlag.getValue(),
    errorFlag.getValue(),
  ]);

  let entitlements = null;
  try {
    entitlements = await getEntitlements();
  } catch {
    /* license not ready */
  }

  let duplicateCount = 0;
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const seen = new Set<string>();
    for (const t of tabs) {
      if (!t.url) continue;
      const c = t.url.split('#')[0]!;
      if (seen.has(c)) duplicateCount++;
      else seen.add(c);
    }
  } catch {
    /* no window yet */
  }

  const now = Date.now();
  const workingActive = work !== null && work.until > now;
  const thinkingActive = think !== null && think.until > now;
  const successUntil = succ !== null && succ.until > now ? succ.until : null;
  const successMessage = succ !== null && succ.until > now ? succ.message : null;

  let deferredCount: number | undefined;
  if (foc?.deferredSessionId) {
    try {
      const { listSessions } = await import('~/core/storage/sessions');
      const all = await listSessions();
      const s = all.find((x) => x.id === foc.deferredSessionId);
      if (s) deferredCount = s.tabs.length;
    } catch {
      /* tolerate */
    }
  }

  return {
    nanoDownload: nano,
    gemmaDownload: gemma,
    focusActive: foc !== null,
    focusAnchorTitle: foc?.anchorTitle,
    focusDeferredCount: deferredCount,
    suggestionCount: sugs.length,
    duplicateCount,
    working: workingActive,
    thinking: thinkingActive,
    successUntil,
    successMessage,
    lastError: err,
    entitlements,
  };
}

// ----- reconciler ----------------------------------------------------------

// Native badge text is white, so these are the DEEP variants (AA on white),
// not the bright glow jade.
const COLOR_MAP: Record<BadgeColor, string> = {
  accent: '#0F766E', // deep teal — white badge text ≈ 5:1
  amber: '#B45309', // deepened amber for white text
  red: '#E11D48', // deep rose
  grey: '#475569', // slate
  'accent-strong': '#115E59', // darkest teal — focus
};

let lastApplied: {
  text: string;
  color: string;
  tooltip: string;
  icon: IconVariant;
  dot: string | null;
} | null = null;

// Frame loop state — driven by setTimeout chain since SW lacks rAF.
let animationTimer: ReturnType<typeof setTimeout> | null = null;
let animationPhase = 0;
let animationVariant: IconVariant | null = null;
let animationDot: string | null = null;
let animationMode: 'active' | 'breathe' | null = null;
// Set on every reconcile (i.e. on any activity). The breathe loop runs while
// `now < breatheUntil`, then settles still.
let breatheUntil = 0;

// One full conic-gradient rotation = 18 frames; at 8 Hz ≈ 2.25 s/rev. The 18
// buckets line up with the icon cache (see icons.ts cacheKey).
const PHASE_DELTA = 1 / 18;

function stopAnimation(): void {
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
  animationVariant = null;
  animationDot = null;
  animationMode = null;
}

function scheduleNextFrame(hz: number, variant: IconVariant, dot: string | null): void {
  if (animationTimer) clearTimeout(animationTimer);
  animationVariant = variant;
  animationDot = dot;
  animationMode = 'active';
  const intervalMs = Math.max(80, Math.round(1000 / hz));
  animationTimer = setTimeout(() => {
    animationPhase = (animationPhase + PHASE_DELTA) % 1;
    paintIcon(variant, animationPhase, dot);
    scheduleNextFrame(hz, variant, dot);
  }, intervalMs);
}

// Gentle idle breathe after recent activity. Self-terminates once the breathe
// window elapses: paints a still frame and stops the loop so the SW can sleep
// and the icon freezes — no permanent keepalive.
function scheduleBreatheFrame(variant: IconVariant, dot: string | null): void {
  if (animationTimer) clearTimeout(animationTimer);
  animationVariant = variant;
  animationDot = dot;
  animationMode = 'breathe';
  const intervalMs = Math.max(80, Math.round(1000 / BREATHE_HZ));
  animationTimer = setTimeout(() => {
    if (Date.now() >= breatheUntil) {
      animationPhase = 0;
      paintIcon(variant, 0, dot);
      stopAnimation();
      return;
    }
    animationPhase = (animationPhase + PHASE_DELTA) % 1;
    paintIcon(variant, animationPhase, dot, BREATHE_ENERGY);
    scheduleBreatheFrame(variant, dot);
  }, intervalMs);
}

function paintIcon(
  variant: IconVariant,
  phase: number,
  dot: string | null,
  energy: number | null = null,
): void {
  try {
    void chrome.action.setIcon({ imageData: getIcon(variant, phase, dot, energy) });
  } catch {
    /* tolerate */
  }
}

export async function reconcile(): Promise<void> {
  // Every reconcile is triggered by an activity signal (a watch firing or a tab
  // event). Arm the breathe window so the idle icon gently breathes afterwards.
  breatheUntil = Date.now() + BREATHE_WINDOW_MS;
  const snap = await snapshot();
  const intent = computeBadgeIntent(snap);
  let reducedMotion = false;
  try {
    reducedMotion = (await settings.get()).reducedMotion;
  } catch {
    /* settings not ready */
  }
  await applyIntent(intent, reducedMotion);
}

async function applyIntent(intent: BadgeIntent, reducedMotion = false): Promise<void> {
  const color = intent.color ? COLOR_MAP[intent.color] : '#00000000';
  const dot = intent.dot?.color ?? null;

  const sameAsLast =
    lastApplied &&
    lastApplied.text === intent.text &&
    lastApplied.color === color &&
    lastApplied.tooltip === intent.tooltip &&
    lastApplied.icon === intent.icon &&
    lastApplied.dot === dot;

  if (!sameAsLast) {
    lastApplied = { text: intent.text, color, tooltip: intent.tooltip, icon: intent.icon, dot };
    try {
      await chrome.action.setBadgeText({ text: intent.text });
      if (intent.color) {
        await chrome.action.setBadgeBackgroundColor({ color });
      }
      await chrome.action.setTitle({ title: intent.tooltip });
    } catch (err) {
      console.warn('[ambient] reconcile failed', err);
    }
  }

  // Animation lifecycle. Reduced-motion paints a single static active frame
  // instead of spinning — phase 0 is a fixed conic, still clearly "active".
  const animate = !!intent.animationHz && intent.animationHz > 0 && !reducedMotion;
  // Breathe only the plain resting state, and only inside the post-activity
  // window, never under reduced-motion.
  const breathe =
    !animate && intent.kind === 'idle' && !reducedMotion && Date.now() < breatheUntil;
  if (animate) {
    if (animationMode !== 'active' || animationVariant !== intent.icon || animationDot !== dot) {
      animationPhase = 0;
      scheduleNextFrame(intent.animationHz!, intent.icon, dot);
    }
    // Paint immediately so the user sees the change without waiting a tick.
    paintIcon(intent.icon, animationPhase, dot);
  } else if (breathe) {
    if (animationMode !== 'breathe' || animationVariant !== intent.icon || animationDot !== dot) {
      scheduleBreatheFrame(intent.icon, dot);
    }
    paintIcon(intent.icon, animationPhase, dot, BREATHE_ENERGY);
  } else {
    stopAnimation();
    paintIcon(intent.icon, 0, dot);
  }

  // Schedule a follow-up reconcile when a transient intent expires so the
  // badge clears itself without waiting for the next external event.
  schedulePostExpire(intent);
}

let expireTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePostExpire(intent: BadgeIntent): void {
  if (expireTimer) {
    clearTimeout(expireTimer);
    expireTimer = null;
  }
  // Success has the only fixed expiry that we own here; other transients
  // (working/thinking) clear themselves through explicit end() calls.
  if (intent.kind === 'success') {
    expireTimer = setTimeout(() => {
      void reconcile();
    }, SUCCESS_VISIBLE_MS + 200);
  }
}

// ----- install -------------------------------------------------------------

let installed = false;

export function installBadge(): void {
  if (installed) return;
  installed = true;

  nanoDownload.watch(() => void reconcile());
  gemmaDownload.watch(() => void reconcile());
  suggestionQueue.watch(() => void reconcile());
  focus.watch(() => void reconcile());
  workingFlag.watch(() => void reconcile());
  thinkingFlag.watch(() => void reconcile());
  successFlag.watch(() => void reconcile());
  errorFlag.watch(() => void reconcile());
  settings.watch(() => void reconcile());

  chrome.tabs.onCreated.addListener(() => void reconcile());
  chrome.tabs.onRemoved.addListener(() => void reconcile());
  chrome.tabs.onUpdated.addListener((_, change) => {
    if (change.url) void reconcile();
  });

  chrome.runtime.onStartup.addListener(() => void reconcile());
  chrome.runtime.onInstalled.addListener(() => void reconcile());

  try {
    chrome.alarms.create('ambient-reconcile', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((a) => {
      if (a.name === 'ambient-reconcile') void reconcile();
    });
  } catch {
    /* alarms permission may be missing */
  }

  void reconcile();
}
