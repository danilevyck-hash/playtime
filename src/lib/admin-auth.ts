import crypto from 'crypto';

// In-memory rate limiting
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory session tokens (valid for 24h)
type SessionData = { expiresAt: number; role: 'admin' | 'vendedora' };
const sessions = new Map<string, SessionData>(); // token -> session data

// ─── Signed tokens (work across serverless cold starts) ───
// Format: base64({role, exp}).base64(hmac-sha256)
function getSigningKey(): string {
  // Use service role key as HMAC secret (always available server-side)
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_PIN || 'fallback-key';
}

export function createSignedToken(role: 'admin' | 'vendedora'): string {
  const payload = JSON.stringify({ role, exp: Date.now() + 24 * 60 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySignedToken(token: string): { valid: boolean; role: 'admin' | 'vendedora' | null } {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return { valid: false, role: null };
    const expectedSig = crypto.createHmac('sha256', getSigningKey()).update(payloadB64).digest('base64url');
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

export function createSession(role: 'admin' | 'vendedora' = 'admin'): string {
  // Return a signed token that works across serverless instances
  const token = createSignedToken(role);
  // Also cache in-memory for fast validation on same instance
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
  sessions.set(token, { expiresAt, role });
  return token;
}

function safeCompare(input: string, secret: string): boolean {
  const inputBuffer = Buffer.from(input.padEnd(32, '\0'));
  const secretBuffer = Buffer.from(secret.padEnd(32, '\0'));
  return crypto.timingSafeEqual(inputBuffer, secretBuffer);
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
