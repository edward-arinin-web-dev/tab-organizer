export type { Entitlements, LicensePlan, LicenseState, LifetimePayload } from './types';
export { DEFAULT_LICENSE_STATE } from './types';
export { licenseStore } from './store';
export { gemmaQuota, FREE_GEMMA_MONTHLY_LIMIT, monthStart, remaining } from './quota';
export {
  getEntitlements,
  computeEntitlements,
  isActivePro,
  gateGemmaCall,
  recordGemmaCall,
} from './entitlements';
export { verifyLicenseKey, LicenseVerifyError, LICENSE_PUBLIC_KEY_B64 } from './keys';
