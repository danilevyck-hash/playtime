import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  consumeChallenge,
} from '@/lib/webauthn';

function getRpId(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost';
  return host.split(':')[0];
}

function getOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost';
  return `${proto}://${host}`;
}

// GET: Generate authentication options
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'DB no configurada' }, { status: 500 });
    }

    // Fetch all credential IDs
    const { data: credentials, error: dbError } = await supabaseAdmin
      .from('pt_webauthn_credentials')
      .select('credential_id');

    if (dbError) {
      console.error('WebAuthn auth GET error:', dbError);
      return NextResponse.json({ ok: false, error: 'Error de BD' }, { status: 500 });
    }

    if (!credentials || credentials.length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay passkeys registradas' }, { status: 404 });
    }

    const rpId = getRpId(request);
    const credentialIds = credentials.map((c: { credential_id: string }) => c.credential_id);
    const options = generateAuthenticationOptions(credentialIds, rpId);

    return NextResponse.json({ ok: true, options });
  } catch (err) {
    console.error('WebAuthn auth GET error:', err);
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 });
  }
}

// POST: Verify authentication
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'DB no configurada' }, { status: 500 });
    }

    const { credential, challenge } = await request.json() as {
      credential: {
        id: string;
        rawId: string;
        type: string;
        response: {
          clientDataJSON: string;
          authenticatorData: string;
          signature: string;
        };
      };
      challenge: string;
    };

    // Verify challenge was issued by us
    const challengeData = consumeChallenge(challenge);
    if (!challengeData) {
      return NextResponse.json({ ok: false, error: 'Challenge inválido o expirado' }, { status: 400 });
    }

    // Look up stored credential
    const { data: storedCred, error: dbError } = await supabaseAdmin
      .from('pt_webauthn_credentials')
      .select('*')
      .eq('credential_id', credential.id)
      .single();

    if (dbError || !storedCred) {
      return NextResponse.json({ ok: false, error: 'Credencial no encontrada' }, { status: 401 });
    }

    const rpId = getRpId(request);
    const origin = getOrigin(request);

    const verified = await verifyAuthenticationResponse(
      credential,
      {
        publicKey: storedCred.public_key,
        counter: storedCred.counter,
      },
      challenge,
      rpId,
      origin
    );

    // Update counter
    await supabaseAdmin
      .from('pt_webauthn_credentials')
      .update({ counter: verified.newCounter })
      .eq('credential_id', credential.id);

    // Create session (same as PIN login)
    const role = storedCred.role as 'admin' | 'vendedora';
    const token = createSession(role);

    return NextResponse.json({ ok: true, token, role });
  } catch (err) {
    console.error('WebAuthn auth POST error:', err);
    return NextResponse.json({ ok: false, error: 'Error de autenticación' }, { status: 500 });
  }
}
