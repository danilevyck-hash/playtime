import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

// In-memory rate limiting (fallback only — see checkAndCountAttempt below).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory session tokens (valid for 24h)
type SessionData = { expiresAt: number; role: 'admin' | 'vendedora' };
const sessions = new Map<string, SessionData>(); // token -> session data

// ─── Signed tokens (work across serverless cold starts) ───
// Format: base64({role, exp}).base64(hmac-sha256)
// HMAC signing key. MUST be a strong secret. We do NOT fall back to ADMIN_PIN
// (4 digits = trivially brute-forceable) nor to a hardcoded string (forgeable by
// anyone). If no strong secret is configured, auth fails closed — no token can be
// issued or verified.
function getSigningKey(): string | null {
  // Prefer a dedicated AUTH_SECRET so the session-signing key is decoupled from
  // the DB service-role key (rotating one shouldn't force-rotate the other).
  const key = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key && key.length >= 32 ? key : null;
}

export function createSignedToken(role: 'admin' | 'vendedora'): string {
  const key = getSigningKey();
  if (!key) {
    console.error('[auth] No strong signing key (SUPABASE_SERVICE_ROLE_KEY/AUTH_SECRET) — refusing to issue token');
    return '';
  }
  const payload = JSON.stringify({ role, exp: Date.now() + 24 * 60 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySignedToken(token: string): { valid: boolean; role: 'admin' | 'vendedora' | null } {
  try {
    const key = getSigningKey();
    if (!key) return { valid: false, role: null };
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return { valid: false, role: null };
    const expectedSig = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return { valid: false, role: null };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (Date.now() > payload.exp) return { valid: false, role: null };
    return { valid: true, role: payload.role };
  } catch {
    return { valid: false, role: null };
  }
}

export function getClientIP(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown';
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

export function clearRateLimit(ip: string): void {
  attempts.delete(ip);
}

// ─── Serverless-safe rate limiting (Postgres-backed, fail-open) ───
// The in-memory Map above resets on every cold start and isn't shared across
// instances, so it can't stop a distributed brute-force of the 4-digit PIN.
// These count/clear attempts atomically in Supabase (register_login_attempt /
// clear_login_attempts RPCs). If the table/RPCs aren't deployed yet — or any
// error occurs — they FALL BACK to the in-memory limiter so login never breaks.

/** Count this attempt and return true if the IP is now over the limit. */
export async function checkAndCountAttempt(ip: string): Promise<boolean> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('register_login_attempt', { p_ip: ip });
      if (!error && typeof data === 'boolean') return data;
    } catch (e) {
      console.error('[auth] register_login_attempt failed, using in-memory limiter:', e);
    }
  }
  return isRateLimited(ip);
}

/** Reset the counter for an IP after a successful login. */
export async function clearAttempts(ip: string): Promise<void> {
  clearRateLimit(ip); // clear the in-memory fallback too
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.rpc('clear_login_attempts', { p_ip: ip });
    } catch (e) {
      console.error('[auth] clear_login_attempts failed:', e);
    }
  }
}

export function isValidSession(token: string | null | undefined): boolean {
  if (!token) return false;
  // Check in-memory sessions first (fast path, same instance)
  const session = sessions.get(token);
  if (session) {
    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      // fall through to check signed token
    } else {
      return true;
    }
  }
  // Check signed token (works across serverless cold starts)
  const { valid } = verifySignedToken(token);
  return valid;
}

export function getSessionRole(token: string | null | undefined): 'admin' | 'vendedora' | null {
  if (!token) return null;
  // Check in-memory first
  const session = sessions.get(token);
  if (session) {
    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
    } else {
      return session.role;
    }
  }
  // Check signed token
  const { valid, role } = verifySignedToken(token);
  return valid ? role : null;
}

/**
 * Server-side ROLE authorization. Unlike isValidSession(), this validates the
 * role embedded in the HMAC-signed token and does NOT honor the x-admin-pin
 * fallback header — so a role check cannot be bypassed with a raw PIN.
 * Returns 401 if no valid session, 403 if the session role doesn't match.
 */
export function requireRole(
  request: Request,
  role: 'admin' | 'vendedora'
): { authorized: true } | { authorized: false; status: number; error: string } {
  const token = request.headers.get('x-admin-token');
  const sessionRole = getSessionRole(token);
  if (!sessionRole) return { authorized: false, status: 401, error: 'Unauthorized' };
  if (sessionRole !== role) return { authorized: false, status: 403, error: 'Forbidden' };
  return { authorized: true };
}

export function createSession(role: 'admin' | 'vendedora' = 'admin'): string {
  // Return a signed token that works across serverless instances
  const token = createSignedToken(role);
  // Fail closed: if no strong signing key, createSignedToken returns '' — never
  // cache an empty token (isValidSession/getSessionRole already reject it).
  if (!token) return '';
  // Also cache in-memory for fast validation on same instance
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
  sessions.set(token, { expiresAt, role });
  return token;
}

function safeCompare(input: string, secret: string): boolean {
  // Hash both to a fixed 32-byte digest before comparing: timingSafeEqual requires
  // equal-length buffers and throws RangeError otherwise (e.g. an attacker sending
  // a >32-char "PIN"). Hashing normalizes length while staying constant-time.
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function verifyPin(pin: string): { valid: boolean; role: 'admin' | 'vendedora' | null } {
  const adminPin = process.env.ADMIN_PIN;
  const vendedoraPin = process.env.VENDEDORA_PIN;

  // Always check both PINs to prevent timing-based role detection
  const isAdmin = adminPin ? safeCompare(pin, adminPin) : false;
  const isVendedora = vendedoraPin ? safeCompare(pin, vendedoraPin) : false;

  if (isAdmin) return { valid: true, role: 'admin' };
  if (isVendedora) return { valid: true, role: 'vendedora' };
  return { valid: false, role: null };
}
