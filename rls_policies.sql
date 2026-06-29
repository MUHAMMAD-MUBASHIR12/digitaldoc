-- DigitalDoc — Supabase Grants + Row Level Security
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → Run
--
-- This script is idempotent: safe to re-run.
--
-- KEY DESIGN RULE:
--   FastAPI backend uses the service-role key → bypasses RLS, but still needs
--   table-level GRANTs.  These GRANTs are in Step 1.
--   Policies in Step 6 only constrain the browser anon-key client (supabaseApi.ts).


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1 — TABLE-LEVEL GRANTS
--   Must be run before ENABLE RLS; without these every role gets 42501.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role (FastAPI backend) — full access, bypasses RLS
GRANT ALL ON public.users               TO service_role;
GRANT ALL ON public.students            TO service_role;
GRANT ALL ON public.departments         TO service_role;
GRANT ALL ON public.document_requests   TO service_role;
GRANT ALL ON public.payments            TO service_role;
GRANT ALL ON public.generated_documents TO service_role;
GRANT ALL ON public.activity_logs       TO service_role;

-- authenticated (browser client with user JWT)
GRANT SELECT                    ON public.users               TO authenticated;
GRANT SELECT, UPDATE            ON public.students             TO authenticated;
GRANT SELECT                    ON public.departments          TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.document_requests    TO authenticated;
GRANT SELECT, INSERT            ON public.payments             TO authenticated;
GRANT SELECT                    ON public.generated_documents  TO authenticated;
GRANT SELECT, INSERT            ON public.activity_logs        TO authenticated;

-- anon (public verification — read only on two tables)
GRANT SELECT ON public.document_requests   TO anon;
GRANT SELECT ON public.generated_documents TO anon;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2 — ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs       ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3 — HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT lower(role) = 'admin' FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT lower(role) IN ('admin', 'registrar') FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4 — DROP ALL EXISTING POLICIES  (makes script re-runnable)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users read own profile"              ON public.users;
DROP POLICY IF EXISTS "Admins read all users"               ON public.users;
DROP POLICY IF EXISTS "Staff read all users"                ON public.users;

DROP POLICY IF EXISTS "Students read own student row"       ON public.students;
DROP POLICY IF EXISTS "Staff read all students"             ON public.students;
DROP POLICY IF EXISTS "Staff update students"               ON public.students;

DROP POLICY IF EXISTS "Public read departments"             ON public.departments;

DROP POLICY IF EXISTS "Public read generated requests"      ON public.document_requests;
DROP POLICY IF EXISTS "Students read own requests"          ON public.document_requests;
DROP POLICY IF EXISTS "Admins read all requests"            ON public.document_requests;
DROP POLICY IF EXISTS "Staff read all requests"             ON public.document_requests;
DROP POLICY IF EXISTS "Students insert own requests"        ON public.document_requests;
DROP POLICY IF EXISTS "Students update own requests"        ON public.document_requests;

DROP POLICY IF EXISTS "Students read own payments"          ON public.payments;
DROP POLICY IF EXISTS "Students insert own payments"        ON public.payments;
DROP POLICY IF EXISTS "Admins read all payments"            ON public.payments;
DROP POLICY IF EXISTS "Staff read all payments"             ON public.payments;

DROP POLICY IF EXISTS "Public read generated_documents"     ON public.generated_documents;

DROP POLICY IF EXISTS "Authenticated users insert logs"     ON public.activity_logs;
DROP POLICY IF EXISTS "Admins read logs"                    ON public.activity_logs;
DROP POLICY IF EXISTS "Staff read logs"                     ON public.activity_logs;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5 — STORAGE POLICIES  (payment-proofs bucket)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow authenticated users to upload payment proofs
DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
CREATE POLICY "Authenticated users can upload payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

-- Allow public read of payment proofs (admin reviewing them)
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
CREATE POLICY "Public read payment proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

-- Allow service_role to manage generated PDFs
DROP POLICY IF EXISTS "Service role manages generated-pdfs" ON storage.objects;
CREATE POLICY "Service role manages generated-pdfs"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'generated-pdfs');

-- Allow public read of generated PDFs (students downloading)
DROP POLICY IF EXISTS "Public read generated pdfs" ON storage.objects;
CREATE POLICY "Public read generated pdfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-pdfs');


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 6 — RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── users ──────────────────────────────────────────────────────────────────────
-- Every authenticated user reads their own profile (login / role lookup).
CREATE POLICY "Users read own profile"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admin and registrar can read all user profiles (name resolution in audit log).
CREATE POLICY "Staff read all users"
  ON public.users FOR SELECT TO authenticated
  USING (is_staff());


-- ── students ───────────────────────────────────────────────────────────────────
-- Student reads their own row (supabaseApi resolves students.id from user_id).
CREATE POLICY "Students read own student row"
  ON public.students FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Staff reads all student rows (admin approval needs full profile for PDF).
CREATE POLICY "Staff read all students"
  ON public.students FOR SELECT TO authenticated
  USING (is_staff());

-- Staff can update student records via the admin edit modal.
CREATE POLICY "Staff update students"
  ON public.students FOR UPDATE TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());


-- ── departments ────────────────────────────────────────────────────────────────
-- Public lookup — no auth required (used in PDF generation and verification).
CREATE POLICY "Public read departments"
  ON public.departments FOR SELECT
  USING (true);


-- ── document_requests ──────────────────────────────────────────────────────────
-- CRITICAL FIX: document_requests.student_id is students.id, NOT users.id.
-- All policies that restrict by student must join through the students table.

-- Unauthenticated (public) can read rows that are 'generated'.
-- Required by PublicVerification which runs without a login session.
CREATE POLICY "Public read generated requests"
  ON public.document_requests FOR SELECT
  USING (status = 'generated');

-- Authenticated students read only their own requests (correct FK chain).
CREATE POLICY "Students read own requests"
  ON public.document_requests FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- Admin and registrar read all requests (admin dashboard queue).
CREATE POLICY "Staff read all requests"
  ON public.document_requests FOR SELECT TO authenticated
  USING (is_staff());

-- Students create their own requests.
CREATE POLICY "Students insert own requests"
  ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- Students update their own requests (payment upload sets status + proof URL).
-- Approve/reject go through FastAPI service-role key — no policy needed for those.
CREATE POLICY "Students update own requests"
  ON public.document_requests FOR UPDATE TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );


-- ── payments ───────────────────────────────────────────────────────────────────
-- Students read payments linked to their own requests (via student FK chain).
CREATE POLICY "Students read own payments"
  ON public.payments FOR SELECT TO authenticated
  USING (
    request_id IN (
      SELECT dr.id
      FROM   public.document_requests dr
      JOIN   public.students s ON s.id = dr.student_id
      WHERE  s.user_id = auth.uid()
    )
  );

-- Students insert payments for their own requests.
CREATE POLICY "Students insert own payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    request_id IN (
      SELECT dr.id
      FROM   public.document_requests dr
      JOIN   public.students s ON s.id = dr.student_id
      WHERE  s.user_id = auth.uid()
    )
  );

-- Admin and registrar read all payments.
CREATE POLICY "Staff read all payments"
  ON public.payments FOR SELECT TO authenticated
  USING (is_staff());


-- ── generated_documents ────────────────────────────────────────────────────────
-- Full public read — no auth required.
-- Used by:
--   (a) StudentDashboard  → supabaseApi.getPdfUrl() for download
--   (b) PublicVerification → api.verifyDocument() hits FastAPI (service_role)
-- Writes only come from FastAPI (service-role key) → no INSERT policy needed.
CREATE POLICY "Public read generated_documents"
  ON public.generated_documents FOR SELECT
  USING (true);


-- ── activity_logs ──────────────────────────────────────────────────────────────
-- Any authenticated user can insert their own log entries.
-- CRITICAL: supabaseApi.ts writes logs directly from the browser for
-- createRequest and uploadPayment.  user_id = auth.uid() prevents forgery.
CREATE POLICY "Authenticated users insert logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admin and registrar can read the audit log.
CREATE POLICY "Staff read logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (is_staff());
