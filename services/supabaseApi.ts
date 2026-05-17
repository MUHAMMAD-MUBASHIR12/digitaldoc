import { supabase } from './supabase';
import { DocumentRequest, DocumentType, RequestStatus, ActivityLog, User } from '../types';

const STATUS_MAP: Record<string, RequestStatus> = {
  pending_payment: RequestStatus.PENDING_PAYMENT,
  under_review:    RequestStatus.UNDER_REVIEW,
  approved:        RequestStatus.APPROVED,
  rejected:        RequestStatus.REJECTED,
  generated:       RequestStatus.GENERATED,
};

function mapRow(row: Record<string, unknown>): DocumentRequest {
  const rawStatus = row.status as string;
  return {
    id:                  row.id as string,
    studentId:           row.student_id as string,
    studentName:         (row.student_name as string) || '',
    docType:             row.doc_type as DocumentType,
    semesters:           (row.requested_semesters as number[]) || [],
    psid:                row.psid as string,
    amount:              row.amount as number,
    status:              STATUS_MAP[rawStatus] ?? (rawStatus as RequestStatus),
    createdAt:           row.created_at as string,
    paymentProofUrl:     row.payment_proof_url    as string | undefined,
    transactionRef:      row.transaction_ref      as string | undefined,
    paymentMethod:       row.payment_method       as string | undefined,
    paymentSubmittedAt:  row.payment_submitted_at as string | undefined,
    adminNote:           row.admin_note           as string | undefined,
    verificationPayload: row.verification_payload as string | undefined,
  };
}

export const supabaseApi = {

  // ── getRequests ─────────────────────────────────────────────────────────────
  getRequests: async (studentUserId?: string): Promise<DocumentRequest[]> => {
    try {
      // Step 1: fetch requests with student name join.
      // The students→users nested join works (FK is defined).
      // The payments nested join is NOT used here because PostgREST nested
      // selects require a DB-level FK constraint on payments.request_id which
      // may not be declared. We fetch payments separately below instead.
      let query = supabase
        .from('document_requests')
        .select('*, students(users(full_name))')
        .order('created_at', { ascending: false });

      if (studentUserId) {
        const { data: studentRow } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', studentUserId)
          .limit(1)
          .maybeSingle();
        if (!studentRow) return [];
        query = query.eq('student_id', (studentRow as Record<string, unknown>).id as string);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Record<string, unknown>[];
      if (rows.length === 0) return [];

      // Step 2: fetch all payments for these request IDs in one flat query.
      // Using .in() avoids the FK-join requirement entirely.
      const requestIds = rows.map(r => r.id as string);
      const { data: allPayments } = await supabase
        .from('payments')
        .select('request_id, transaction_ref, payment_proof_url, amount, method, submitted_at')
        .in('request_id', requestIds);

      // Build map: request_id → latest payment (by submitted_at, ISO strings sort correctly)
      const paymentMap = new Map<string, Record<string, unknown>>();
      for (const p of ((allPayments || []) as Record<string, unknown>[])) {
        const rid = p.request_id as string;
        const existing = paymentMap.get(rid);
        if (
          !existing ||
          ((p.submitted_at as string) || '') > ((existing.submitted_at as string) || '')
        ) {
          paymentMap.set(rid, p);
        }
      }

      return rows.map(row => {
        const { students: nested, ...rest } = row;
        const s = nested as Record<string, unknown> | null | undefined;
        const u = s?.users as Record<string, unknown> | null | undefined;
        const payment = paymentMap.get(rest.id as string) ?? null;
        return mapRow({
          ...rest,
          student_name:         (u?.full_name as string) || '',
          payment_proof_url:    payment?.payment_proof_url ?? undefined,
          transaction_ref:      payment?.transaction_ref   ?? undefined,
          payment_method:       payment?.method            ?? undefined,
          payment_submitted_at: payment?.submitted_at      ?? undefined,
        });
      });
    } catch (err) {
      console.error('supabaseApi.getRequests:', err);
      return [];
    }
  },

  // ── getLogs ──────────────────────────────────────────────────────────────────
  getLogs: async (): Promise<ActivityLog[]> => {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const logs = (data || []) as Record<string, unknown>[];

      const userIds = [...new Set(logs.map(l => l.user_id as string).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds);
        for (const u of (users || []) as Record<string, unknown>[]) {
          nameMap[u.id as string] = u.full_name as string;
        }
      }

      return logs.map(log => {
        const details = log.details;
        const detailsStr = details == null
          ? ''
          : typeof details === 'object'
            ? JSON.stringify(details)
            : String(details);
        return {
          id:        log.id as string,
          timestamp: log.created_at as string,
          user:      nameMap[log.user_id as string] || (log.user_id as string) || 'System',
          action:    log.action as string,
          details:   detailsStr,
        };
      });
    } catch (err) {
      console.error('supabaseApi.getLogs:', err);
      return [];
    }
  },

  // ── createRequest ────────────────────────────────────────────────────────────
  // Throws on failure so the caller can display the real error message.
  createRequest: async (
    student: User,
    docType: DocumentType,
    semesters: number[],
  ): Promise<DocumentRequest> => {
    // 1. Resolve students.id (document_requests.student_id is students.id, not users.id)
    const { data: studentRow, error: studentErr } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', student.id)
      .limit(1)
      .maybeSingle();

    if (studentErr) throw new Error(`Student lookup failed: ${studentErr.message}`);
    if (!studentRow) throw new Error('No student profile found for this account. Ask an admin to create one.');

    const studentId = (studentRow as Record<string, unknown>).id as string;
    const psid   = Math.floor(100000000 + Math.random() * 900000000).toString();
    const amount = semesters.length * 500;

    // 2. Insert the request
    // doc_type is sent lowercase to match the PostgreSQL enum (marksheet / transcript / certificate)
    const { data, error } = await supabase
      .from('document_requests')
      .insert({
        psid,
        student_id:          studentId,
        doc_type:            docType.toLowerCase(),
        requested_semesters: semesters,
        amount,
        status:              'pending_payment',
        created_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`${error.message}${error.code ? ` (${error.code})` : ''}`);

    // 3. Activity log — fire and forget, non-fatal
    supabase.from('activity_logs').insert({
      action:     'Document Request Created',
      user_id:    student.id,
      details:    { psid, doc_type: docType },
      created_at: new Date().toISOString(),
    });

    return mapRow(data as Record<string, unknown>);
  },

  // ── uploadPayment ────────────────────────────────────────────────────────────
  // Throws on failure so the caller can display the real error.
  uploadPayment: async (
    requestId:      string,
    file:           File,
    userId:         string,
    transactionRef: string,
  ): Promise<void> => {
    // 1. Upload file to Storage
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${requestId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { upsert: true });
    if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('payment-proofs').getPublicUrl(path);
    const proofUrl = urlData.publicUrl;

    // 2. Update document_requests status to under_review
    const { error: statusError } = await supabase
      .from('document_requests')
      .update({ status: 'under_review' })
      .eq('id', requestId);
    if (statusError) throw new Error(`Status update failed: ${statusError.message}`);

    // 3. Fetch psid + amount for the payments row
    const { data: reqRow } = await supabase
      .from('document_requests')
      .select('psid, amount')
      .eq('id', requestId)
      .maybeSingle();
    const req = reqRow as Record<string, unknown> | null;

    // 4. Insert payments row
    const { error: payError } = await supabase.from('payments').insert({
      request_id:        requestId,
      psid:              req?.psid  ?? null,
      amount:            req?.amount ?? null,
      transaction_ref:   transactionRef,
      payment_proof_url: proofUrl,
      status:            'submitted',
      submitted_at:      new Date().toISOString(),
    });
    if (payError) throw new Error(`Payment record failed: ${payError.message}`);

    // 5. Activity log — fire and forget
    supabase.from('activity_logs').insert({
      action:     'Payment Proof Uploaded',
      user_id:    userId,
      details:    { request_id: requestId, transaction_ref: transactionRef },
      created_at: new Date().toISOString(),
    });
  },

  // ── rejectRequest (fallback, not called from AdminDashboard) ─────────────────
  rejectRequest: async (requestId: string, reason: string): Promise<void> => {
    const { error } = await supabase
      .from('document_requests')
      .update({ status: 'rejected', admin_note: reason })
      .eq('id', requestId);
    if (error) throw error;
  },

  // ── getStudentPublicInfo ──────────────────────────────────────────────────────
  getStudentPublicInfo: async (
    studentUserId: string,
  ): Promise<{ cgpa: number | null; degree_title: string | null; roll_number: string | null } | null> => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('cgpa, degree_title, roll_number')
        .eq('user_id', studentUserId)
        .maybeSingle();
      if (error) return null;
      const row = data as Record<string, unknown> | null;
      if (!row) return null;
      return {
        cgpa:         (row.cgpa         as number | null) ?? null,
        degree_title: (row.degree_title as string | null) ?? null,
        roll_number:  (row.roll_number  as string | null) ?? null,
      };
    } catch {
      return null;
    }
  },

  // ── getPdfUrl ────────────────────────────────────────────────────────────────
  getPdfUrl: async (psid: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('pdf_url')
        .eq('psid', psid)
        .maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown> | null)?.pdf_url as string | null ?? null;
    } catch (err) {
      console.error('supabaseApi.getPdfUrl:', err);
      return null;
    }
  },

  // ── verifyPsid (legacy, kept for reference) ──────────────────────────────────
  verifyPsid: async (psid: string): Promise<DocumentRequest | null> => {
    try {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
        .eq('psid', psid)
        .eq('status', 'generated')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    } catch (err) {
      console.error('supabaseApi.verifyPsid:', err);
      return null;
    }
  },
};
