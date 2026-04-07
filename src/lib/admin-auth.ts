import crypto from 'crypto';

// In-memory rate limiting
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory session tokens (valid for 24h)
type SessionData = { expiresAt: number; role: 'admin' | 'vendedora' };
const sessions = new Map<string, SessionData>(); // token -> session data

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
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function getSessionRole(token: string | null | undefined): 'admin' | 'vendedora' | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.role;
}

export function createSession(role: 'admin' | 'vendedora' = 'admin'): string {
  const token = crypto.randomBytes(32).toString('hex');
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
