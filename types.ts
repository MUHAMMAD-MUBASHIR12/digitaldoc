
export enum UserRole {
  STUDENT = 'Student',
  ADMIN = 'Admin'
}

export enum DocumentType {
  TRANSCRIPT = 'Transcript',
  MARKSHEET = 'Marksheet',
  BONAFIDE = 'Bonafide',
  CHARACTER_CERTIFICATE = 'Character Certificate',
  CERTIFICATE = 'Certificate',
}

export enum RequestStatus {
  PENDING_PAYMENT = 'Pending Payment',
  UNDER_REVIEW = 'Under Review',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  GENERATED = 'Generated'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  registrationNumber?: string;
}

export interface DocumentRequest {
  id: string;
  studentId: string;
  studentName: string;
  docType: DocumentType;
  semesters: number[];
  psid: string;
  amount: number;
  status: RequestStatus;
  createdAt: string;
  paymentProofUrl?: string;
  transactionRef?: string;
  paymentMethod?: string;
  paymentSubmittedAt?: string;
  adminNote?: string;
  verificationPayload?: string;
}

export interface StudentRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  rollNumber: string;
  cnic?: string;
  dob?: string;
  admissionDate?: string;
  departmentId?: string;
  departmentName?: string;
  degreeTitle?: string;
  program?: string;
  batchYear?: number;
  programDuration?: number;
  semestersCompleted?: number;
  cgpa?: number;
  totalCredits?: number;
  conduct?: string;
  isActive?: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

/**
 * Response shape from GET /api/verify/verify/{psid}?token={token}
 *
 * token_verified  true  → token was supplied and matched the documents row  (strong)
 * token_verified  false → no token supplied, or token did not match          (weak)
 * legacy          true  → no token was supplied; result comes from psid-only lookup
 */
export interface VerifyResponse {
  verified: boolean;
  token_verified: boolean;
  legacy: boolean;
  psid?: string;
  student_name?: string;
  student_id?: string;
  doc_type?: string;
  semesters?: number[];
  issued_at?: string;
  verification_payload?: string;
  cgpa?: number | null;
  degree_title?: string | null;
  roll_number?: string | null;
}
