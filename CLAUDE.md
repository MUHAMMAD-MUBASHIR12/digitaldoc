# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Stack — important corrections

This is a **Vite + React 19 + TypeScript** SPA. It is **NOT Next.js**. There is no App Router, no `src/` directory, no `pages/` directory, no server components, and no `next/navigation`. Do not apply Next.js patterns.

- Tailwind CSS is loaded from **CDN** in `index.html` — it is not an npm package. Do not `npm install tailwindcss`.
- Font Awesome 6 is loaded from **CDN** in `index.html`. Use `<i className="fas fa-...">` directly.
- Inter font is loaded from Google Fonts CDN.

---

## Commands

```bash
# Frontend
npx kill-port 3000 3001 3002  # kill stale Vite processes (port increments if occupied)
npm run dev                    # Vite dev server — starts on 3000, falls back to 3001/3002
npm run build        # production build
npx tsc --noEmit     # TypeScript check (no test suite exists)

# Backend (Python / FastAPI)
pip install fastapi uvicorn supabase python-dotenv python-multipart "pydantic[email]" reportlab "qrcode[pil]"
python main.py   # or: uvicorn main:app --reload
# API at http://localhost:8000  •  Swagger at /docs
```

---

## Known environment issues (fix before running)

These were diagnosed as root causes of the backend not starting and API calls failing:

### CRITICAL — Backend won't start
1. ~~**Missing Python packages**~~ ✅ Fixed — `supabase`, `python-multipart`, `qrcode[pil]`, and all dependencies installed into `C:\Users\mubi\python.exe` (Python 3.13.0). Backend starts and serves at `http://localhost:8000/`.

2. ~~**CORS missing port 3002**~~ ✅ Fixed — `main.py` now uses `allow_origin_regex=r"http://localhost:\d+"` so any localhost port is allowed regardless of which port Vite lands on.

### HIGH — Features won't work end-to-end
3. ~~**Storage buckets not created**~~ ✅ Fixed — `payment-proofs` and `generated-pdfs` buckets exist and are set to Public in Supabase Storage.

4. ~~**RLS not applied**~~ ✅ Fixed — `rls_policies.sql` executed successfully in Supabase SQL Editor. RLS is live on all tables with correct policies. Critically: the `document_requests` SELECT policy uses the correct FK join (`student_id IN (SELECT id FROM students WHERE user_id = auth.uid())`) — NOT the broken `student_id = auth.uid()` pattern.

5. **`verification_token` column missing from `generated_documents` table** — strong verification (psid + 128-bit token match) will return no results until this column exists. Run once in Supabase → SQL Editor:
   ```sql
   ALTER TABLE public.generated_documents
     ADD COLUMN IF NOT EXISTS verification_token TEXT;

   CREATE INDEX IF NOT EXISTS idx_generated_documents_verification_token
     ON public.generated_documents (verification_token);
   ```

---

## File layout

All TypeScript source lives at the **project root** — there is no `src/` wrapper:

```
index.tsx              ← React entry point
App.tsx                ← root component, auth + view state; reads ?psid= on load
types.ts               ← all shared TS types and enums
components/
  AuthPortal.tsx       ← login form (Supabase signInWithPassword)
  StudentDashboard.tsx ← student request workflow + payment upload
  AdminDashboard.tsx   ← admin approve/reject + audit log
  PublicVerification.tsx ← public PSID lookup; accepts initialPsid prop for deep links
  Navbar.tsx           ← sticky nav with role-aware links
services/
  supabase.ts          ← createClient() with persistSession + autoRefreshToken
  supabaseApi.ts       ← direct Supabase SDK CRUD methods
  api.ts               ← FastAPI backend calls (ApiService class)

# Backend
main.py                         ← FastAPI app, CORS, RateLimitMiddleware, router mounts
core/supabase_client.py         ← service-role client (bypasses RLS)
core/security.py                ← get_current_user() + require_admin() (case-insensitive role check)
models/database.py              ← UserRole + RequestStatus enums only
routes/
  student_routes.py             ← POST /request, GET /my-requests
  admin_routes.py               ← GET /requests, POST /approve/{id}, POST /reject/{id}, GET /logs,
                                   GET /students, POST /create-student-auth, POST /create-student-profile,
                                   PUT /update-student/{user_id}
  verification_routes.py        ← GET /api/verify/verify/{psid}?token= (public, no auth); strong path (psid+token) or legacy path (psid-only)

# Infrastructure
rls_policies.sql  ← SQL to run ONCE in Supabase SQL editor to enable RLS (not yet applied)
```

Path alias `@` maps to the project root (configured in both `vite.config.ts` and `tsconfig.json`).

---

## Environment variables

**Frontend** (`.env.local`):
```
VITE_SUPABASE_URL=https://qqmgjifzgppxmdunecmf.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
Accessed in code as `import.meta.env.VITE_SUPABASE_URL`.

**Backend** (`.env`):
```
SUPABASE_URL=https://qqmgjifzgppxmdunecmf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Do not add any other `VITE_*` variables — they are bundled into client JS and publicly readable.

---

## Routing

There is **no routing library**. `App.tsx` holds `view: 'portal' | 'verify'` in `useState` and renders components conditionally. `setView` is threaded down via `Navbar`. Do not use `react-router-dom`, `window.location.href` navigation, or any router hooks.

`App.tsx` reads both `?psid=` and `?token=` from the URL query string on mount — if `psid` is present it initialises `view` as `'verify'` and passes both to `PublicVerification` as `initialPsid` / `initialToken`, which auto-fires the lookup. QR codes on approved PDFs contain both params (`/verify?psid={psid}&token={token}`).

---

## Auth architecture

1. `AuthPortal.tsx` calls `supabase.auth.signInWithPassword()` — email is trimmed + lowercased before the call.
2. After successful auth, both `AuthPortal.tsx` and `App.tsx` query `users` for `role, roll_number, full_name`.
3. Role is normalized with `.toLowerCase()` before comparing — DB stores lowercase (`'student'`, `'admin'`).
4. `App.tsx` subscribes to `supabase.auth.onAuthStateChange` and calls `buildUserProfile()` on session restore. A 5 s safety-net timer (`LOADING_TIMEOUT_MS`) signs the user out and clears the spinner if `buildUserProfile` hangs — prevents permanent spinner on network failure.
5. Every FastAPI call fetches the live session token via `supabase.auth.getSession()` — never cached.
6. On a 401 from FastAPI, `api.ts` calls `supabase.auth.signOut()` then `window.location.reload()`.

---

## Dual data-layer pattern

| Layer | File | Used for |
|---|---|---|
| Direct Supabase SDK | `services/supabaseApi.ts` | `getRequests`, `getLogs`, `createRequest`, `uploadPayment`, `verifyPsid`, `getPdfUrl`, `getStudentPublicInfo`, `getStudents`, `updateStudent`, `rejectRequest` (unused — kept as fallback) |
| FastAPI proxy | `services/api.ts` (`ApiService` class, exported as `api`) | Business logic only: `approveRequest`, `rejectRequest`, `createStudentAuth`, `createStudentProfile` |

`supabaseApi.rejectRequest()` exists but is **not called** from `AdminDashboard` — rejection goes through `api.rejectRequest()` (FastAPI). Do not wire `supabaseApi.rejectRequest()` back in; it bypasses server-side logging.

`supabaseApi.updateStudent()` is called directly (not via FastAPI) because no server-side logic is needed for profile field edits. `api.createStudentAuth()` goes via FastAPI because it uses the Supabase service-role admin SDK to create auth users.

---

## Key types (`types.ts`)

```ts
enum UserRole     { STUDENT = 'Student', ADMIN = 'Admin' }
enum DocumentType { TRANSCRIPT = 'Transcript', MARKSHEET = 'Marksheet', CERTIFICATE = 'Certificate' }
enum RequestStatus { PENDING_PAYMENT = 'Pending Payment', UNDER_REVIEW = 'Under Review',
                    APPROVED = 'Approved', REJECTED = 'Rejected', GENERATED = 'Generated' }

interface User { id, name, email, role: UserRole, registrationNumber? }
interface DocumentRequest { id, studentId, studentName, docType, semesters[], psid, amount,
                            status, createdAt, paymentProofUrl?, adminNote?, verificationPayload? }
interface ActivityLog { id, timestamp, user, action, details }
interface StudentRecord {
  id, fullName, email, rollNumber, department?,
  degreeTitle?, program?, batchYear?, programDuration?,
  semestersCompleted?, cgpa?, totalCredits?, conduct?,
  cnic?, dob?, admissionDate?, isActive?
}
```

**Critical:** `StudentRecord` maps directly to `users` table rows. There is **no separate `students` table**. `department` is a plain text column — there is **no `departments` table** and no FK. Do not introduce `departmentId` or `departmentName`.

---

## Supabase tables

### `users` — full verified schema

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `email` | text | NO | — |
| `full_name` | text | **NO** | — |
| `roll_number` | text | YES | — |
| `cnic` | text | YES | — |
| `dob` | date | YES | — |
| `admission_date` | date | YES | — |
| `degree_title` | text | YES | — |
| `department` | text | YES | — |
| `program` | text | YES | — |
| `batch_year` | integer | YES | — |
| `semesters_completed` | integer | YES | `0` |
| `cgpa` | numeric | YES | `0` |
| `total_credits` | integer | YES | `0` |
| `photo_url` | text | YES | — |
| `conduct` | text | YES | `'Good'` |
| `program_duration` | integer | YES | `4` |
| `role` | text | NO | `'student'` |
| `is_active` | boolean | YES | `true` |
| `created_at` | timestamptz | YES | `now()` |

**Critical constraints:**
- `full_name` is NOT NULL — always include it in INSERT statements.
- `role` CHECK constraint: only `'student'`, `'admin'`, `'registrar'` are valid (all **lowercase**).
- DB column is `roll_number` — not `roll_no`. Using `roll_no` silently returns null.
- `department` is a plain **TEXT** column — there is no separate `departments` table and no `department_id` FK. Do not introduce `department_id` anywhere.
- There is no separate `students` table — all student data (academic profile + auth identity) lives in `users`.

### Other tables

| Table | Notable columns |
|---|---|
| `document_requests` | id, psid, student_id, doc_type (lowercase enum), requested_semesters (JSON array), amount, status (snake_case), created_at, admin_note, verification_payload |
| `payments` | request_id, psid, amount, transaction_ref, payment_proof_url, status (`submitted`), submitted_at |
| `generated_documents` | psid, sha256_hash, pdf_url, verification_token (TEXT — 128-bit hex) |
| `activity_logs` | id, action, user_id, details, created_at |

**Critical schema notes:**
- `document_requests.doc_type` is a **lowercase** PostgreSQL enum: `marksheet`, `transcript`, `certificate`. Always `.toLowerCase()` before INSERT — sending title-case (`Marksheet`) causes a constraint violation.
- `document_requests.requested_semesters` is the actual DB column name (mapped to `semesters` in TS `DocumentRequest`).
- `document_requests` does **NOT** have a `payment_proof_url` column — that lives in the `payments` table.
- `payments.transaction_ref` — bank transfer reference number entered by student at upload time.
- `verification_payload` format: `SECURE-V2-{psid}-{initials}-{4hex}-{4hex}` — human-readable display string only, stored in `document_requests`. Not used for cryptographic verification.
- `generated_documents.verification_token` — `secrets.token_hex(16)` (128 bits), embedded in the QR URL as `?token=`. Never displayed to users. Used by the strong verification path for exact psid+token match.

---

## Demo credentials

```sql
INSERT INTO public.users (id, email, full_name, role)
VALUES
  (
    (SELECT id FROM auth.users WHERE email = 'student@demo.com'),
    'student@demo.com', 'Demo Student', 'student'
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'admin@demo.com'),
    'admin@demo.com', 'Demo Admin', 'admin'
  )
ON CONFLICT (id) DO NOTHING;
```

| Email | Password | Role |
|---|---|---|
| `student@demo.com` | `password` | `student` |
| `admin@demo.com` | `password` | `admin` |

---

## What is real vs. dummy / broken

### Real and working
- Supabase Auth login, session restore, role-based view switching
- Student: create request (multi-step modal with scroll-to-consent), view own requests, status badges, loading state on fetch
- Student: payment proof upload — dedicated modal with Transaction Reference Number text input + file picker → Supabase Storage `payment-proofs` bucket → `payments` row inserted with `transaction_ref`; `document_requests` status updated to `under_review`; upload errors surfaced inline in modal; activity log entry written on success
- Student: create-request errors surfaced inside the modal with real Supabase error message; no silent failures
- Student: status badge colors — `pending_payment`=amber, `under_review`=blue, `approved`=green, `rejected`=rose, `generated`=emerald
- Student: "Download Secure PDF" — async with spinner, fetches real `pdf_url` from `documents` table; resets on modal close
- Admin: view all requests with filter and loading state, approve (generates PDF + payload + documents row), reject with inline modal
- Admin: "Verify & Post" (approve) — real error surfaced in inline red banner below request list; shows exact server error message (not a hardcoded alert)
- Admin: rejection modal shows actual server error inline instead of swallowing it
- Admin: request list shows loading spinner on mount and after actions
- Admin: activity log shows `full_name` instead of raw UUID — `getLogs()` does a batch name lookup against `users`
- Admin: **Student Management tab** — lists all students from `users WHERE role='student'`; Add New Student modal (creates Supabase Auth user via service-role API then patches academic fields onto the `users` row); Edit modal (updates `users` row directly via Supabase SDK); department is a free-text field, not a FK
- Approve flow: ReportLab A4 PDF generated server-side, uploaded to `generated-pdfs` bucket, real SHA-256 hash stored
- QR code embedded in the ReportLab PDF (via `qrcode[pil]`) — sits side-by-side with the verification table, points to `{frontend_origin}/verify?psid={psid}`; `base_url` passed from `window.location.origin` at approve time
- Verification payload uses `secrets.token_hex` (CSPRNG)
- Real QR code in document preview modal via `react-qr-code` pointing to `{origin}/verify?psid={psid}`
- Admin ledger summary shows live counts: total, pending, approved, rejected
- Activity log reads in admin sidebar; logged events: request created, payment uploaded, approved, rejected
- Public PSID lookup with full result UI: loading spinner, valid (emerald) / invalid (rose) states, animated entry, info grid showing student name, doc type, degree, CGPA, issue date, semesters, verification payload
- Deep-link QR scan support — `App.tsx` reads `?psid=` and `?token=` query params on mount, switches to verify view, passes both to `PublicVerification` which auto-fires the lookup
- Strong verification: when `?token=` is present, backend matches psid+token against `documents.verification_token`; frontend shows green "Cryptographically Verified" badge (`result.token_verified === true`)
- Legacy verification: when no `?token=` in URL (old QR codes), backend does psid-only lookup; frontend shows yellow "Legacy Mode" badge and amber warning banner (`result.legacy === true`)
- Token bypass attack prevention: if token is supplied but doesn't match, endpoint returns `verified=false` — does NOT fall back to legacy path
- JWT validation on every FastAPI route; admin-role guard (case-insensitive)
- Rate limiting middleware on all FastAPI routes (`RateLimitMiddleware` in `main.py`)
- CORS allows any `http://localhost:<port>` via `allow_origin_regex` — Vite port drift (3000→3001→3002…) no longer breaks API calls
- FastAPI backend running at `http://localhost:8000` — all Python deps installed in `C:\Users\mubi\python.exe`
- No `console.log` or `console.error` statements in production build
- RLS policy SQL executed in Supabase ✅

### Supabase Storage buckets required
Both must exist and be set to **Public** before the app works end-to-end:
- `payment-proofs` ✅ exists
- `generated-pdfs` ✅ exists

### Broken / dummy — exact locations

All previously tracked items are resolved. No known dummy or broken features remain.

| # | Feature | File | Status |
|---|---|---|---|
| 1 | Payment proof upload | `StudentDashboard.tsx` | ✅ Dedicated modal: txRef input + file picker + Storage upload |
| 2 | Payment URL on backend | `student_routes.py` | ✅ Dead endpoint deleted |
| 3 | "Download Secure PDF" | `StudentDashboard.tsx` | ✅ Fetches real `generated_documents.pdf_url` |
| 4 | Document preview QR code | `StudentDashboard.tsx` | ✅ `react-qr-code` SVG pointing to verify URL |
| 5 | Rejection input | `AdminDashboard.tsx` | ✅ Inline modal with textarea |
| 6 | Ledger health stats | `AdminDashboard.tsx` | ✅ Live counts from request state |
| 7 | Verification payload entropy | `admin_routes.py` | ✅ Display payload uses `secrets.token_hex(2).upper()`; QR token uses `secrets.token_hex(16)` (128 bits) |
| 8 | SHA-256 hash | `admin_routes.py` | ✅ Real `hashlib.sha256(pdf_bytes).hexdigest()` |
| 9 | Audit log user column | `supabaseApi.ts` | ✅ Batch lookup resolves UUID → `full_name` |
| 10 | Approve error handling | `AdminDashboard.tsx` | ✅ Real error in inline red banner |
| 11 | Reject error handling | `AdminDashboard.tsx` | ✅ Real error message shown |
| 12 | QR in PDF | `admin_routes.py` | ✅ `qrcode[pil]` embedded side-by-side with verify table |
| 13 | Deep-link `?psid=` | `App.tsx` / `PublicVerification.tsx` | ✅ Auto-triggers lookup on load |
| 14 | Payment upload activity log | `supabaseApi.ts` | ✅ Writes log entry on successful upload |
| 15 | `console.error` in App.tsx | `App.tsx` | ✅ Removed |
| 16 | `doc_type` enum case mismatch | `supabaseApi.ts` | ✅ `docType.toLowerCase()` on INSERT |
| 17 | `createRequest` swallowed errors | `supabaseApi.ts` | ✅ Now throws with real Supabase error message |
| 18 | Payment insert missing `transaction_ref` | `supabaseApi.ts` | ✅ `transaction_ref` added to `payments` INSERT |
| 19 | RLS policy wrong FK | `rls_policies.sql` | ✅ Fixed to `student_id IN (SELECT id FROM students WHERE user_id = auth.uid())` |

---

## Payment architecture

**Manual bank transfer is the final design — not a placeholder.**

JazzCash and EasyPaisa require a university-registered merchant account. 1BILL (used by HEC) requires university IT to register with 1LINK (weeks). NUST, FAST, and most Pakistani universities use this model.

Flow:
1. Student pays via bank transfer offline
2. Student uploads screenshot → Supabase Storage `payment-proofs` bucket
3. Admin reviews screenshot and approves or rejects
4. Everything after approval (PDF, QR, verification payload) is automated

Do not suggest automated payment gateways unless explicitly asked.

---

## Implementation roadmap

### Phase 1 — Security ✅ Complete
- RLS policies SQL written (`rls_policies.sql`) — **still needs to be run in Supabase SQL editor**
- `VITE_GEMINI_API_KEY` removed from `vite.config.ts`
- Demo credential buttons removed from `AuthPortal.tsx`
- `mockApi.ts` deleted
- Dead `auth_routes.py` deleted
- `RateLimitMiddleware` added to `main.py`
- `require_admin()` made case-insensitive

### Phase 2 — Backend security fixes ✅ Complete
- `admin_routes.py` — `random.choices()` replaced with `secrets.token_hex(2).upper()` (CSPRNG)
- `admin_routes.py` — fake `f"sha256-..."` replaced with real `hashlib.sha256(pdf_bytes).hexdigest()`

### Phase 3 — Real payment proof upload ✅ Complete
- `supabaseApi.ts` — `uploadPayment(requestId, file, userId, transactionRef)` uploads to `payment-proofs` bucket, inserts `payments` row with `transaction_ref`, updates `document_requests.status` to `under_review`, writes activity log
- `supabaseApi.ts` — `getPdfUrl(psid)` fetches `pdf_url` from `generated_documents` table
- `StudentDashboard.tsx` — "Download Secure PDF" fetches real URL via `getPdfUrl` and triggers `<a>` download; disabled if no `verificationPayload`
- `student_routes.py` `/upload-payment/{id}` dead endpoint deleted

### Phase 4 — Admin UX fix ✅ Complete
- `AdminDashboard.tsx` — `window.prompt()` replaced with inline modal (`rejectModalId` / `rejectReason` / `isRejecting` state); textarea auto-focuses, submit disabled until non-empty, calls `api.rejectRequest` on confirm

### Phase 5 — PDF generation ✅ Complete
- `admin_routes.py` — ReportLab A4 PDF with IST-format layout (see Phase 12 for full rewrite)
- PDF uploaded to `generated-pdfs` Supabase Storage bucket; public URL stored in `documents.pdf_url`
- Real SHA-256 hash of PDF bytes stored in `documents.hash`

### Phase 6 — QR code ✅ Complete
- `react-qr-code` installed; `StudentDashboard.tsx` preview modal renders real SVG QR via `<QRCode value={origin/verify?psid=...} size={112} />`
- `qrcode[pil]` installed; `admin_routes.py` embeds QR image in ReportLab PDF via `_make_qr()` helper — QR sits side-by-side with the cryptographic verification table
- `api.ts` `approveRequest` passes `window.location.origin` as `base_url` query param so the PDF QR points to the correct domain
- `App.tsx` reads `?psid=` query string on mount; switches to verify view and passes PSID to `PublicVerification` as `initialPsid`, which auto-fires the lookup — scanning the QR from an approved PDF lands directly on the verified result

### Phase 7 — Cleanup ✅ Complete
- `AdminDashboard.tsx` — hardcoded ledger stats replaced with live counts
- `student_routes.py` — dead `/upload-payment/{id}` endpoint deleted
- `console.log` / `console.error` — removed from all production files
- Loading states — added to StudentDashboard and AdminDashboard initial fetch
- Error states — surfaced for create-request, payment upload, PDF download, rejection, approve
- Null safety — `registrationNumber` fallback changed from hardcoded demo value to `'—'`; `createdAt` date calls guarded
- `supabaseApi.ts` `getLogs()` — resolves `user_id` UUIDs to `full_name` via a batch `users` lookup; admins see real names in the audit log
- Activity log — written on request create, payment upload, approve, and reject

### Phase 8 — Environment & connectivity ✅ Complete
- Python `supabase` + `python-multipart` + `qrcode[pil]` installed into `C:\Users\mubi\python.exe`
- CORS fixed: `allow_origin_regex=r"http://localhost:\d+"` replaces hardcoded port list
- Backend verified running: `http://localhost:8000/` returns `{"status":"Operational"}`
- `AdminDashboard.tsx` approve/reject catch blocks fixed: real error message shown, not hardcoded strings

### Phase 9 — Verification token security ✅ Complete (pending Supabase SQL)
- `admin_routes.py` — generates `verification_token = secrets.token_hex(16)` (128-bit CSPRNG) on approve; embeds it in QR URL as `{base_url}/verify?psid={psid}&token={verification_token}`; stores token in `generated_documents.verification_token`
- `routes/verification_routes.py` — full rewrite: optional `token` query param; strong path (psid + token exact match against `generated_documents` table); legacy path (psid-only against `document_requests`); returns `token_verified` and `legacy` booleans; token supplied but no match → `verified=false`, no legacy fallback; `_get_student_info()` returns `cgpa`, `degree_title`, `roll_number` from `students` table
- `types.ts` — added `VerifyResponse` interface with `verified`, `token_verified`, `legacy`, `psid`, `student_name`, `student_id`, `doc_type`, `semesters`, `issued_at`, `verification_payload`, `cgpa`, `degree_title`, `roll_number`
- `services/api.ts` — added public `verifyDocument(psid, token?)` method (no auth headers required)
- `App.tsx` — reads both `?psid=` and `?token=` from URL on mount; passes `initialToken` to `PublicVerification`
- `components/PublicVerification.tsx` — uses `api.verifyDocument` (no secondary Supabase call for student info — all fields come from the API response); green "Cryptographically Verified" badge when `token_verified=true`; yellow "Legacy Mode" badge + amber warning banner when `legacy=true`; manual form submit only passes token if typed PSID matches URL PSID
- **Pending**: run `ALTER TABLE public.generated_documents ADD COLUMN IF NOT EXISTS verification_token TEXT;` in Supabase SQL Editor (see Known environment issues #5)

### Phase 10 — Submission fix + payment modal ✅ Complete
- `supabaseApi.ts` `createRequest` — fixed `doc_type` sent as `docType.toLowerCase()` (was title-case, breaking PostgreSQL enum); function now **throws** with real Supabase error message instead of returning `null`
- `supabaseApi.ts` `uploadPayment` — added `transactionRef: string` parameter; `payments` INSERT now includes `transaction_ref`; removed incorrect `payment_proof_url` UPDATE on `document_requests` (that column doesn't exist there)
- `StudentDashboard.tsx` `handleCreateRequest` — wrapped in `try/catch`; real error shown in rose banner above submit button
- `StudentDashboard.tsx` payment flow — replaced hidden file input + `pendingUploadId` ref with dedicated payment modal: amount-due banner, Transaction Reference Number text input, styled file picker area, inline error display, Cancel/Submit buttons
- `StudentDashboard.tsx` status badges — all 5 statuses now have distinct colors: `pending_payment`=amber, `under_review`=blue, `approved`=green, `rejected`=rose, `generated`=emerald

### Phase 12 — IST PDF format rewrite ✅ Complete
- `admin_routes.py` — `_build_pdf()` fully rewritten to match official IST (Institute of Space Technology) transcript format
- University constants: `UNI_NAME`, `UNI_ADDRESS`, `UNI_TEL`, `UNI_EMAIL` defined at top of file
- `_ist_header()` — IST logo placeholder (blue square with "IST") + university name/address/tel/email + rule
- `_student_info_section()` — two-column block: Name/Degree/DOB left, Registration No/Admission Date/CNIC right
- Four separate document builders dispatched by `doc_type`:
  - `_build_transcript()` — "STUDENT ISSUED TRANSCRIPT"; FALL/SPRING semesters paired side-by-side (55%/45%); SGPA+cumulative CGPA row after each pair; footer with CREDITS EARNED (theory-lab breakdown), CGPA, Degree Conferred/Not Conferred, END OF TRANSCRIPT; Controller of Examinations signature
  - `_build_marksheet()` — "SEMESTER RESULT SHEET"; shows only `requested_semesters`; full-width course table per semester; SGPA + PASS/FAIL result
  - `_build_bonafide()` — "BONAFIDE CERTIFICATE"; formal enrollment paragraph; Registrar signature
  - `_build_character()` — "CHARACTER CERTIFICATE"; conduct paragraph; Registrar signature
- Grade points mapping: A+=4.00, A=4.00, A-=3.67 … D=1.00, F=0.00, W=0.00
- SGPA computed as `sum(grade_points × credit_hours) / sum(credit_hours)` per semester; cumulative CGPA tracked across all semesters
- Credits format: "3-0" (theory) or "0-1" (lab — credit_hours=1 and name contains 'Lab')
- Semester labels derived from `batch_year` + `semester_number`: odd=FALL, even=SPRING
- `approve_request` now fetches `student_semester_records` joined with `courses(code, name, credit_hours, semester_number)` and passes as `grades` to `_build_pdf()`
- `_verification_section()` unchanged — PSID / URL / date / payload + QR code at end of every document type
- All route handlers (list_all_requests, approve_request, reject_request, get_logs, list_students, create_student_auth, create_student_profile, update_student) unchanged

**Required Supabase tables for transcript/marksheet:**
```sql
-- student_semester_records
-- Columns: id, student_id (FK→students.id), course_id (FK→courses.id), grade (text), semester_number (int)

-- courses
-- Columns: id, code (text), name (text), credit_hours (int), semester_number (int)
```
These tables must exist for transcript/marksheet grades to populate. If absent, the course tables render empty but the PDF still generates successfully.

### Phase 11 — Student Management tab + TypeScript cleanup ✅ Complete
- `AdminDashboard.tsx` — two-tab layout (Ledger / Students); Students tab shows all students from `users WHERE role='student'` in a sortable table; "Add New Student" modal: creates Supabase Auth user via `POST /admin/create-student-auth` (service-role), then patches academic fields via `POST /admin/create-student-profile`; "Edit" modal: updates `users` row directly via `supabaseApi.updateStudent()` (no FastAPI needed); inline validation, success flash, and error banners on both modals
- `admin_routes.py` — 4 new endpoints: `GET /students` (queries `users WHERE role='student'`), `POST /create-student-auth` (service-role `supabase.auth.admin.create_user` + upsert `users` row), `POST /create-student-profile` (UPDATE on existing `users` row), `PUT /update-student/{user_id}` (UPDATE on `users`)
- `services/api.ts` — `createStudentAuth(email, password, fullName)`, `createStudentProfile(data)` added to `ApiService`
- `services/supabaseApi.ts` — `getStudents()` queries `users` table; `updateStudent(userId, data)` updates `users` table; `department` is plain text (not a FK)
- `types.ts` — `StudentRecord` interface added; no `userId`/`departmentId`/`departmentName` fields — maps 1-to-1 with `users` table columns
- `App.tsx` — 5 s loading timeout safety net: if `buildUserProfile` hangs, signs out + clears spinner
- TypeScript fixes — `AuthPortal.tsx` and `App.tsx` untyped Supabase `profile` casts; `supabaseApi.ts` insert/update args cast to `as any` to silence untyped client `never` errors; `npx tsc --noEmit` now passes with zero errors
