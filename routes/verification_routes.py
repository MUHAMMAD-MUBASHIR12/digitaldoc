from typing import Optional
from fastapi import APIRouter, Query
from core.supabase_client import supabase

router = APIRouter()

_EMPTY = {
    "verified": False,
    "token_verified": False,
    "legacy": False,
}


def _get_student_info(student_id: str) -> dict:
    """
    document_requests.student_id → students.id (PK), not users.id.
    Returns academic fields for the verification response.
    """
    try:
        s = (
            supabase.table("students")
            .select("user_id, cgpa, degree_title, roll_number")
            .eq("id", student_id)
            .limit(1)
            .execute()
        )
        if not s.data:
            return {"full_name": None, "user_id": None, "cgpa": None, "degree_title": None, "roll_number": None}
        row = s.data[0]
        user_id = row["user_id"]

        u = (
            supabase.table("users")
            .select("full_name")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return {
            "full_name": u.data[0]["full_name"] if u.data else None,
            "user_id": user_id,
            "cgpa": row.get("cgpa"),
            "degree_title": row.get("degree_title"),
            "roll_number": row.get("roll_number"),
        }
    except Exception:
        return {"full_name": None, "user_id": None, "cgpa": None, "degree_title": None, "roll_number": None}


@router.get("/verify/{psid}")
async def verify_document(
    psid: str,
    token: Optional[str] = Query(default=None),
):
    """
    Public document verification endpoint. Never raises an HTTP exception —
    always returns a JSON response so the frontend never spins indefinitely.

    STRONG (token provided):
      Matches generated_documents WHERE psid = ? AND verification_token = ?
      Returns verified=true, token_verified=true only on exact match.

    LEGACY (no token):
      Matches document_requests WHERE psid = ? AND status = 'generated'.
      Returns verified=true, token_verified=false, legacy=true.
    """
    try:
        if token:
            # ── Strong path ────────────────────────────────────────────────────
            try:
                doc = (
                    supabase.table("generated_documents")
                    .select("psid, sha256_hash, pdf_url, verification_token")
                    .eq("psid", psid)
                    .eq("verification_token", token)
                    .limit(1)
                    .execute()
                )
            except Exception:
                return {**_EMPTY, "legacy": False}

            if not doc.data:
                # Token supplied but did not match — do NOT fall back to legacy.
                return {**_EMPTY, "legacy": False}

            try:
                req = (
                    supabase.table("document_requests")
                    .select("student_id, doc_type, requested_semesters, created_at, verification_payload")
                    .eq("psid", psid)
                    .eq("status", "generated")
                    .limit(1)
                    .execute()
                )
                row = req.data[0] if req.data else {}
            except Exception:
                row = {}

            info = _get_student_info(row["student_id"]) if row.get("student_id") else {}

            return {
                "verified": True,
                "token_verified": True,
                "legacy": False,
                "psid": psid,
                "student_name": info.get("full_name"),
                "student_id": info.get("user_id"),
                "doc_type": row.get("doc_type"),
                "semesters": row.get("requested_semesters") or [],
                "issued_at": row.get("created_at"),
                "verification_payload": row.get("verification_payload"),
                "cgpa": info.get("cgpa"),
                "degree_title": info.get("degree_title"),
                "roll_number": info.get("roll_number"),
            }

        else:
            # ── Legacy path ────────────────────────────────────────────────────
            try:
                req = (
                    supabase.table("document_requests")
                    .select("student_id, doc_type, requested_semesters, created_at, verification_payload")
                    .eq("psid", psid)
                    .eq("status", "generated")
                    .limit(1)
                    .execute()
                )
            except Exception:
                return {**_EMPTY, "legacy": True}

            if not req.data:
                return {**_EMPTY, "legacy": True}

            row = req.data[0]
            info = _get_student_info(row["student_id"]) if row.get("student_id") else {}

            return {
                "verified": True,
                "token_verified": False,
                "legacy": True,
                "psid": psid,
                "student_name": info.get("full_name"),
                "student_id": info.get("user_id"),
                "doc_type": row.get("doc_type"),
                "semesters": row.get("requested_semesters") or [],
                "issued_at": row.get("created_at"),
                "verification_payload": row.get("verification_payload"),
                "cgpa": info.get("cgpa"),
                "degree_title": info.get("degree_title"),
                "roll_number": info.get("roll_number"),
            }

    except Exception:
        return {**_EMPTY, "legacy": bool(not token)}
