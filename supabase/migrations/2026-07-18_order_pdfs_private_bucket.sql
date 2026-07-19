-- ============================================================================
-- Migration: Order PDFs → private bucket + drop anon INSERT on storage.objects
-- File:      2026-07-18_order_pdfs_private_bucket.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- The public checkout USED TO generate the order PDF (customer name, phone,
-- email, address = PII) in the BROWSER and upload it with the anon key to the
-- PUBLIC bucket `playtime-images` (upsert:true). Because the anon key ships in
-- the bundle, anyone could upload/overwrite arbitrary files there, and every
-- order PDF lived at a public URL. The code was moved server-side: POST
-- /api/orders now generates the PDF with the service-role client and uploads it
-- to a PRIVATE bucket `order-pdfs`, returning a signed URL.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ⚠️  APPLY ONLY AFTER THE CODE DEPLOY  ⚠️                                   │
-- │ Deploy the server-side-PDF build to Vercel FIRST. The code is tolerant:   │
-- │ if the `order-pdfs` bucket does not exist yet, PDF upload fails silently   │
-- │ (best-effort) and the order still succeeds WITHOUT a PDF link — it never   │
-- │ blocks checkout. Dropping the anon INSERT policy while the OLD build is    │
-- │ live would break the browser upload, but the order itself still succeeds.  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ============================================================================
-- GATE  —  run BEFORE the migration; record the output by hand
-- ============================================================================
--
-- 1) Current anon policies on storage.objects that touch playtime-images
--    (write them down before dropping):
--
--      SELECT policyname, roles, cmd, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'storage' AND tablename = 'objects'
--        AND 'anon' = ANY(roles)
--      ORDER BY policyname;
--
-- 2) Confirm the private bucket does not already exist as PUBLIC:
--
--      SELECT id, name, public FROM storage.buckets WHERE id = 'order-pdfs';
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

-- 1) Private bucket for order PDFs (service-role only; not public).
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-pdfs', 'order-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Drop every anon INSERT/ALL policy on storage.objects that references the
--    public `playtime-images` bucket. Dynamic so it matches whatever names the
--    Supabase dashboard generated. Service-role uploads bypass RLS, so no
--    replacement policy is needed for the server.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND 'anon' = ANY(roles)
      AND cmd IN ('INSERT', 'ALL')
      AND (COALESCE(with_check, '') || COALESCE(qual, '')) ILIKE '%playtime-images%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION  —  run AFTER the migration
-- ============================================================================
--
-- 1) No anon INSERT/ALL policy references playtime-images anymore (expect 0):
--
--      SELECT policyname, cmd, roles
--      FROM pg_policies
--      WHERE schemaname = 'storage' AND tablename = 'objects'
--        AND 'anon' = ANY(roles) AND cmd IN ('INSERT','ALL')
--        AND (COALESCE(with_check,'') || COALESCE(qual,'')) ILIKE '%playtime-images%';
--
-- 2) The private bucket exists and is NOT public:
--
--      SELECT id, public FROM storage.buckets WHERE id = 'order-pdfs';  -- public = false
--
-- ============================================================================
-- POST-CHECK  —  functional, in production, AFTER deploy + migration
-- ============================================================================
--
-- Place a real test order from /checkout. It must return an order number AND
-- the WhatsApp message should carry a signed order-pdfs link that opens the PDF.
-- If the PDF link is missing but the order succeeds, the bucket/policy is the
-- only thing to check — the order path itself is never blocked by PDF failures.
--
-- ROLLBACK: re-create the anon INSERT policy on storage.objects for
-- playtime-images (restores the old browser-upload path) — but prefer fixing
-- forward. The private bucket can stay; it is harmless if unused.
-- ============================================================================
