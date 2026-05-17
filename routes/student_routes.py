import uuid
import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from core.supabase_client import supabase
from core.security import get_current_user

router = APIRouter()


class DocumentRequestCreate(BaseModel):
    doc_type: str
    semesters: List[int]


@router.post("/request")
async def create_request(req: DocumentRequestCreate, auth_user=Depends(get_current_user)):
    # Resolve students.id from users.id (student_id FK is students.id, not users.id)
    student_result = (
        supabase.table("students")
        .select("id")
        .eq("user_id", auth_user.id)
        .limit(1)
        .execute()
    )
    if not student_result.data:
        raise HTTPException(
            status_code=404,
            detail="Student profile not found. Ensure a row exists in the students table for this user.",
        )
    student_id = student_result.data[0]["id"]

    psid = str(uuid.uuid4().int)[:9]
    amount = len(req.semesters) * 500

    new_req = {
        "psid": psid,
        "student_id": student_id,
        "doc_type": req.doc_type,
        "requested_semesters": req.semesters,
        "amount": amount,
        "status": "pending_payment",
        "created_at": datetime.datetime.utcnow().isoformat(),
    }

    try:
        result = supabase.table("document_requests").insert(new_req).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create request")

        supabase.table("activity_logs").insert({
            "action": "Document Request Created",
            "user_id": auth_user.id,
            "details": {"action": "Document Request Created", "psid": psid, "doc_type": req.doc_type},
            "created_at": datetime.datetime.utcnow().isoformat(),
        }).execute()

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-requests")
async def get_my_requests(auth_user=Depends(get_current_user)):
    try:
        # Resolve students.id first — document_requests.student_id is students.id not users.id
        student_result = (
            supabase.table("students")
            .select("id")
            .eq("user_id", auth_user.id)
            .limit(1)
            .execute()
        )
        if not student_result.data:
            return []
        student_id = student_result.data[0]["id"]

        result = (
            supabase.table("document_requests")
            .select("*")
            .eq("student_id", student_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
