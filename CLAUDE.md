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
pip install -r requirements.txt   # preferred — installs all dependencies from requirements.txt
python main.py   # or: uvicorn main:app --reload
# API at http://localhost:8000  •  Swagger at /docs
```

---

## Deployment

- **Frontend**: Deployed to Vercel at `https://digitaldoc-phi.vercel.app`
- **GitHub repo**: `https://github.com/MUHAMMAD-MUBASHIR12/digitaldoc` (branch: `main`)
- **Backend**: FastAPI — must be deployed separately (Railway, Render, etc.) and set `VITE_API_URL` in Vercel env vars to point at the production API base URL.

---

## Known environment issues

### All resolved

1. ~~**Missing Python packages**~~ ✅ Fixed — all dependencies in `requirements.txt`; installed into `C:\Users\mubi\python.exe` (Python 3.13.0). Backend starts and serves at `http://localhost:8000/`.

2. ~~**CORS missing port 3002**~~ ✅ Fixed — `main.py` uses `allow_origin_regex=r"http://localhost:\d+"` so any localhost port is allowed, plus explicit `allow_origins` for the Vercel production URL.

3. ~~**Storage buckets not created**~~ ✅ Fixed — `payment-proofs` and `generated-pdfs` buckets exist and are set to Public in Supabase Storage.

4. ~~**RLS not applied**~~ ✅ Fixed — `rls_policies.sql` executed in Supabase SQL Editor. RLS is live on all tables.

5. ~~**`verification_token` column missing from `generated_documents` table**~~ ✅ Fixed — column and index added via SQL Editor. Strong QR verification (psid + 128-bit token match) is live.

---

## File layout

All TypeScript source lives at the **project root** — there is no `src/` wrapper:

```
index.tsx              ← React entry point
App.tsx                ← root component, auth + view state; reads ?psid= and ?token= on load
types.ts               ← all shared TS types and enums
components/
  AuthPortal.tsx       ← login form (Supabase signInWithPassword)
  StudentDashboard.tsx ← student request workflow + payment upload
  AdminDashboard.tsx   ← admin approve/reject + audit log + student management
  PublicVerification.tsx ← public PSID lookup; accepts initialPsid/initialToken props
  Navbar.tsx           ← sticky nav with role-aware links
  BackendCodeViewer.tsx  ← stub (removed component, exports null)
services/
  supabase.ts          ← createClient() with persistSession + autoRefreshToken
  supabaseApi.ts       ← direct Supabase SDK CRUD methods
  api.ts               ← FastAPI backend calls (ApiService class)

# Backend
main.py                         ← FastAPI app, CORS, RateLimitMiddleware, router mounts
requirements.txt                ← Python dependencies (pip install -r requirements.txt)
core/supabase_client.py         ← service-role client (bypasses RLS)
core/security.py                ← get_current_user() + require_admin() (case-insensitive role check)
models/database.py              ← UserRole + RequestStatus enums only
routes/
  student_routes.py             ← POST /request, GET /my-requests
  admin_routes.py               ← GET /requests, POST /approve/{id}, POST /reject/{id}, GET /logs,
                                   GET /students, POST /create-student-auth, POST /create-student-profile,
                                   PUT /update-student/{student_id}
  verification_routes.py        ← GET /api/verify/verify/{psid}?token= (public, no auth)

# Infrastructure
rls_policies.sql  ← RLS SQL — already executed in Supabase SQL Editor ✅
```

Path alias `@` maps to the project root (configured in both `vite.config.ts` and `tsconfig.json`).

---

## Environment variables

**Frontend** (`.env.local` for local dev; Vercel dashboard for production):
```
VITE_SUPABASE_URL=https://qqmgjifzgppxmdunecmf.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=https://your-backend.railway.app/api   # optional; falls back to http://localhost:8000/api
```
Accessed in code as `import.meta.env.VITE_SUPABASE_URL` etc. `VITE_API_URL` is the only optional variable — omit it locally and the backend defaults to `http://localhost:8000/api`.

**Backend** (`.env`):
```
SUPABASE_URL=https://qqmgjifzgppxmdunecmf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

All `VITE_*` variables are bundled into client JS and publicly readable — do not put secrets in them.

---

## Routing

There is **no routing library**. `App.tsx` holds `view: 'portal' | 'verify'` in `useState` and renders components conditionally. `setView` is threaded down via `Navbar`. Do not use `react-router-dom`, `window.location.href` navigation, or any router hooks.

`App.tsx` reads both `?psid=` and `?token=` from the URL query string on mount — if `psid` is present it initialises `view` as `'verify'` and passes both to `PublicVerification` as `initialPsid` / `initialToken`, which auto-fires the lookup. QR codes on approved PDFs contain both params (`/verify?psid={psid}&token={token}`).

---

## Auth architecture

1. `AuthPortal.tsx` calls `supabase.auth.signInWithPassword()` — email is trimmed + lowercased before the call.
2. After successful auth, `App.tsx` queries `users` for `role, full_name`.
3. Role is normalized with `.toLowerCase()` before comparing — DB stores lowercase (`'student'`, `'admin'`).
4. `App.tsx` uses `onAuthStateChange` as the **primary auth driver** (handles `SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, `INITIAL_SESSION` events) plus an eager `supabase.auth.getSession()` check on mount so loading resolves immediately when a session exists in localStorage. No timers, no forced signOut, no `LOADING_TIMEOUT_MS`.
5. Every FastAPI call fetches the live session token via `supabase.auth.getSession()` — never cached. If the session has expired, `authHeaders()` attempts a refresh before throwing.
6. On a 401 from FastAPI, `api.ts` calls `supabase.auth.signOut()` then `window.location.reload()`.

---

## Dual data-layer pattern

| Layer | File | Used for |
|---|---|---|
| Direct Supabase SDK | `services/supabaseApi.ts` | `getRequests`, `getLogs`, `createRequest`, `uploadPayment`, `verifyPsid`, `getPdfUrl`, `getStudentPublicInfo`, `getStudents`, `updateStudent`, `rejectRequest` (fallback only) |
| FastAPI proxy | `services/api.ts` (`ApiService` class, exported as `api`) | Business logic: `approveRequest`, `rejectRequest`, `createStudentAuth`, `createStudentProfile` |

`supabaseApi.rejectRequest()` exists but is **not called** from `AdminDashboard` — rejection goes through `api.rejectRequest()` (FastAPI) for server-side logging. Do not wire it back in.

`supabaseApi.updateStudent(studentId, data)` updates the **`students` table** directly (no FastAPI needed — no server-side logic required for field edits). The `studentId` parameter is `students.id`, not `users.id`.

`api.createStudentAuth()` goes via FastAPI because it uses the Supabase service-role admin SDK to create auth users.

`api.ts` `BASE_URL` reads `import.meta.env.VITE_API_URL` first, falls back to `http://localhost:8000/api`.

---

## Document request validation

Enforced both in `routes/student_routes.py` (authoritative) and `StudentDashboard.tsx` (UX — disabled buttons).

| Doc type | Rule |
|---|---|
| **Transcript** | Always allowed |
| **Marksheet** | Only semesters ≤ `semesters_completed` are selectable; backend raises 422 if any requested semester exceeds this |
| **Certificate** | Requires `semesters_completed >= program_duration × 2`; button locked with counter until condition is met |

Frontend reads `semesters_completed` and `program_duration` from `supabaseApi.getStudentPublicInfo()` on mount and stores them in `studentProfile` state.

---

## Key types (`types.ts`)

```ts
enum UserRole     { STUDENT = 'Student', ADMIN = 'Admin' }
enum DocumentType { TRANSCRIPT = 'Transcript', MARKSHEET = 'Marksheet', CERTIFICATE = 'Certificate' }
enum RequestStatus { PENDING_PAYMENT = 'Pending Payment', UNDER_REVIEW = 'Under Review',
                    APPROVED = 'Approved', REJECTED = 'Rejected', GENERATED = 'Generated' }

interface User { id, name, email, role: UserRole, registrationNumber? }

interface DocumentRequest {
  id, studentId, studentName, docType, semesters[], psid, amount,
  status, createdAt,
  paymentProofUrl?, transactionRef?, paymentMethod?, paymentSubmittedAt?,
  adminNote?, verificationPayload?
}

interface ActivityLog { id, timestamp, user, action, details }

interface StudentRecord {
  id,          // students.id (PK)
  userId,      // students.user_id (FK → users.id)
  fullName, email, isActive,         // from users join
  rollNumber,
  departmentId?, departmentName?,    // FK → departments.id; name from departments join
  degreeTitle?, program?, batchYear?, programDuration?,
  semestersCompleted?, cgpa?, totalCredits?, conduct?,
  cnic?, dob?, admissionDate?,
}

interface VerifyResponse {
  verified, token_verified, legacy,
  psid?, student_name?, student_id?, doc_type?, semesters?,
  issued_at?, verification_payload?, cgpa?, degree_title?, roll_number?
}
```

---

## Supabase tables

### Two-table student model — critical

Student data is split across two tables:

- **`users`** — auth identity only (mirrors `auth.users`)
- **`students`** — academic profile, linked via `user_id` FK

`document_requests.student_id` → **`students.id`** (NOT `users.id`). Every backend route that looks up a student first resolves `students.id` from `users.id` via `.eq("user_id", auth_user.id)`.

### `users` table

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `email` | text | NO | — |
| `full_name` | text | NO | — |
| `role` | text | NO | `'student'` |
| `is_active` | boolean | YES | `true` |
| `created_at` | timestamptz | YES | `now()` |

**Critical constraints:**
- `full_name` is NOT NULL — always include in INSERT.
- `role` CHECK constraint: only `'student'`, `'admin'`, `'registrar'` (all **lowercase**).
- Academic fields (roll_number, cgpa, etc.) do **NOT** live here — they live in `students`.

### `students` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Referenced by `document_requests.student_id` |
| `user_id` | uuid | FK → `users.id` |
| `roll_number` | text | |
| `department_id` | uuid | FK → `departments.id` |
| `degree_title` | text | |
| `program` | text | |
| `batch_year` | integer | |
| `program_duration` | integer | default 4 |
| `semesters_completed` | integer | default 0 |
| `cgpa` | numeric | default 0 |
| `total_credits` | integer | default 0 |
| `conduct` | text | default `'Good'` |
| `cnic` | text | |
| `dob` | date | |
| `admission_date` | date | |

### `departments` table

| Column | Type |
|---|---|
| `id` | uuid PK |
| `name` | text |

`students.department_id` is a **FK to `departments.id`** — `department` is NOT a plain text column. Do not add a `department` text column anywhere; always use `department_id` + a join.

### Other tables

| Table | Notable columns |
|---|---|
| `document_requests` | id, psid, student_id (FK→**students**.id), doc_type (lowercase enum), requested_semesters (JSON array), amount, status (snake_case), created_at, admin_note, verification_payload |
| `payments` | request_id, psid, amount, transaction_ref, payment_proof_url, status (`submitted`), submitted_at |
| `generated_documents` | psid, request_id, sha256_hash, pdf_url, verification_token (TEXT), verification_payload, qr_data, generated_at |
| `activity_logs` | id, action, user_id, details, created_at |
| `student_semester_records` | id, student_id (FK→students.id), course_id (FK→courses.id), grade, semester_number |
| `courses` | id, code, name, credit_hours, semester_number |

**Critical schema notes:**
- `document_requests.doc_type` is a **lowercase** PostgreSQL enum: `marksheet`, `transcript`, `certificate`. Always `.toLowerCase()` before INSERT.
- `document_requests.requested_semesters` is the DB column name (mapped to `semesters` in TS).
- `document_requests` does **NOT** have a `payment_proof_url` column — that lives in `payments`.
- `payments.transaction_ref` — bank transfer reference number entered by student at upload time.
- `verification_payload` — human-readable display string (`SECURE-V2-{psid}-{initials}-{4hex}-{4hex}`), stored in `document_requests`. Not used for cryptographic verification.
- `generated_documents.verification_token` — `secrets.token_hex(16)` (128 bits), embedded in the QR URL as `?token=`. Used by the strong verification path. Requires the column to exist (see Known env issue #5).

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
- Auth session: `onAuthStateChange`-primary pattern with eager `getSession()` — survives page refresh and JWT auto-renewal (TOKEN_REFRESHED event keeps user state current)
- Student: create request (multi-step modal), view own requests, status badges, loading state on fetch
- Student: document type validation — Certificate locked until all semesters done; Marksheet semester buttons locked beyond `semesters_completed`
- Student: payment proof upload — dedicated modal with Transaction Reference Number text input + file picker → Supabase Storage `payment-proofs` bucket → `payments` row inserted with `transaction_ref`; `document_requests` status updated to `under_review`; upload errors surfaced inline; activity log written on success
- Student: create-request errors surfaced inside the modal with real Supabase error message; no silent failures
- Student: status badge colors — `pending_payment`=amber, `under_review`=blue, `approved`=green, `rejected`=rose, `generated`=emerald
- Student: "Download Secure PDF" — async with spinner, fetches real `pdf_url` from `generated_documents`; resets on modal close
- Admin: view all requests with filter and loading state; approve (generates PDF + payload + documents row); reject with inline modal
- Admin: "Verify & Post" (approve) — real error surfaced in inline red banner; shows exact server error message
- Admin: rejection modal shows actual server error inline
- Admin: request list shows loading spinner on mount and after actions
- Admin: activity log shows `full_name` instead of raw UUID
- Admin: **Student Management tab** — lists all students from `students` (joined with `users`, `departments`); Add New Student modal (creates Supabase Auth user via service-role API then inserts `students` row); Edit modal (updates `students` row via `PUT /admin/update-student/{student_id}`); department is a FK to `departments` table
- Approve flow: ReportLab A4 PDF generated server-side, uploaded to `generated-pdfs` bucket, real SHA-256 hash stored
- QR code embedded in the ReportLab PDF (via `qrcode[pil]`) — sits side-by-side with the verification table
- Verification payload uses `secrets.token_hex` (CSPRNG)
- Real QR code in document preview modal via `react-qr-code`
- Admin ledger summary shows live counts: total, pending, approved, rejected
- Activity log reads in admin sidebar; logged events: request created, payment uploaded, approved, rejected
- Public PSID lookup with full result UI: loading spinner, valid (emerald) / invalid (rose) states, info grid
- Deep-link QR scan support — `App.tsx` reads `?psid=` and `?token=` query params on mount
- Strong verification: `?token=` present → backend matches psid+token against `generated_documents.verification_token`; frontend shows green "Cryptographically Verified" badge
- Legacy verification: no `?token=` → psid-only lookup; frontend shows yellow "Legacy Mode" badge and amber warning banner
- Token bypass attack prevention: token supplied but no match → `verified=false`, no legacy fallback
- JWT validation on every FastAPI route; admin-role guard (case-insensitive)
- Rate limiting middleware on all FastAPI routes (`RateLimitMiddleware` in `main.py`)
- CORS: `allow_origins` includes `https://digitaldoc-phi.vercel.app`; `allow_origin_regex` allows any `http://localhost:<port>`
- RLS policy SQL executed in Supabase ✅
- Mobile responsive: all stat card grids (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`), request cards (`flex-col md:flex-row`), tables (`overflow-x-auto`), modals (`max-h-[90vh]` with `overflow-y-auto` body), Navbar hamburger menu

### Known issues / not yet done
- None — all issues resolved ✅

### Supabase Storage buckets required
Both must exist and be set to **Public**:
- `payment-proofs` ✅ exists
- `generated-pdfs` ✅ exists

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

## IST PDF format (admin_routes.py)

`_build_pdf()` dispatches by `doc_type`:

| Type | Builder | Title |
|---|---|---|
| `transcript` | `_build_transcript()` | STUDENT ISSUED TRANSCRIPT |
| `marksheet` | `_build_marksheet()` | SEMESTER RESULT SHEET |
| `certificate` | `_build_bonafide()` | BONAFIDE CERTIFICATE |

- `_ist_header()` — IST logo placeholder (blue square "IST") + university name/address/tel/email + rule
- `_student_info_section()` — two-column: Name/Degree/DOB left, Reg No/Admission/CNIC right
- `_verification_section()` — PSID / URL / date / payload + QR code (appended to every document type)
- University constants: `UNI_NAME`, `UNI_ADDRESS`, `UNI_TEL`, `UNI_EMAIL` at top of file
- Grade points: A+=4.00 … D=1.00, F/W=0.00; SGPA = `sum(gp×cr)/sum(cr)`
- Semester labels derived from `batch_year` + semester number: odd=FALL, even=SPRING
- `approve_request` fetches `student_semester_records` joined with `courses` and passes as `grades`
- If `student_semester_records` or `courses` tables don't exist, course tables render empty but PDF still generates

`approve_request` builds `student` dict by merging `students.*` + `users(full_name, email)` + `departments(name)` — all three tables are queried.
