import io
import hashlib
import secrets
import datetime
import qrcode
from fastapi import APIRouter, HTTPException, Depends, Query
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, Image as RLImage,
)
from core.supabase_client import supabase
from core.security import require_admin

router = APIRouter()

# ── Colour palette (matches the frontend blue/gold theme) ─────────────────────
_NAVY  = colors.HexColor('#1e3a5f')
_GOLD  = colors.HexColor('#b8962e')
_LGRAY = colors.HexColor('#f7f7f7')
_MGRAY = colors.HexColor('#888888')
_BORD  = colors.HexColor('#dddddd')

# Usable content width at 2 cm margins on each side
_W = A4[0] - 4 * cm   # 17 cm


# ── PDF helpers ───────────────────────────────────────────────────────────────

def _p(text: str, **kw) -> Paragraph:
    style = ParagraphStyle('_', parent=getSampleStyleSheet()['Normal'], **kw)
    return Paragraph(text, style)


def _hr(thickness: float = 1, color=_NAVY, before: float = 0, after: float = 4) -> HRFlowable:
    return HRFlowable(
        width='100%', thickness=thickness, color=color,
        spaceBefore=before * mm, spaceAfter=after * mm,
    )


def _stat_cell(value: str, label: str) -> Table:
    return Table(
        [[_p(value, fontSize=15, fontName='Helvetica-Bold',
              textColor=_NAVY, alignment=TA_CENTER)],
         [_p(label, fontSize=6,  fontName='Helvetica',
              textColor=_MGRAY, alignment=TA_CENTER)]],
        colWidths=[_W / 4],
        style=TableStyle([
            ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING',    (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]),
    )


def _sig_block(title: str, dept: str) -> Table:
    return Table(
        [[_p('_________________________',
              fontSize=9, fontName='Helvetica', alignment=TA_CENTER)],
         [_p(title, fontSize=8, fontName='Helvetica-Bold',
              textColor=_NAVY, alignment=TA_CENTER)],
         [_p(dept,  fontSize=7, fontName='Helvetica',
              textColor=_MGRAY, alignment=TA_CENTER)]],
        colWidths=[8.5 * cm],
    )


def _make_qr(data: str) -> io.BytesIO:
    qr = qrcode.QRCode(version=1, box_size=4, border=2,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color='#1e3a5f', back_color='white')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


def _build_pdf(req: dict, student: dict, payload: str, verify_url: str) -> bytes:
    """
    Build and return a professional academic document PDF as bytes.

    req        – row from document_requests
    student    – row from users (full profile)
    payload    – the SECURE-V2-... display string stored in document_requests
    verify_url – full URL embedded in the QR code, includes psid + token
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
    )

    def lbl(t: str) -> Paragraph:
        return _p(t.upper(), fontSize=7, fontName='Helvetica', textColor=_MGRAY)

    def val(t) -> Paragraph:
        return _p(str(t or '—'), fontSize=9, fontName='Helvetica-Bold',
                  textColor=colors.black)

    # ── Collect student / request data ────────────────────────────────────────
    full_name  = student.get('full_name')        or req.get('student_name', '—')
    roll_no    = student.get('roll_number')       or '—'
    cnic       = student.get('cnic')              or '—'
    dob        = str(student.get('dob')           or '—')
    degree     = student.get('degree_title')      or '—'
    dept_name  = student.get('department')        or '—'
    program    = student.get('program')           or '—'
    batch      = str(student.get('batch_year')    or '—')
    admission  = str(student.get('admission_date') or '—')
    conduct    = student.get('conduct')           or 'Good'
    cgpa       = str(student.get('cgpa')                or '—')
    sem_done   = str(student.get('semesters_completed') or '—')
    credits    = str(student.get('total_credits')       or '—')
    prog_dur   = f"{student.get('program_duration') or '—'} yrs"

    psid       = req.get('psid', '—')
    doc_type   = req.get('doc_type', 'Document').upper()
    semesters  = sorted(req.get('requested_semesters') or [])
    amount     = req.get('amount', 0)
    sem_label  = ', '.join(f'Semester {s}' for s in semesters) or 'All Semesters'
    issue_date = datetime.datetime.utcnow().strftime('%d %B %Y')

    title_map = {
        'TRANSCRIPT':  'OFFICIAL ACADEMIC TRANSCRIPT',
        'MARKSHEET':   'OFFICIAL MARKSHEET',
        'CERTIFICATE': 'CERTIFICATE OF COMPLETION',
    }
    title_text = title_map.get(doc_type, f'OFFICIAL {doc_type}')

    story = []

    # ── 1. University header ──────────────────────────────────────────────────
    story += [
        _p('DIGITAL UNIVERSITY',
           fontSize=18, fontName='Helvetica-Bold', textColor=_NAVY,
           alignment=TA_CENTER, spaceAfter=2),
        _p('Office of the Registrar &bull; Academic Records Division',
           fontSize=8, fontName='Helvetica', textColor=_MGRAY,
           alignment=TA_CENTER, spaceAfter=1),
        _p('Accredited Institution of Higher Learning &bull; Est. 1985',
           fontSize=8, fontName='Helvetica', textColor=_MGRAY,
           alignment=TA_CENTER, spaceAfter=4),
        _hr(thickness=2, color=_NAVY, after=1),
        _hr(thickness=1, color=_GOLD, before=1, after=4),
    ]

    # ── 2. Document type title ────────────────────────────────────────────────
    story += [
        _p(title_text,
           fontSize=13, fontName='Helvetica-Bold', textColor=_NAVY,
           alignment=TA_CENTER, spaceBefore=4, spaceAfter=2),
        _hr(thickness=1, color=_GOLD, before=1, after=6),
    ]

    # ── 3. Student information (2-column label / value table) ─────────────────
    story.append(_p('STUDENT INFORMATION',
                    fontSize=7, fontName='Helvetica-Bold', textColor=_GOLD,
                    spaceBefore=6, spaceAfter=3))

    fields = [
        ('Full Name',      full_name),  ('Roll Number',    roll_no),
        ('CNIC',           cnic),       ('Date of Birth',  dob),
        ('Degree Title',   degree),     ('Department',     dept_name),
        ('Program',        program),    ('Batch Year',     batch),
        ('Admission Date', admission),  ('Conduct',        conduct),
    ]

    info_rows = []
    for i in range(0, len(fields), 2):
        l1, v1 = fields[i]
        l2, v2 = fields[i + 1] if i + 1 < len(fields) else ('', '')
        info_rows.append([lbl(l1), val(v1), lbl(l2), val(v2)])

    info_tbl = Table(info_rows, colWidths=[3*cm, 5*cm, 3*cm, 6*cm])
    info_tbl.setStyle(TableStyle([
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, _LGRAY]),
        ('TOPPADDING',     (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
        ('LEFTPADDING',    (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',   (0, 0), (-1, -1), 6),
        ('BOX',            (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEAFTER',      (1, 0), (1, -1),  0.5, _BORD),
        ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story += [info_tbl, Spacer(1, 0.3 * cm)]

    # ── 4. Academic summary (4 stat boxes) ───────────────────────────────────
    story.append(_p('ACADEMIC SUMMARY',
                    fontSize=7, fontName='Helvetica-Bold', textColor=_GOLD,
                    spaceBefore=4, spaceAfter=3))

    stat_tbl = Table(
        [[_stat_cell(cgpa,     'CGPA'),
          _stat_cell(sem_done, 'SEMESTERS DONE'),
          _stat_cell(credits,  'TOTAL CREDITS'),
          _stat_cell(prog_dur, 'PROGRAMME DURATION')]],
        colWidths=[_W / 4] * 4,
    )
    stat_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), _LGRAY),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEAFTER',     (0, 0), (-2, -1), 0.5, _BORD),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story += [stat_tbl, Spacer(1, 0.3 * cm)]

    # ── 5. Document scope ─────────────────────────────────────────────────────
    story.append(_p('SCOPE OF THIS DOCUMENT',
                    fontSize=7, fontName='Helvetica-Bold', textColor=_GOLD,
                    spaceBefore=4, spaceAfter=3))

    scope_tbl = Table(
        [[lbl('Semesters Covered'), val(sem_label)],
         [lbl('Document Type'),     val(doc_type.title())],
         [lbl('Processing Fee'),    val(f'PKR {int(amount):,}')]],
        colWidths=[4 * cm, 13 * cm],
    )
    scope_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, -1), _LGRAY),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.5, _BORD),
    ]))
    story += [scope_tbl, Spacer(1, 0.4 * cm)]

    # ── 6. Cryptographic verification block ───────────────────────────────────
    story += [
        _hr(thickness=1, color=_GOLD, before=0, after=2),
        _p('CRYPTOGRAPHIC VERIFICATION',
           fontSize=7, fontName='Helvetica-Bold', textColor=_GOLD,
           spaceBefore=2, spaceAfter=3),
    ]

    # verify_url already contains the full URL with psid + token — passed in
    verify_tbl = Table(
        [[lbl('PSID (Transaction Reference)'),
          _p(psid, fontSize=9, fontName='Courier-Bold', textColor=_NAVY)],
         [lbl('Verification Payload'),
          _p(payload, fontSize=7, fontName='Courier', textColor=colors.black)],
         [lbl('Issue Date'), val(issue_date)],
         [lbl('Verify URL'), _p(verify_url.replace('&', '&amp;'), fontSize=7, fontName='Courier', textColor=_NAVY)]],
        colWidths=[3.5 * cm, 10 * cm],
    )
    verify_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, -1), _LGRAY),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.5, _BORD),
    ]))

    qr_buf = _make_qr(verify_url)
    qr_img = RLImage(qr_buf, width=3 * cm, height=3 * cm)
    qr_block = Table(
        [[qr_img],
         [_p('Scan to verify', fontSize=5, fontName='Helvetica',
             textColor=_MGRAY, alignment=TA_CENTER)]],
        colWidths=[3.5 * cm],
    )
    qr_block.setStyle(TableStyle([
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    side_by_side = Table(
        [[verify_tbl, qr_block]],
        colWidths=[13.5 * cm, 3.5 * cm],
    )
    side_by_side.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING',  (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story += [side_by_side, Spacer(1, 0.5 * cm)]

    # ── 7. Signature lines ────────────────────────────────────────────────────
    sig_tbl = Table(
        [[_sig_block('REGISTRAR', 'Office of the Registrar'),
          _sig_block('CONTROLLER OF EXAMINATIONS', 'Examination Division')]],
        colWidths=[8.5 * cm, 8.5 * cm],
    )
    sig_tbl.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 25),
        ('LINEAFTER',  (0, 0), (0,  -1), 0.5, _BORD),
        ('ALIGN',      (0, 0), (-1, -1), 'CENTER'),
    ]))
    story += [sig_tbl, Spacer(1, 0.4 * cm)]

    # ── 8. Footer ─────────────────────────────────────────────────────────────
    story += [
        _hr(thickness=0.5, color=_NAVY, before=0, after=2),
        _p(
            f'This document was generated by the Automated Document Management System of '
            f'Digital University. It is valid only with the cryptographic signature above. '
            f'To verify authenticity, visit the public verification portal and enter PSID: {psid}.',
            fontSize=6, fontName='Helvetica', textColor=_MGRAY,
            alignment=TA_CENTER, leading=9,
        ),
    ]

    doc.build(story)
    return buf.getvalue()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/requests")
async def list_all_requests(auth_user=Depends(require_admin)):
    try:
        result = (
            supabase.table("document_requests")
            .select("*, students(roll_number, users(full_name)), payments(transaction_ref, payment_proof_url, amount, method, status, submitted_at)")
            .order("created_at", desc=True)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            student_info = row.pop("students", None) or {}
            user_info = student_info.get("users") or {}
            row["student_name"] = user_info.get("full_name", "")
            row["roll_number"] = student_info.get("roll_number", "")
            # Flatten the most recent payment into the row
            payment_rows = row.pop("payments", None) or []
            latest = payment_rows[-1] if payment_rows else {}
            row["transaction_ref"]     = latest.get("transaction_ref")
            row["payment_proof_url"]   = latest.get("payment_proof_url")
            row["payment_method"]      = latest.get("method")
            row["payment_submitted_at"] = latest.get("submitted_at")
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/approve/{request_id}")
async def approve_request(
    request_id: str,
    admin_name: str,
    base_url: str = Query(default="http://localhost:3000"),
    auth_user=Depends(require_admin),
):
    try:
        # 1. Fetch the document request
        req_result = (
            supabase.table("document_requests")
            .select("*")
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        if not req_result.data:
            raise HTTPException(status_code=404, detail="Request not found")
        req = req_result.data[0]

        # 2. Fetch full student profile for PDF content
        # document_requests.student_id is students.id (not users.id)
        student_row_result = (
            supabase.table("students")
            .select("*")
            .eq("id", req["student_id"])
            .limit(1)
            .execute()
        )
        student_row = student_row_result.data[0] if student_row_result.data else {}

        user_row_result = (
            supabase.table("users")
            .select("full_name, email")
            .eq("id", student_row.get("user_id", ""))
            .limit(1)
            .execute()
        )
        user_row = user_row_result.data[0] if user_row_result.data else {}

        dept_result = (
            supabase.table("departments")
            .select("name")
            .eq("id", student_row.get("department_id", ""))
            .limit(1)
            .execute()
        )
        dept_name = dept_result.data[0].get("name") if dept_result.data else None

        # Merge into a single dict — _build_pdf reads keys from this dict
        student = {
            **student_row,
            "full_name": user_row.get("full_name"),
            "email": user_row.get("email"),
            "department": dept_name,
        }

        # 3. Generate display payload (kept in document_requests for UI display)
        initials = (user_row.get("full_name") or "XX")[:2].upper()
        sig1     = secrets.token_hex(2).upper()
        sig2     = secrets.token_hex(2).upper()
        payload  = f"SECURE-V2-{req['psid']}-{initials}-{sig1}-{sig2}"

        # 4. Generate a cryptographically strong 128-bit verification token.
        #    Stored in documents.verification_token and embedded in the QR URL.
        #    16 bytes = 128 bits = 3.4 × 10^38 possible values — brute-force infeasible.
        verification_token = secrets.token_hex(16)

        # 5. Build the QR verify URL — includes both psid and token
        verify_url = f"{base_url}/verify?psid={req['psid']}&token={verification_token}"

        # 6. Build the PDF (verify_url is embedded in the QR code inside the PDF)
        pdf_bytes = _build_pdf(req, student, payload, verify_url)

        # 7. Upload PDF to Supabase Storage bucket 'generated-pdfs'
        file_path = f"{req['psid']}.pdf"
        try:
            supabase.storage.from_("generated-pdfs").upload(
                path=file_path,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )
        except Exception as upload_err:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"PDF Storage upload failed: {upload_err}. "
                    "Ensure the 'generated-pdfs' bucket exists in Supabase Storage "
                    "and is set to public."
                ),
            )

        pdf_url = supabase.storage.from_("generated-pdfs").get_public_url(file_path)

        # 8. Real SHA-256 hash of the PDF bytes
        doc_hash = hashlib.sha256(pdf_bytes).hexdigest()

        # 9. Update document_requests: status → generated, store display payload
        supabase.table("document_requests").update({
            "status": "generated",
            "verification_payload": payload,
        }).eq("id", request_id).execute()

        # 10. Upsert generated_documents row
        supabase.table("generated_documents").upsert(
            {
                "request_id": request_id,
                "psid": req["psid"],
                "sha256_hash": doc_hash,
                "pdf_url": pdf_url,
                "verification_token": verification_token,
                "verification_payload": payload,
                "qr_data": verify_url,
                "generated_at": datetime.datetime.utcnow().isoformat(),
            },
            on_conflict="psid",
        ).execute()

        # 11. Activity log
        supabase.table("activity_logs").insert({
            "action": "Document Approved & PDF Generated",
            "user_id": auth_user.id,
            "details": {
                "psid": req["psid"],
                "approved_by": admin_name,
                "file_path": file_path,
            },
            "created_at": datetime.datetime.utcnow().isoformat(),
        }).execute()

        return {
            "message": "Request approved and PDF generated",
            "verification_payload": payload,
            "pdf_url": pdf_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reject/{request_id}")
async def reject_request(
    request_id: str, reason: str, admin_name: str, auth_user=Depends(require_admin)
):
    try:
        req_result = (
            supabase.table("document_requests")
            .select("psid")
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        psid = req_result.data[0]["psid"] if req_result.data else request_id

        supabase.table("document_requests").update({
            "status": "rejected",
            "admin_note": reason,
        }).eq("id", request_id).execute()

        supabase.table("activity_logs").insert({
            "action": "Application Rejected",
            "user_id": auth_user.id,
            "details": {"psid": psid, "reason": reason},
            "created_at": datetime.datetime.utcnow().isoformat(),
        }).execute()

        return {"message": "Request rejected"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
async def get_logs(auth_user=Depends(require_admin)):
    try:
        result = (
            supabase.table("activity_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
