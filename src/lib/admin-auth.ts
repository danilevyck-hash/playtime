import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ROLES_ADMIN, type Rol } from '@/lib/roles';

// In-memory rate limiting (fallback only — see checkAndCountAttempt below).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory session tokens (valid for 24h)
type SessionData = { expiresAt: number; role: Rol; empleadoId?: string };
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

export function createSignedToken(role: Rol, empleadoId?: string): string {
  const key = getSigningKey();
  if (!key) {
    console.error('[auth] No strong signing key (SUPABASE_SERVICE_ROLE_KEY/AUTH_SECRET) — refusing to issue token');
    return '';
  }
  const payload = JSON.stringify({ role, empleadoId, exp: Date.now() + 24 * 60 * 60 * 1000 });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

const ROLES: readonly Rol[] = ['admin', 'vendedora', 'colaborador'];

export function verifySignedToken(token: string): { valid: boolean; role: Rol | null; empleadoId?: string } {
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
    if (!ROLES.includes(payload.role)) return { valid: false, role: null };
    return { valid: true, role: payload.role, empleadoId: typeof payload.empleadoId === 'string' ? payload.empleadoId : undefined };
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

/**
 * Sesión del ÁREA ADMIN (Dirección o Gerencia). Un colaborador tiene token
 * válido pero NO es sesión admin: todas las rutas del /admin que solo preguntan
 * «¿hay sesión?» pasan por aquí, así que el filtro vive en un solo lugar.
 */
export function isValidSession(token: string | null | undefined): boolean {
  const role = getSessionRole(token);
  return role !== null && ROLES_ADMIN.includes(role);
}

export function getSession(token: string | null | undefined): { role: Rol; empleadoId?: string } | null {
  if (!token) return null;
  // Check in-memory first
  const session = sessions.get(token);
  if (session) {
    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
    } else {
      return { role: session.role, empleadoId: session.empleadoId };
    }
  }
  // Check signed token (works across serverless cold starts)
  const { valid, role, empleadoId } = verifySignedToken(token);
  return valid && role ? { role, empleadoId } : null;
}

export function getSessionRole(token: string | null | undefined): Rol | null {
  return getSession(token)?.role ?? null;
}

/**
 * Server-side ROLE authorization. Validates the role embedded in the
 * HMAC-signed token (never a raw PIN). Accepts one role or a list.
 * Returns 401 if no valid session, 403 if the session role isn't allowed.
 */
export function requireRole(
  request: Request,
  role: Rol | Rol[]
): { authorized: true; role: Rol; empleadoId?: string } | { authorized: false; status: number; error: string } {
  const session = getSession(request.headers.get('x-admin-token'));
  if (!session) return { authorized: false, status: 401, error: 'Unauthorized' };
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(session.role)) return { authorized: false, status: 403, error: 'Forbidden' };
  return { authorized: true, role: session.role, empleadoId: session.empleadoId };
}

export function createSession(role: Rol = 'admin', empleadoId?: string): string {
  // Return a signed token that works across serverless instances
  const token = createSignedToken(role, empleadoId);
  // Fail closed: if no strong signing key, createSignedToken returns '' — never
  // cache an empty token (isValidSession/getSessionRole already reject it).
  if (!token) return '';
  // Also cache in-memory for fast validation on same instance
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h
  sessions.set(token, { expiresAt, role, empleadoId });
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

// ─── PIN del colaborador: scrypt (stdlib), nunca en texto ───
// Formato guardado: scrypt:<salt b64url>:<hash b64url>. El PIN jamás se loguea.
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

export function pinMatchesHash(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [alg, saltB64, hashB64] = stored.split(':');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const got = crypto.scryptSync(pin, Buffer.from(saltB64, 'base64url'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

export type PinResult =
  | { valid: true; role: 'admin' | 'vendedora' }
  | { valid: true; role: 'colaborador'; empleadoId: string; nombre: string }
  | { valid: false; role: null };

export async function verifyPin(pin: string): Promise<PinResult> {
  const adminPin = process.env.ADMIN_PIN;
  const vendedoraPin = process.env.VENDEDORA_PIN;

  // Always check both PINs to prevent timing-based role detection
  const isAdmin = adminPin ? safeCompare(pin, adminPin) : false;
  const isVendedora = vendedoraPin ? safeCompare(pin, vendedoraPin) : false;

  if (isAdmin) return { valid: true, role: 'admin' };
  if (isVendedora) return { valid: true, role: 'vendedora' };

  // Colaboradores: PIN personal con hash en pt_empleados.
  // ponytail: se recorren los activos con PIN (hoy son 2); si fueran decenas, guardar un lookup por hash corto.
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('pt_empleados')
      .select('id, nombre, pin_hash')
      .eq('activo', true)
      .not('pin_hash', 'is', null);
    for (const e of data ?? []) {
      if (pinMatchesHash(pin, e.pin_hash)) return { valid: true, role: 'colaborador', empleadoId: e.id, nombre: e.nombre };
    }
  }
  return { valid: false, role: null };
}
