-- WebAuthn / Passkey credentials for admin login
CREATE TABLE IF NOT EXISTS pt_webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  credential_id text UNIQUE NOT NULL,
  public_key text NOT NULL,
  counter int DEFAULT 0,
  device_name text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE pt_webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (server-side only)
CREATE POLICY "Service role full access"
  ON pt_webauthn_credentials
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
