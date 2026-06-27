/**
 * First-run onboarding flag. Persisted in chrome.storage.local so the welcome
 * page opens exactly once (on install), never again — and survives SW restarts.
 */

import { storage } from '#imports';

const item = storage.defineItem<boolean>('local:onboardingDone', {
  fallback: false,
});

export const onboardingState = {
  isDone: (): Promise<boolean> => item.getValue(),
  markDone: (): Promise<void> => item.setValue(true),
  reset: (): Promise<void> => item.setValue(false),
  watch: (cb: (done: boolean) => void) => item.watch((v) => cb(!!v)),
};
