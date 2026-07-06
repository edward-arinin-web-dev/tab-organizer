/**
 * License + entitlements types.
 *
 * Three tiers: free, monthly, lifetime. Monthly + lifetime grant the same
 * feature set (Pro); the distinction matters only for billing UX and revocation.
 *
 * Privacy posture: there is no server-side user record. Monthly is verified
 * via ExtensionPay (anonymous user id round-trip). Lifetime is verified
 * locally via Ed25519 signature over a license blob — zero network calls
 * after purchase.
 */

export type LicensePlan = 'free' | 'monthly' | 'lifetime';

export interface LicenseState {
  plan: LicensePlan;
  /** ExtensionPay anonymous user id, when plan === 'monthly'. */
  extPayUserId?: string;
  /** Verified payload of the Ed25519-signed lifetime key, if present. */
  lifetime?: LifetimePayload;
  /** Last server check timestamp for monthly tier (epoch ms). */
  monthlyCheckedAt?: number;
  /** Whether the monthly subscription is currently active per last check. */
  monthlyActive?: boolean;
}

/**
 * The payload signed by the LemonSqueezy webhook handler at purchase time.
 * The extension only verifies the signature and reads these fields locally.
 */
export interface LifetimePayload {
  /** Order id, used to dedupe across re-pastes. */
  orderId: string;
  /** ISO date of issue. */
  issuedAt: string;
  /** Optional email captured at checkout for receipt — never sent anywhere. */
  email?: string;
  /** Soft cap; honor system. */
  maxInstalls?: number;
}

export const DEFAULT_LICENSE_STATE: LicenseState = { plan: 'free' };

/**
 * Entitlements derived from LicenseState + quota state. The single shape the
 * UI + background code consults; nobody else inspects raw license state.
 */
export interface Entitlements {
  plan: LicensePlan;
  isPro: boolean;
  features: {
    /** Free: rule-based clustering, unlimited. */
    ruleGrouping: boolean;
    /** Free: Chrome Prompt API (Gemini Nano), unlimited (free to us). */
    nanoGrouping: boolean;
    /** Free: 300/mo soft cap. Pro: unlimited. */
    gemmaGrouping: boolean;
    /** Free: automatic grouping is the default experience (kept free). */
    automaticMode: boolean;
    /** Free: workspaces concept exists; Pro: bookmark folder sync. */
    bookmarkSync: boolean;
    /** Free: stash recap exists; Pro: weekly journal aggregation. */
    journalAggregation: boolean;
    /** Free: natural-language custom rules, compiled on-device. */
    customRules: boolean;
  };
  /** Gemma usage for the current calendar month. */
  gemma: {
    used: number;
    limit: number;
    /** Pro plans report Infinity here for display. */
    isUnlimited: boolean;
    /** First-of-month boundary used for reset. */
    periodStart: number;
  };
}
