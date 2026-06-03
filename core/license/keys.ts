/**
 * Offline license-key verification using Web Crypto Ed25519.
 *
 * A license key is `BASE64URL(payloadJson) + '.' + BASE64URL(signature)`.
 * The extension bundles a single Ed25519 public key (32 bytes, base64). The
 * private half lives only on the LemonSqueezy webhook server that mints keys
 * at purchase time.
 *
 * Verification is offline-only: nothing touches the network here.
 */

import type { LifetimePayload } from './types';

/**
 * DEV ONLY public key. Production replaces this at build time via a
 * Vite `define` or `import.meta.env.VITE_LICENSE_PUB_KEY` substitution.
 *
 * The corresponding private key for dev is documented in
 * `docs/dev-license-keypair.md` (gitignored in real life). It is NOT a
 * secret because dev keys never grant Pro on production builds — the
 * production public key differs.
 */
const DEV_PUBLIC_KEY_B64 = 'MCowBQYDK2VwAyEA' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/** Override hook for tests + Vite production substitution. */
export const LICENSE_PUBLIC_KEY_B64: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LICENSE_PUB_KEY) ||
  DEV_PUBLIC_KEY_B64;

export class LicenseVerifyError extends Error {
  constructor(
    message: string,
    public readonly reason: 'malformed' | 'signature' | 'payload',
  ) {
    super(message);
    this.name = 'LicenseVerifyError';
  }
}

/**
 * Parse + verify a license key string. Throws LicenseVerifyError on any
 * failure. Returns the validated payload on success.
 */
export async function verifyLicenseKey(key: string): Promise<LifetimePayload> {
  const trimmed = key.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2) {
    throw new LicenseVerifyError('license key must contain exactly one "."', 'malformed');
  }
  const [payloadB64, signatureB64] = parts as [string, string];

  let payloadBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    payloadBytes = base64urlDecode(payloadB64);
    signatureBytes = base64urlDecode(signatureB64);
  } catch {
    throw new LicenseVerifyError('license key has invalid base64url segments', 'malformed');
  }

  const publicKey = await importEd25519PublicKey(LICENSE_PUBLIC_KEY_B64);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBytes as BufferSource,
      payloadBytes as BufferSource,
    );
  } catch (err) {
    throw new LicenseVerifyError(
      `signature check failed: ${err instanceof Error ? err.message : String(err)}`,
      'signature',
    );
  }
  if (!ok) throw new LicenseVerifyError('signature did not verify', 'signature');

  const text = new TextDecoder().decode(payloadBytes);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LicenseVerifyError('signed payload is not valid JSON', 'payload');
  }

  if (!isLifetimePayload(payload)) {
    throw new LicenseVerifyError('signed payload missing required fields', 'payload');
  }
  return payload;
}

function isLifetimePayload(v: unknown): v is LifetimePayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.orderId === 'string' && typeof o.issuedAt === 'string';
}

async function importEd25519PublicKey(b64: string): Promise<CryptoKey> {
  // The bundled public key is base64-encoded SPKI (DER). This is what
  // `openssl pkey -outform DER -pubout | base64 -w0` produces for an Ed25519
  // key. Web Crypto only accepts 'raw' (32-byte) or 'spki' for Ed25519.
  // We default to 'spki'; if length is 32, treat as raw.
  const bytes = base64StdDecode(b64);
  const format = bytes.length === 32 ? 'raw' : 'spki';
  return crypto.subtle.importKey(format, bytes as BufferSource, { name: 'Ed25519' }, true, [
    'verify',
  ]);
}

function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return base64StdDecode(padded + pad);
}

function base64StdDecode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
