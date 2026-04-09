import { NextRequest, NextResponse } from 'next/server';
import { isValidSession, getSessionRole } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  storeChallenge,
  consumeChallenge,
} from '@/lib/webauthn';

function getRpId(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost';
  return host.split(':')[0]; // strip port
}

function getOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost';
  return `${proto}://${host}`;
}

// GET: Generate registration options (requires valid session)
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('x-admin-token');
    if (!isValidSession(token)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const role = getSessionRole(token);
    if (!role) {
      return NextResponse.json({ ok: false, error: 'Rol no encontrado' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'DB no configurada' }, { status: 500 });
    }

    // Fetch existing credential IDs to exclude
    const { data: existing } = await supabaseAdmin
      .from('pt_webauthn_credentials')
      .select('credential_id')
      .eq('role', role);

    const existingIds = (existing || []).map((c: { credential_id: string }) => c.credential_id);

    const rpId = getRpId(request);
    // Use a stable numeric ID based on role
    const userId = role === 'admin' ? 1 : 2;
    const userName = role === 'admin' ? 'Admin' : 'Vendedora';

    const options = generateRegistrationOptions(userId, userName, rpId, existingIds);

    // Store role alongside challenge data
    storeChallenge(options.challenge, { userId, userName, role });

    return NextResponse.json({ ok: true, options });
  } catch (err) {
    console.error('WebAuthn register GET error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

// POST: Verify registration and store credential
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-admin-token');
    if (!isValidSession(token)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const role = getSessionRole(token);
    if (!role) {
      return NextResponse.json({ ok: false, error: 'Rol no encontrado' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'DB no configurada' }, { status: 500 });
    }

    const { credential, challenge, deviceName } = await request.json() as {
      credential: {
        id: string;
        rawId: string;
        type: string;
        response: {
          attestationObject: string;
          clientDataJSON: string;
        };
      };
      challenge: string;
      deviceName?: string;
    };

    // Verify challenge was issued by us and get stored data
    const challengeData = consumeChallenge(challenge);
    if (!challengeData) {
      return NextResponse.json({ ok: false, error: 'Challenge inválido o expirado' }, { status: 400 });
    }

    const rpId = getRpId(request);
    const origin = getOrigin(request);

    const verified = await verifyRegistrationResponse(
      credential,
      challenge,
      rpId,
      origin
    );

    // Store credential in DB
    const { error: dbError } = await supabaseAdmin
      .from('pt_webauthn_credentials')
      .insert({
        role,
        credential_id: verified.credentialId,
        public_key: verified.publicKey,
        counter: verified.counter,
        device_name: deviceName || null,
      });

    if (dbError) {
      console.error('WebAuthn credential insert error:', dbError);
      if (dbError.code === '23505') {
        return NextResponse.json({ ok: false, error: 'Este dispositivo ya está registrado' }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: 'Error guardando credencial' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, credentialId: verified.credentialId });
  } catch (err) {
    console.error('WebAuthn register POST error:', err);
    return NextResponse.json({ ok: false, error: 'Error de verificación' }, { status: 500 });
  }
}
