import { storage } from '#imports';
import { DEFAULT_LICENSE_STATE, type LicenseState } from './types';

const licenseItem = storage.defineItem<LicenseState>('local:license', {
  fallback: DEFAULT_LICENSE_STATE,
});

export const licenseStore = {
  get: () => licenseItem.getValue(),
  set: (next: LicenseState) => licenseItem.setValue(next),
  patch: async (patch: Partial<LicenseState>): Promise<LicenseState> => {
    const cur = await licenseItem.getValue();
    const next: LicenseState = { ...cur, ...patch };
    await licenseItem.setValue(next);
    return next;
  },
  watch: (cb: (next: LicenseState) => void) => licenseItem.watch(cb),
};
