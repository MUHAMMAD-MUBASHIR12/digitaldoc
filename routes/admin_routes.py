import io
import hashlib
import secrets
import datetime
import qrcode
from collections import defaultdict
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Query
from supabase_auth.types import AdminUserAttributes
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

# ── IST University constants ──────────────────────────────────────────────────
UNI_NAME    = "INSTITUTE OF SPACE TECHNOLOGY"
UNI_ADDRESS = "1, Islamabad Highway, Islamabad (44000), Pakistan."
UNI_TEL     = "Tel +92.51.9273316, Fax +92.51.9273310"
UNI_EMAIL   = "email@ist.edu.pk, www.ist.edu.pk"

# ── Colour palette ────────────────────────────────────────────────────────────
_NAVY     = colors.HexColor('#1e3a5f')
_GOLD     = colors.HexColor('#b8962e')
_LGRAY    = colors.HexColor('#f7f7f7')
_MGRAY    = colors.HexColor('#888888')
_BORD     = colors.HexColor('#dddddd')
_IST_BLUE = colors.HexColor('#003366')

# Usable content width at 2 cm margins on each side
_W = A4[0] - 4 * cm   # ~17 cm

# ── Grade points mapping ──────────────────────────────────────────────────────
GRADE_POINTS = {
    'A+': 4.00, 'A': 4.00, 'A-': 3.67,
    'B+': 3.33, 'B': 3.00, 'B-': 2.67,
    'C+': 2.33, 'C': 2.00, 'C-': 1.67,
    'D+': 1.33, 'D': 1.00,
    'F':  0.00, 'W': 0.00,
}

# Grade rotation used when seeding records for new students / new semesters
_GRADE_ROTATION    = ['A+', 'A', 'A-', 'B+', 'B', 'A', 'A-', 'B+']
_GP_ROTATION       = [4.00, 4.00, 3.67, 3.33, 3.00, 4.00, 3.67, 3.33]


# ── PDF helpers (unchanged) ───────────────────────────────────────────────────

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


def _sig_block(title: str, name: str, department: str) -> Table:
    rows = [
        [_p('~ - ~ - ~ - ~ - ~ - ~ - ~ - ~',
            fontSize=8, fontName='Helvetica', textColor=_MGRAY, alignment=TA_CENTER)],
        [_p(f'<b>{name}</b>', fontSize=9, fontName='Helvetica-Bold',
            textColor=_NAVY, alignment=TA_CENTER)],
        [_p(title, fontSize=8, fontName='Helvetica-Bold',
            textColor=_IST_BLUE, alignment=TA_CENTER)],
        [_p(department, fontSize=7, fontName='Helvetica',
            textColor=_MGRAY, alignment=TA_CENTER)],
        [_p('( Official Stamp )', fontSize=6, fontName='Helvetica',
            textColor=_MGRAY, alignment=TA_CENTER)],
    ]
    tbl = Table(rows, colWidths=[8.5 * cm])
    tbl.setStyle(TableStyle([
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('BOX',           (0, 4), (0, 4), 0.5, _BORD),
    ]))
    return tbl


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


# ── IST university header ─────────────────────────────────────────────────────

def _ist_header(story: list) -> None:
    """Render the standard IST header: logo placeholder + university info + rule."""
    logo_cell = Table(
        [[_p('<b>IST</b>', fontSize=14, fontName='Helvetica-Bold',
             textColor=colors.white, alignment=TA_CENTER)]],
        colWidths=[2.2 * cm],
        rowHeights=[2.2 * cm],
    )
    logo_cell.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), _IST_BLUE),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))

    info_w = _W - 2.2 * cm
    uni_info = Table(
        [
            [_p(f'<b>{UNI_NAME}</b>', fontSize=15, fontName='Helvetica-Bold',
                textColor=_IST_BLUE, alignment=TA_CENTER)],
            [_p(UNI_ADDRESS, fontSize=8, fontName='Helvetica',
                textColor=colors.black, alignment=TA_CENTER)],
            [_p(UNI_TEL, fontSize=8, fontName='Helvetica',
                textColor=colors.black, alignment=TA_CENTER)],
            [_p(UNI_EMAIL, fontSize=8, fontName='Helvetica',
                textColor=colors.black, alignment=TA_CENTER)],
        ],
        colWidths=[info_w],
    )
    uni_info.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))

    header_tbl = Table([[logo_cell, uni_info]], colWidths=[2.2 * cm, info_w])
    header_tbl.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))

    story.append(header_tbl)
    story.append(Spacer(1, 3 * mm))
    story.append(_hr(thickness=1.5, color=_IST_BLUE, before=0, after=3))


# ── Student info section ──────────────────────────────────────────────────────

def _fmt_date(d) -> str:
    if not d:
        return '—'
    try:
        dt = datetime.date.fromisoformat(str(d)[:10])
        return dt.strftime('%d %b %Y')
    except Exception:
        return str(d)


def _student_info_section(story: list, student: dict) -> None:
    """Two-column student info block: (Name/Degree/DOB) | (Reg No/Admission/CNIC)."""
    full_name = student.get('full_name') or '—'
    degree    = student.get('degree_title') or '—'
    dob       = _fmt_date(student.get('dob'))
    roll_no   = student.get('roll_number') or '—'
    admission = _fmt_date(student.get('admission_date'))
    cnic      = student.get('cnic') or '—'

    def lbl(t): return _p(t, fontSize=8, fontName='Helvetica', textColor=_MGRAY)
    def val(t): return _p(str(t), fontSize=9, fontName='Helvetica-Bold', textColor=colors.black)

    half = _W / 2

    left_tbl = Table(
        [
            [lbl('Name'),       val(full_name)],
            [lbl('Degree'),     val(degree)],
            [lbl('Birth Date'), val(dob)],
        ],
        colWidths=[2.8 * cm, half - 2.8 * cm],
    )
    right_tbl = Table(
        [
            [lbl('Registration No'),   val(roll_no)],
            [lbl('Date Of Admission'), val(admission)],
            [lbl('CNIC'),              val(cnic)],
        ],
        colWidths=[3.4 * cm, half - 3.4 * cm],
    )
    for tbl in (left_tbl, right_tbl):
        tbl.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING',   (0, 0), (-1, -1), 5),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ]))

    outer = Table([[left_tbl, right_tbl]], colWidths=[half, half])
    outer.setStyle(TableStyle([
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEAFTER',     (0, 0), (0,  -1), 0.5, _BORD),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(outer)
    story.append(Spacer(1, 4 * mm))


# ── Semester / grade helpers ──────────────────────────────────────────────────

def _semester_label(sem_num: int, batch_year: int) -> str:
    year_offset = (sem_num - 1) // 2
    season = 'FALL' if sem_num % 2 == 1 else 'SPRING'
    return f'{season} {batch_year + year_offset}'


def _is_lab(course: dict) -> bool:
    return (
        course.get('credit_hours') == 1
        and 'lab' in (course.get('name') or '').lower()
    )


def _credit_fmt(course: dict) -> str:
    ch = course.get('credit_hours') or 0
    return f'0-{ch}' if _is_lab(course) else f'{ch}-0'


def _gp(grade: str) -> float:
    return GRADE_POINTS.get((grade or '').strip().upper(), 0.0)


def _sgpa(records: list) -> tuple:
    """Return (sgpa, total_credits) for a list of grade records."""
    pts = sum(_gp(r.get('grade', '')) * ((r.get('courses') or {}).get('credit_hours') or 0)
              for r in records)
    creds = sum((r.get('courses') or {}).get('credit_hours') or 0 for r in records)
    return (pts / creds if creds else 0.0, creds)


def _academic_year_for_sem(batch_year: int, sem_num: int) -> str:
    offset = (sem_num - 1) // 2
    y = batch_year + offset
    return f"{y}-{y + 1}"


def _seed_grade_records(
    student_id: str,
    department_id: Optional[str],
    batch_year: int,
    from_sem: int,
    to_sem: int,
) -> None:
    """Insert grade records for semesters from_sem..to_sem (inclusive).

    Best-effort — any exception is swallowed so the caller never fails
    due to grade seeding (student profile creation / update must always succeed).
    """
    if to_sem < from_sem:
        return
    try:
        q = (
            supabase.table("courses")
            .select("id, semester_number")
            .gte("semester_number", from_sem)
            .lte("semester_number", to_sem)
        )
        if department_id:
            q = q.eq("department_id", department_id)
        courses = (q.order("semester_number").execute()).data or []
        if not courses:
            return
        records = [
            {
                "student_id":      student_id,
                "course_id":       c["id"],
                "grade":           _GRADE_ROTATION[i % len(_GRADE_ROTATION)],
                "semester_number": int(c.get("semester_number") or from_sem),
                "academic_year":   _academic_year_for_sem(
                    batch_year, int(c.get("semester_number") or from_sem)
                ),
            }
            for i, c in enumerate(courses)
        ]
        supabase.table("student_semester_records").insert(records).execute()
    except Exception:
        pass


# ── Single-semester course table ──────────────────────────────────────────────

def _course_table(records: list, col_widths: list) -> Table:
    header = [
        _p('COURSE CODE', fontSize=7, fontName='Helvetica-Bold', textColor=colors.white),
        _p('COURSE TITLE', fontSize=7, fontName='Helvetica-Bold', textColor=colors.white),
        _p('CR (T-L)', fontSize=7, fontName='Helvetica-Bold',
           textColor=colors.white, alignment=TA_CENTER),
        _p('GRADE', fontSize=7, fontName='Helvetica-Bold',
           textColor=colors.white, alignment=TA_CENTER),
    ]
    rows = [header]
    for r in records:
        c = r.get('courses') or {}
        rows.append([
            _p(c.get('code') or '—', fontSize=7, fontName='Courier'),
            _p(c.get('name') or '—', fontSize=7, fontName='Helvetica'),
            _p(_credit_fmt(c), fontSize=7, fontName='Helvetica', alignment=TA_CENTER),
            _p(r.get('grade') or '—', fontSize=8, fontName='Helvetica-Bold',
               alignment=TA_CENTER),
        ])

    tbl = Table(rows, colWidths=col_widths)
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1,  0), _IST_BLUE),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, _LGRAY]),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('INNERGRID',     (0, 0), (-1, -1), 0.25, _BORD),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return tbl


# ── Verification block (shared by all document types) ─────────────────────────

def _verification_section(story: list, psid: str, payload: str, verify_url: str) -> None:
    issue_date = datetime.datetime.utcnow().strftime('%d %B %Y')

    story.append(_hr(thickness=0.5, color=_BORD, before=4, after=2))
    story.append(_p('CRYPTOGRAPHIC VERIFICATION', fontSize=7, fontName='Helvetica-Bold',
                    textColor=_IST_BLUE, spaceAfter=3))

    def lbl(t): return _p(t, fontSize=7, fontName='Helvetica', textColor=_MGRAY)

    label_w = 3.4 * cm
    qr_w    = 3.2 * cm
    val_w   = _W - label_w - qr_w

    verify_tbl = Table(
        [
            [lbl('PSID'),
             _p(psid, fontSize=8, fontName='Courier-Bold', textColor=_IST_BLUE)],
            [lbl('Verification URL'),
             _p(verify_url.replace('&', '&amp;'), fontSize=7, fontName='Courier',
                textColor=colors.black)],
            [lbl('Issue Date'),
             _p(issue_date, fontSize=7, fontName='Helvetica')],
            [lbl('Payload'),
             _p(payload, fontSize=7, fontName='Courier', textColor=colors.black)],
        ],
        colWidths=[label_w, val_w],
    )
    verify_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (0, -1), _LGRAY),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.25, _BORD),
    ]))

    qr_buf = _make_qr(verify_url)
    qr_img = RLImage(qr_buf, width=2.8 * cm, height=2.8 * cm)
    qr_block = Table(
        [[qr_img],
         [_p('Scan to verify', fontSize=5, fontName='Helvetica',
             textColor=_MGRAY, alignment=TA_CENTER)]],
        colWidths=[qr_w],
    )
    qr_block.setStyle(TableStyle([
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    side = Table([[verify_tbl, qr_block]], colWidths=[_W - qr_w, qr_w])
    side.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))
    story.append(side)
    story.append(Spacer(1, 3 * mm))


# ── Bank account details box ──────────────────────────────────────────────────

def _bank_details_box(story: list) -> None:
    """Render a bordered bank account info box with a blue header."""
    details = [
        ('Bank Name',      'National Bank of Pakistan (NBP)'),
        ('Account Title',  'Institute of Space Technology'),
        ('Account Number', '1234-5678-9012-3456'),
        ('IBAN',           'PK36NBPA0000001234567890'),
        ('Branch Code',    '0425'),
        ('Branch',         'Islamabad Main Branch'),
    ]

    def lbl(t): return _p(t, fontSize=8, fontName='Helvetica', textColor=_MGRAY)
    def val(t): return _p(f'<b>{t}</b>', fontSize=8, fontName='Helvetica-Bold',
                          textColor=colors.black)

    rows = [
        [_p('<b>UNIVERSITY BANK ACCOUNT DETAILS</b>', fontSize=9,
            fontName='Helvetica-Bold', textColor=colors.white, alignment=TA_CENTER),
         _p('')],
    ]
    for k, v in details:
        rows.append([lbl(k), val(v)])

    label_w = 4 * cm
    tbl = Table(rows, colWidths=[label_w, _W - label_w])
    tbl.setStyle(TableStyle([
        ('SPAN',          (0, 0), (1, 0)),
        ('BACKGROUND',    (0, 0), (1, 0), _IST_BLUE),
        ('BACKGROUND',    (0, 1), (0, -1), _LGRAY),
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEBELOW',     (0, 0), (-1, -1), 0.25, _BORD),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6 * mm))


# ── TRANSCRIPT ────────────────────────────────────────────────────────────────

def _build_transcript(story: list, req: dict, student: dict,
                      payload: str, verify_url: str, grades: list) -> None:
    batch_year = int(student.get('batch_year') or 2020)
    cgpa_stored = float(student.get('cgpa') or 0)

    story.append(_p('<u>STUDENT ISSUED TRANSCRIPT</u>',
                    fontSize=13, fontName='Helvetica-Bold', textColor=_IST_BLUE,
                    alignment=TA_CENTER, spaceBefore=4, spaceAfter=6))

    # Group by semester_number
    sem_map: dict = defaultdict(list)
    for r in grades:
        sem_num = (r.get('courses') or {}).get('semester_number') or 0
        sem_map[sem_num].append(r)

    sem_numbers = sorted(k for k in sem_map if k > 0)

    if not sem_numbers:
        story.append(_p(
            'No grade records found for this student. '
            'Please contact the Registrar office.',
            fontSize=10, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#cc0000'),
            spaceBefore=12, spaceAfter=12,
        ))

    # Column widths for paired left (55%) / right (45%) tables
    left_w  = _W * 0.55
    right_w = _W * 0.45

    def lc():  # left course-table cols summing to left_w
        return [1.8*cm, left_w - 1.8*cm - 1.5*cm - 1.1*cm, 1.5*cm, 1.1*cm]

    def rc():  # right course-table cols summing to right_w
        return [1.6*cm, right_w - 1.6*cm - 1.4*cm - 1.0*cm, 1.4*cm, 1.0*cm]

    cum_pts     = 0.0
    cum_credits = 0

    i = 0
    while i < len(sem_numbers):
        ls = sem_numbers[i]
        rs = sem_numbers[i + 1] if i + 1 < len(sem_numbers) else None
        i += 2

        l_records = sem_map[ls]
        r_records = sem_map[rs] if rs else []

        # Left semester SGPA
        l_sgpa, l_creds = _sgpa(l_records)
        l_pts = l_sgpa * l_creds
        cum_pts += l_pts
        cum_credits += l_creds
        l_cgpa = cum_pts / cum_credits if cum_credits else 0.0

        # Right semester SGPA
        r_sgpa, r_creds = (0.0, 0)
        r_cgpa = l_cgpa
        if rs:
            r_sgpa, r_creds = _sgpa(r_records)
            r_pts = r_sgpa * r_creds
            cum_pts += r_pts
            cum_credits += r_creds
            r_cgpa = cum_pts / cum_credits if cum_credits else 0.0

        # Semester label headers
        l_label = _semester_label(ls, batch_year)
        r_label = _semester_label(rs, batch_year) if rs else ''

        hdr_row = [
            _p(f'<b>{l_label}</b>', fontSize=8, fontName='Helvetica-Bold',
               textColor=_IST_BLUE),
            _p(f'<b>{r_label}</b>', fontSize=8, fontName='Helvetica-Bold',
               textColor=_IST_BLUE) if r_label else _p(''),
        ]
        hdr_tbl = Table([hdr_row], colWidths=[left_w, right_w])
        hdr_tbl.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING',   (0, 0), (-1, -1), 0),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ]))
        story.append(hdr_tbl)

        # Course tables side by side
        l_tbl = _course_table(l_records, lc())
        if rs:
            r_tbl = _course_table(r_records, rc())
            pair = Table([[l_tbl, r_tbl]], colWidths=[left_w, right_w])
        else:
            pair = Table([[l_tbl, _p('')]], colWidths=[left_w, right_w])

        pair.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING',   (0, 0), (-1, -1), 0),
            ('RIGHTPADDING',  (0, 0), (0,  -1), 3),
            ('RIGHTPADDING',  (1, 0), (1,  -1), 0),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(pair)

        # SGPA / CGPA summary row
        l_sum = f'SGPA : {l_sgpa:.2f}    {l_creds} Cr    CGPA : {l_cgpa:.2f}'
        r_sum = (f'SGPA : {r_sgpa:.2f}    {r_creds} Cr    CGPA : {r_cgpa:.2f}'
                 if rs else '')

        sum_tbl = Table(
            [[_p(l_sum, fontSize=7, fontName='Helvetica-Bold', textColor=_IST_BLUE),
              _p(r_sum, fontSize=7, fontName='Helvetica-Bold', textColor=_IST_BLUE)]],
            colWidths=[left_w, right_w],
        )
        sum_tbl.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), _LGRAY),
            ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
            ('TOPPADDING',    (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING',   (0, 0), (-1, -1), 5),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ]))
        story.append(sum_tbl)
        story.append(Spacer(1, 3 * mm))

    # ── Footer ────────────────────────────────────────────────────────────────
    all_records  = [r for recs in sem_map.values() for r in recs]
    theory_cr    = sum((r.get('courses') or {}).get('credit_hours') or 0
                       for r in all_records
                       if not _is_lab(r.get('courses') or {}))
    lab_cr       = sum((r.get('courses') or {}).get('credit_hours') or 0
                       for r in all_records
                       if _is_lab(r.get('courses') or {}))
    total_cr     = theory_cr + lab_cr
    final_cgpa   = cum_pts / cum_credits if cum_credits else cgpa_stored

    sems_done    = student.get('semesters_completed') or len(sem_numbers)
    prog_dur     = int(student.get('program_duration') or 4)
    conferred    = ('Degree Conferred'
                    if sems_done >= prog_dur * 2
                    else 'Degree Not Conferred')

    story.append(_hr(thickness=0.5, color=_BORD, before=2, after=2))
    foot_data = [
        [_p('<b>CREDITS EARNED</b>', fontSize=8, fontName='Helvetica-Bold',
            textColor=_IST_BLUE),
         _p(f'{total_cr} ({theory_cr}-{lab_cr})', fontSize=8,
            fontName='Helvetica-Bold')],
        [_p('<b>CGPA</b>', fontSize=8, fontName='Helvetica-Bold', textColor=_IST_BLUE),
         _p(f'{final_cgpa:.2f}', fontSize=8, fontName='Helvetica-Bold')],
        [_p('<b>STATUS</b>', fontSize=8, fontName='Helvetica-Bold', textColor=_IST_BLUE),
         _p(conferred, fontSize=8, fontName='Helvetica-Bold')],
    ]
    foot_tbl = Table(foot_data, colWidths=[4 * cm, _W - 4 * cm])
    foot_tbl.setStyle(TableStyle([
        ('BOX',           (0, 0), (-1, -1), 0.5, _BORD),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.25, _BORD),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
    ]))
    story.append(foot_tbl)
    story.append(Spacer(1, 4 * mm))
    story.append(_p('<b>— END OF TRANSCRIPT —</b>',
                    fontSize=9, fontName='Helvetica-Bold', textColor=_IST_BLUE,
                    alignment=TA_CENTER, spaceAfter=6))

    left_sig  = _sig_block('Controller of Examinations', 'Dr. Ahmad Hassan',   'Controller of Examinations')
    right_sig = _sig_block('Registrar',                  'Prof. Muhammad Ali', 'Office of the Registrar')
    sig_tbl = Table([[left_sig, right_sig]], colWidths=[_W / 2, _W / 2])
    sig_tbl.setStyle(TableStyle([
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING',    (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))
    story.append(sig_tbl)


# ── MARKSHEET ─────────────────────────────────────────────────────────────────

def _build_marksheet(story: list, req: dict, student: dict,
                     payload: str, verify_url: str, grades: list) -> None:
    batch_year    = int(student.get('batch_year') or 2020)
    requested_sem = set(req.get('requested_semesters') or [])

    story.append(_p('<u>SEMESTER RESULT SHEET</u>',
                    fontSize=13, fontName='Helvetica-Bold', textColor=_IST_BLUE,
                    alignment=TA_CENTER, spaceBefore=4, spaceAfter=6))

    sem_map: dict = defaultdict(list)
    for r in grades:
        sem_num = (r.get('courses') or {}).get('semester_number') or 0
        if not requested_sem or sem_num in requested_sem:
            sem_map[sem_num].append(r)

    col_w = [2.0*cm, _W - 2.0*cm - 1.8*cm - 1.4*cm, 1.8*cm, 1.4*cm]

    if not any(k > 0 for k in sem_map):
        story.append(_p(
            'No grade records found for this student. '
            'Please contact the Registrar office.',
            fontSize=10, fontName='Helvetica-Bold',
            textColor=colors.HexColor('#cc0000'),
            spaceBefore=12, spaceAfter=12,
        ))

    for sem_num in sorted(k for k in sem_map if k > 0):
        records   = sem_map[sem_num]
        sem_label = _semester_label(sem_num, batch_year)

        story.append(_p(f'<b>{sem_label}</b>', fontSize=9, fontName='Helvetica-Bold',
                        textColor=_IST_BLUE, spaceBefore=4, spaceAfter=2))
        story.append(_course_table(records, col_w))

        sgpa, creds = _sgpa(records)
        result      = 'PASS' if sgpa >= 2.0 else 'FAIL'

        story.append(_p(
            f'SGPA : {sgpa:.2f}    Credits : {creds}    Result : <b>{result}</b>',
            fontSize=8, fontName='Helvetica-Bold', textColor=_IST_BLUE,
            spaceBefore=2, spaceAfter=4,
        ))
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 5 * mm))
    left_sig  = _sig_block('Controller of Examinations', 'Dr. Ahmad Hassan',   'Controller of Examinations')
    right_sig = _sig_block('Registrar',                  'Prof. Muhammad Ali', 'Office of the Registrar')
    sig_tbl = Table([[left_sig, right_sig]], colWidths=[_W / 2, _W / 2])
    sig_tbl.setStyle(TableStyle([
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING',    (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))
    story.append(sig_tbl)


# ── BONAFIDE CERTIFICATE ──────────────────────────────────────────────────────

def _build_bonafide(story: list, req: dict, student: dict) -> None:
    full_name  = student.get('full_name') or '—'
    roll_no    = student.get('roll_number') or '—'
    degree     = student.get('degree_title') or '—'
    program    = student.get('program') or '—'
    dept       = student.get('department') or '—'
    admission  = _fmt_date(student.get('admission_date'))
    issue_date = datetime.datetime.utcnow().strftime('%d %B %Y')

    story.append(_p('<u>BONAFIDE CERTIFICATE</u>',
                    fontSize=13, fontName='Helvetica-Bold', textColor=_IST_BLUE,
                    alignment=TA_CENTER, spaceBefore=4, spaceAfter=12))

    body = (
        f'This is to certify that <b>{full_name}</b> (Registration No. <b>{roll_no}</b>) '
        f'is a bonafide student of the <b>{UNI_NAME}</b>, Islamabad, enrolled in the '
        f'<b>{degree}</b> programme ({program}) in the Department of <b>{dept}</b>. '
        f'The student has been admitted since <b>{admission}</b> and is currently pursuing '
        f'his/her studies at this institution in good standing. '
        f'This certificate is issued on request of the student for whatever lawful purpose '
        f'it may serve. Issued on: <b>{issue_date}</b>.'
    )
    story.append(_p(body, fontSize=10, fontName='Helvetica', leading=17, spaceAfter=16))
    _bank_details_box(story)
    sig = _sig_block('Registrar', 'Prof. Muhammad Ali', 'Office of the Registrar')
    sig_outer = Table([[sig]], colWidths=[_W])
    sig_outer.setStyle(TableStyle([
        ('ALIGN',      (0, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(sig_outer)


# ── CHARACTER CERTIFICATE ─────────────────────────────────────────────────────

def _build_character(story: list, req: dict, student: dict) -> None:
    full_name  = student.get('full_name') or '—'
    roll_no    = student.get('roll_number') or '—'
    conduct    = student.get('conduct') or 'Good'
    degree     = student.get('degree_title') or '—'
    issue_date = datetime.datetime.utcnow().strftime('%d %B %Y')

    story.append(_p('<u>CHARACTER CERTIFICATE</u>',
                    fontSize=13, fontName='Helvetica-Bold', textColor=_IST_BLUE,
                    alignment=TA_CENTER, spaceBefore=4, spaceAfter=12))

    body = (
        f'This is to certify that <b>{full_name}</b> (Registration No. <b>{roll_no}</b>), '
        f'a student of <b>{degree}</b> at the <b>{UNI_NAME}</b>, Islamabad, is known to be '
        f'of <b>{conduct}</b> character and conduct. During his/her academic career at this '
        f'institution the student has maintained satisfactory behaviour and has not been '
        f'involved in any activity contrary to the rules and regulations of the university. '
        f'This certificate is issued on the basis of official records maintained in this '
        f'office. Issued on: <b>{issue_date}</b>.'
    )
    story.append(_p(body, fontSize=10, fontName='Helvetica', leading=17, spaceAfter=24))
    sig = _sig_block('Registrar', 'Prof. Muhammad Ali', 'Office of the Registrar')
    sig_outer = Table([[sig]], colWidths=[_W])
    sig_outer.setStyle(TableStyle([
        ('ALIGN',      (0, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(sig_outer)


# ── Master PDF builder ────────────────────────────────────────────────────────

def _build_pdf(req: dict, student: dict, payload: str, verify_url: str,
               grades: list = []) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
    )

    story    = []
    doc_type = (req.get('doc_type') or 'certificate').lower()
    psid     = req.get('psid', '—')

    _ist_header(story)
    _student_info_section(story, student)

    if doc_type == 'transcript':
        _build_transcript(story, req, student, payload, verify_url, grades)
    elif doc_type == 'marksheet':
        _build_marksheet(story, req, student, payload, verify_url, grades)
    elif doc_type == 'certificate':
        _build_bonafide(story, req, student)
    else:
        _build_bonafide(story, req, student)

    _verification_section(story, psid, payload, verify_url)

    doc.build(story)
    return buf.getvalue()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/requests")
async def list_all_requests(auth_user=Depends(require_admin)):
    try:
        result = (
            supabase.table("document_requests")
            .select("*, students(roll_number, users(full_name)), payments(transaction_ref, payment_proof_url, amount, status, submitted_at)")
            .order("created_at", desc=True)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            student_info = row.pop("students", None) or {}
            user_info = student_info.get("users") or {}
            row["student_name"] = user_info.get("full_name", "")
            row["roll_number"] = student_info.get("roll_number", "")
            # payments is a one-to-one join — PostgREST returns a dict, not a list
            latest = row.pop("payments", None) or {}
            if isinstance(latest, list):
                latest = latest[-1] if latest else {}
            row["transaction_ref"]      = latest.get("transaction_ref")
            row["payment_proof_url"]    = latest.get("payment_proof_url")
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

        # 3. Fetch grade records for transcript / marksheet
        grade_result = (
            supabase.table("student_semester_records")
            .select("*, courses(code, name, credit_hours, semester_number)")
            .eq("student_id", req["student_id"])
            .order("semester_number")
            .execute()
        )
        grades = grade_result.data or []

        # 4. Generate display payload (kept in document_requests for UI display)
        initials = (user_row.get("full_name") or "XX")[:2].upper()
        sig1     = secrets.token_hex(2).upper()
        sig2     = secrets.token_hex(2).upper()
        payload  = f"SECURE-V2-{req['psid']}-{initials}-{sig1}-{sig2}"

        # 5. Generate a cryptographically strong 128-bit verification token.
        #    Stored in documents.verification_token and embedded in the QR URL.
        #    16 bytes = 128 bits = 3.4 × 10^38 possible values — brute-force infeasible.
        verification_token = secrets.token_hex(16)

        # 6. Build the QR verify URL — includes both psid and token
        verify_url = f"{base_url}/verify?psid={req['psid']}&token={verification_token}"

        # 7. Build the PDF (verify_url is embedded in the QR code inside the PDF)
        pdf_bytes = _build_pdf(req, student, payload, verify_url, grades)

        # 8. Upload PDF to Supabase Storage bucket 'generated-pdfs'
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

        # 9. Real SHA-256 hash of the PDF bytes
        doc_hash = hashlib.sha256(pdf_bytes).hexdigest()

        # 10. Update document_requests: status → generated, store display payload
        supabase.table("document_requests").update({
            "status": "generated",
            "verification_payload": payload,
        }).eq("id", request_id).execute()

        # 11. Upsert generated_documents row
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

        # 12. Activity log
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


# ── Student management models ─────────────────────────────────────────────────

class CreateStudentAuthBody(BaseModel):
    email: str
    password: str
    full_name: str

class CreateStudentProfileBody(BaseModel):
    user_id: str
    roll_number: str
    department_id: Optional[str] = None
    cnic: Optional[str] = None
    dob: Optional[str] = None
    admission_date: Optional[str] = None
    degree_title: Optional[str] = None
    program: Optional[str] = None
    batch_year: Optional[int] = None
    program_duration: Optional[int] = 4
    semesters_completed: Optional[int] = 0
    cgpa: Optional[float] = 0.0
    total_credits: Optional[int] = 0
    conduct: Optional[str] = "Good"

class UpdateStudentBody(BaseModel):
    cgpa: Optional[float] = None
    semesters_completed: Optional[int] = None
    total_credits: Optional[int] = None
    department_id: Optional[str] = None
    conduct: Optional[str] = None
    program: Optional[str] = None
    batch_year: Optional[int] = None
    degree_title: Optional[str] = None
    admission_date: Optional[str] = None
    program_duration: Optional[int] = None
    cnic: Optional[str] = None
    dob: Optional[str] = None


# ── Student management routes ─────────────────────────────────────────────────

@router.get("/students")
async def list_students(auth_user=Depends(require_admin)):
    try:
        result = (
            supabase.table("students")
            .select("*, users(full_name, email, is_active), departments(name)")
            .order("created_at")
            .execute()
        )
        rows = result.data or []
        out = []
        for row in rows:
            user_info = row.pop("users", None) or {}
            dept_info = row.pop("departments", None) or {}
            row["full_name"]       = user_info.get("full_name", "")
            row["email"]           = user_info.get("email", "")
            row["is_active"]       = user_info.get("is_active", True)
            row["department_name"] = dept_info.get("name", "")
            out.append(row)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-student-auth")
async def create_student_auth(body: CreateStudentAuthBody, auth_user=Depends(require_admin)):
    try:
        res = supabase.auth.admin.create_user(
            AdminUserAttributes(
                email=body.email,
                password=body.password,
                user_metadata={"full_name": body.full_name},
                email_confirm=True,
            )
        )
        if res.user is None:
            raise HTTPException(status_code=400, detail="Failed to create auth user")

        user_id = res.user.id

        # Ensure row exists in public.users (trigger may not have fired yet)
        supabase.table("users").upsert({
            "id": user_id,
            "email": body.email,
            "full_name": body.full_name,
            "role": "student",
            "is_active": True,
        }, on_conflict="id").execute()

        return {"user_id": user_id, "email": body.email}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/create-student-profile")
async def create_student_profile(body: CreateStudentProfileBody, auth_user=Depends(require_admin)):
    try:
        insert_data = body.model_dump(exclude_none=True)
        result = supabase.table("students").insert(insert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create student profile")
        student = result.data[0]

        sems_done = int(student.get("semesters_completed") or 0)
        if sems_done > 0:
            _seed_grade_records(
                student_id=student["id"],
                department_id=student.get("department_id"),
                batch_year=int(student.get("batch_year") or 2020),
                from_sem=1,
                to_sem=sems_done,
            )

        return student
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/update-student/{student_id}")
async def update_student(student_id: str, body: UpdateStudentBody, auth_user=Depends(require_admin)):
    try:
        # Snapshot current state so we can detect a semester increase
        current_res = (
            supabase.table("students")
            .select("semesters_completed, department_id, batch_year")
            .eq("id", student_id)
            .single()
            .execute()
        )
        if not current_res.data:
            raise HTTPException(status_code=404, detail="Student not found")
        current = current_res.data

        update_data = body.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        result = supabase.table("students").update(update_data).eq("id", student_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Student not found")
        updated = result.data[0]

        old_sems = int(current.get("semesters_completed") or 0)
        new_sems = int(updated.get("semesters_completed") or 0)
        if new_sems > old_sems:
            _seed_grade_records(
                student_id=student_id,
                department_id=updated.get("department_id") or current.get("department_id"),
                batch_year=int(updated.get("batch_year") or current.get("batch_year") or 2020),
                from_sem=old_sems + 1,
                to_sem=new_sems,
            )

        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
