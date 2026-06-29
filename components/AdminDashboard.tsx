import React, { useState, useEffect, useRef } from 'react';
import { User, DocumentRequest, RequestStatus, ActivityLog, StudentRecord } from '../types';
import { supabaseApi } from '../services/supabaseApi';
import { api } from '../services/api';

interface Props {
  user: User;
}


const BLANK_ADD_FORM = {
  fullName: '', email: '', password: '',
  rollNumber: '', cnic: '', dob: '', departmentId: '',
  degreeTitle: '', program: '', batchYear: '',
  admissionDate: '', programDuration: '4',
  semestersCompleted: '0', cgpa: '0.00',
  totalCredits: '0', conduct: 'Good',
};

type AddForm = typeof BLANK_ADD_FORM;

type EditForm = {
  departmentId: string; degreeTitle: string; program: string;
  batchYear: string; admissionDate: string; programDuration: string;
  semestersCompleted: string; cgpa: string; totalCredits: string;
  conduct: string; cnic: string; dob: string;
};

const BLANK_EDIT_FORM: EditForm = {
  departmentId: '', degreeTitle: '', program: '',
  batchYear: '', admissionDate: '', programDuration: '4',
  semestersCompleted: '0', cgpa: '0.00',
  totalCredits: '0', conduct: 'Good', cnic: '', dob: '',
};

// ── PaymentImage ──────────────────────────────────────────────────────────────
const PaymentImage: React.FC<{ url: string }> = ({ url }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);

  if (failed) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <i className="fas fa-image mr-1.5"></i>Payment Screenshot
        </p>
        <div className="w-full rounded-2xl border border-dashed border-rose-200 bg-rose-50 h-32 flex flex-col items-center justify-center gap-2">
          <i className="fas fa-triangle-exclamation text-rose-300 text-2xl"></i>
          <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">Image failed to load</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-500 hover:text-blue-700 font-bold uppercase tracking-widest underline">
            Open URL directly
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <i className="fas fa-image mr-1.5"></i>Payment Screenshot
        </p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1.5 transition-colors">
          <i className="fas fa-up-right-from-square text-[9px]"></i>Open Full Size
        </a>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt="Payment proof"
          className="w-full rounded-2xl border border-slate-200 object-contain bg-slate-50 max-h-80 hover:border-blue-300 transition-colors cursor-zoom-in"
          onError={() => setFailed(true)}
        />
      </a>
    </div>
  );
};

// ── Field helper ──────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full h-12 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/10 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-700 text-sm font-medium";
const selectCls = inputCls + " cursor-pointer";

// ── AdminDashboard ────────────────────────────────────────────────────────────
const AdminDashboard: React.FC<Props> = ({ user }) => {
  // Ledger state
  const [requests, setRequests]           = useState<DocumentRequest[]>([]);
  const [logs, setLogs]                   = useState<ActivityLog[]>([]);
  const [filter, setFilter]               = useState<RequestStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading]         = useState(true);
  const [verifyingId, setVerifyingId]     = useState<string | null>(null);
  const [approveError, setApproveError]   = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [isRejecting, setIsRejecting]     = useState(false);
  const [rejectError, setRejectError]     = useState<string | null>(null);
  const [paymentModalReq, setPaymentModalReq] = useState<DocumentRequest | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'ledger' | 'students'>('ledger');

  // Students state
  const [students, setStudents]           = useState<StudentRecord[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Departments (loaded from DB)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Add modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [addForm, setAddForm]             = useState<AddForm>(BLANK_ADD_FORM);
  const [addError, setAddError]           = useState<string | null>(null);
  const [addLoading, setAddLoading]       = useState(false);
  const [addSuccess, setAddSuccess]       = useState(false);
  const [addWarmingUp, setAddWarmingUp]   = useState(false);

  // Edit modal
  const [editStudent, setEditStudent]     = useState<StudentRecord | null>(null);
  const [editForm, setEditForm]           = useState<EditForm>(BLANK_EDIT_FORM);
  const [editError, setEditError]         = useState<string | null>(null);
  const [editLoading, setEditLoading]     = useState(false);
  const [editSuccess, setEditSuccess]     = useState(false);

  const rejectTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    refreshData();
    supabaseApi.getDepartments().then(setDepartments);
  }, []);

  useEffect(() => {
    if (rejectModalId && rejectTextareaRef.current) {
      rejectTextareaRef.current.focus();
    }
  }, [rejectModalId]);

  useEffect(() => {
    if (activeTab === 'students') loadStudents();
  }, [activeTab]);

  // ── Ledger handlers ─────────────────────────────────────────────────────────
  const refreshData = async () => {
    setIsLoading(true);
    const [allRequests, allLogs] = await Promise.all([
      supabaseApi.getRequests(),
      supabaseApi.getLogs(),
    ]);
    setRequests(allRequests);
    setLogs(allLogs);
    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    setVerifyingId(id);
    setApproveError(null);
    try {
      await api.approveRequest(id, user.name);
      await refreshData();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Backend unavailable. Check server is running.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleReject = (id: string) => {
    setRejectReason('');
    setRejectError(null);
    setRejectModalId(id);
  };

  const handleRejectSubmit = async () => {
    if (!rejectModalId || !rejectReason.trim()) return;
    setIsRejecting(true);
    setRejectError(null);
    try {
      await api.rejectRequest(rejectModalId, user.name, rejectReason.trim());
      setRejectModalId(null);
      await refreshData();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : 'Submission failed. Check connection and try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  // ── Student handlers ────────────────────────────────────────────────────────
  const loadStudents = async () => {
    setStudentsLoading(true);
    const data = await supabaseApi.getStudents();
    setStudents(data);
    setStudentsLoading(false);
  };

  const openAddModal = () => {
    setAddForm(BLANK_ADD_FORM);
    setAddError(null);
    setAddSuccess(false);
    setShowAddModal(true);
  };

  const validateAddForm = (): string | null => {
    if (!addForm.fullName.trim())  return 'Full name is required.';
    if (!addForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addForm.email))
      return 'A valid email address is required.';
    if (addForm.password.length < 8) return 'Password must be at least 8 characters.';
    if (!addForm.rollNumber.trim()) return 'Roll number is required.';
    if (!addForm.departmentId) return 'Please select a department.';
    if (!addForm.degreeTitle.trim()) return 'Degree title is required.';
    if (!addForm.program.trim()) return 'Program is required.';
    if (!addForm.batchYear) return 'Batch year is required.';
    const cgpa = parseFloat(addForm.cgpa);
    if (isNaN(cgpa) || cgpa < 0 || cgpa > 4) return 'CGPA must be between 0.00 and 4.00.';
    const sem = parseInt(addForm.semestersCompleted);
    if (isNaN(sem) || sem < 0 || sem > 8) return 'Semesters completed must be 0–8.';
    return null;
  };

  const handleAddStudent = async () => {
    console.log('handleAddStudent called');
    const err = validateAddForm();
    if (err) {
      setAddError(err);
      return;
    }
    setAddLoading(true);
    setAddError(null);
    setAddWarmingUp(false);
    const warmTimer = setTimeout(() => {
      if (!api.isLikelyAwake()) setAddWarmingUp(true);
    }, 5000);

    try {
      // Step 1: create auth account
      const result = await api.createStudentAuth(
        addForm.email.trim().toLowerCase(),
        addForm.password,
        addForm.fullName.trim(),
      );
      const user_id = result.user_id;
      console.log('auth created:', user_id);

      // Step 2: create academic profile
      await api.createStudentProfile({
        user_id,
        roll_number:          addForm.rollNumber.trim(),
        department_id:        addForm.departmentId,
        degree_title:         addForm.degreeTitle.trim()  || 'Bachelor of Science',
        program:              addForm.program.trim()      || 'General',
        batch_year:           addForm.batchYear ? parseInt(addForm.batchYear) : new Date().getFullYear(),
        program_duration:     parseInt(addForm.programDuration) || 4,
        semesters_completed:  parseInt(addForm.semestersCompleted) || 0,
        cgpa:                 parseFloat(addForm.cgpa) || 0,
        total_credits:        parseInt(addForm.totalCredits) || 0,
        conduct:              addForm.conduct,
        cnic:                 addForm.cnic.trim()   || undefined,
        dob:                  addForm.dob           || undefined,
        admission_date:       addForm.admissionDate || undefined,
      });
      setAddSuccess(true);
      await loadStudents();
      setTimeout(() => { setShowAddModal(false); setAddSuccess(false); }, 1400);
    } catch (err) {
      console.log('error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setAddError(message || 'An unknown error occurred');
      setTimeout(() => { document.querySelector('[data-add-error]')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    } finally {
      console.log('finally called');
      clearTimeout(warmTimer);
      setAddWarmingUp(false);
      setAddLoading(false);
    }
  };

  const openEditModal = (s: StudentRecord) => {
    setEditStudent(s);
    setEditForm({
      departmentId:        s.departmentId        ?? '',
      degreeTitle:         s.degreeTitle         ?? '',
      program:             s.program             ?? '',
      batchYear:           s.batchYear           != null ? String(s.batchYear)           : '',
      admissionDate:       s.admissionDate        ?? '',
      programDuration:     s.programDuration     != null ? String(s.programDuration)     : '4',
      semestersCompleted:  s.semestersCompleted  != null ? String(s.semestersCompleted)  : '0',
      cgpa:                s.cgpa                != null ? s.cgpa.toFixed(2)             : '0.00',
      totalCredits:        s.totalCredits        != null ? String(s.totalCredits)        : '0',
      conduct:             s.conduct             ?? 'Good',
      cnic:                s.cnic               ?? '',
      dob:                 s.dob                ?? '',
    });
    setEditError(null);
    setEditSuccess(false);
  };

  const validateEditForm = (): string | null => {
    const cgpa = parseFloat(editForm.cgpa);
    if (isNaN(cgpa) || cgpa < 0 || cgpa > 4) return 'CGPA must be between 0.00 and 4.00.';
    const sem = parseInt(editForm.semestersCompleted);
    if (isNaN(sem) || sem < 0 || sem > 8) return 'Semesters completed must be 0–8.';
    return null;
  };

  const handleUpdateStudent = async () => {
    if (!editStudent) return;
    const err = validateEditForm();
    if (err) { setEditError(err); return; }
    setEditLoading(true);
    setEditError(null);
    try {
      await api.updateStudent(editStudent.id, {
        department_id:       editForm.departmentId    || undefined,
        degree_title:        editForm.degreeTitle.trim()  || undefined,
        program:             editForm.program.trim()       || undefined,
        batch_year:          editForm.batchYear  ? parseInt(editForm.batchYear)  : undefined,
        admission_date:      editForm.admissionDate || undefined,
        program_duration:    parseInt(editForm.programDuration) || 4,
        semesters_completed: parseInt(editForm.semestersCompleted) || 0,
        cgpa:                parseFloat(editForm.cgpa) || 0,
        total_credits:       parseInt(editForm.totalCredits) || 0,
        conduct:             editForm.conduct,
        cnic:                editForm.cnic.trim()  || undefined,
        dob:                 editForm.dob          || undefined,
      });
      setEditSuccess(true);
      await loadStudents();
      setTimeout(() => { setEditStudent(null); setEditSuccess(false); }, 1400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setEditError(msg || 'Failed to update student.');
    } finally {
      setEditLoading(false);
    }
  };

  const filteredRequests = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);
  const hasPayment = (req: DocumentRequest) => !!(req.transactionRef || req.paymentProofUrl);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 animate-fadeIn px-2 md:px-0">

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
            <span>Registrar Authority Console</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight text-blue-600">Ledger Administration</h1>
          <p className="text-slate-500 text-sm font-medium">Monitoring and validating automated document issuance stream.</p>
        </div>
        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 text-center">Audit Status</p>
            <p className="text-[11px] font-bold text-slate-800 flex items-center justify-center">
              <i className="fas fa-shield-check mr-2 text-blue-600"></i>Cryptographic Active
            </p>
          </div>
        </div>
      </header>

      {/* Tab switcher */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
            activeTab === 'ledger'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <i className="fas fa-list-ul text-xs"></i>Ledger
        </button>
        <button
          onClick={() => setActiveTab('students')}
          className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
            activeTab === 'students'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
              : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <i className="fas fa-users text-xs"></i>Students
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LEDGER TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Pending Review',   val: requests.filter(r => r.status === RequestStatus.UNDER_REVIEW).length,    icon: 'fa-shield-halved',      iconCls: 'bg-rose-50 text-rose-500 border-rose-100',     border: 'border-l-4 border-l-rose-400' },
              { label: 'Awaiting Payment', val: requests.filter(r => r.status === RequestStatus.PENDING_PAYMENT).length, icon: 'fa-clock',              iconCls: 'bg-amber-50 text-amber-500 border-amber-100',   border: 'border-l-4 border-l-amber-400' },
              { label: 'Documents Issued', val: requests.filter(r => r.status === RequestStatus.GENERATED).length,       icon: 'fa-file-circle-check',  iconCls: 'bg-emerald-50 text-emerald-500 border-emerald-100', border: 'border-l-4 border-l-emerald-400' },
              { label: 'Audit Rejections', val: requests.filter(r => r.status === RequestStatus.REJECTED).length,        icon: 'fa-ban',                iconCls: 'bg-slate-50 text-slate-400 border-slate-200',   border: 'border-l-4 border-l-slate-400' },
            ].map((stat, i) => (
              <div key={i} className={`bg-white p-3 md:p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-3 md:space-x-4 ${stat.border}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${stat.iconCls}`}>
                  <i className={`fas ${stat.icon}`}></i>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{stat.val}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
            {/* Application Queue */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                  <i className="fas fa-list-ul mr-3 text-blue-400"></i>Application Queue
                </h2>
                <select
                  className="w-full sm:w-auto text-[10px] font-bold uppercase tracking-widest border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-600 bg-white shadow-sm transition-colors"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as RequestStatus | 'ALL')}
                >
                  <option value="ALL">Display All</option>
                  <option value={RequestStatus.UNDER_REVIEW}>Awaiting Review</option>
                  <option value={RequestStatus.PENDING_PAYMENT}>Pending Payment</option>
                  <option value={RequestStatus.GENERATED}>Generated</option>
                </select>
              </div>

              {approveError && (
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4">
                  <i className="fas fa-circle-exclamation text-rose-500 mt-0.5 flex-shrink-0"></i>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-0.5">Ledger Post Failed</p>
                    <p className="text-xs text-rose-600 font-medium break-words">{approveError}</p>
                  </div>
                  <button onClick={() => setApproveError(null)} className="text-rose-400 hover:text-rose-600 flex-shrink-0">
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              )}

              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
                {isLoading ? (
                  <div className="p-20 text-center"><i className="fas fa-spinner fa-spin text-blue-200 text-2xl"></i></div>
                ) : filteredRequests.length === 0 ? (
                  <div className="p-20 text-center space-y-4">
                    <i className="fas fa-folder-open text-slate-100 text-5xl"></i>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No matching applications</p>
                  </div>
                ) : filteredRequests.map(req => (
                  <div key={req.id} className="p-6 md:p-8 hover:bg-slate-50/30 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                      <div className="flex items-start space-x-4 min-w-0">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 border border-slate-100">
                          <i className="fas fa-user-tie text-blue-300"></i>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-bold text-slate-900 tracking-tight">{req.studentName}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${
                              req.status === RequestStatus.UNDER_REVIEW ? 'bg-blue-600 text-white border-blue-600' :
                              req.status === RequestStatus.GENERATED    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              req.status === RequestStatus.REJECTED     ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>{req.status}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            {req.docType} &bull; Cycles: {req.semesters.join(', ')}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              ID: {req.psid}
                            </span>
                            <span className="text-[10px] font-bold text-blue-600">PKR {req.amount.toLocaleString()}</span>
                            {req.createdAt && (
                              <span className="hidden sm:inline text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                                {new Date(req.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {req.status === RequestStatus.UNDER_REVIEW && (
                        <div className="flex flex-col gap-2.5 w-full md:w-auto md:min-w-[220px] flex-shrink-0">
                          {hasPayment(req) && (
                            <button
                              onClick={() => setPaymentModalReq(req)}
                              className="w-full bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                            >
                              <i className="fas fa-receipt text-blue-400 text-xs"></i>View Payment
                            </button>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              disabled={verifyingId !== null}
                              onClick={() => handleReject(req.id)}
                              className="w-full sm:flex-1 py-3.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              <i className="fas fa-times-circle text-xs"></i>Reject
                            </button>
                            <button
                              disabled={verifyingId !== null}
                              onClick={() => handleApprove(req.id)}
                              className="w-full sm:flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl font-bold shadow-xl shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {verifyingId === req.id
                                ? <i className="fas fa-spinner fa-spin text-xs"></i>
                                : <i className="fas fa-check-double text-xs"></i>
                              }
                              <span className="text-[10px] uppercase tracking-widest">Verify &amp; Post</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {req.status === RequestStatus.REJECTED && req.adminNote && (
                      <div className="mt-4 flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-3">
                        <i className="fas fa-comment-slash text-rose-300 flex-shrink-0 mt-0.5 text-xs"></i>
                        <p className="text-[10px] font-bold text-rose-700 leading-relaxed">{req.adminNote}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-10 text-white relative overflow-hidden shadow-2xl border border-blue-900/50">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-8 flex items-center text-slate-400">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-pulse"></span>Real-time Audit Log
                </h3>
                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {logs.length === 0 && (
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center py-10">No recent activity</p>
                  )}
                  {logs.map(log => (
                    <div key={log.id} className="relative pl-6 border-l border-blue-500/30 pb-4">
                      <div className="absolute -left-[3.5px] top-1 w-1.5 h-1.5 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.6)]"></div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                        <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="text-blue-400 uppercase tracking-tighter">{log.user}</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-200 leading-tight uppercase tracking-wide">{log.action}</p>
                      <p className="text-[9px] text-slate-500 italic mt-1">{log.details}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center">
                  <i className="fas fa-network-wired mr-3 text-blue-400"></i>Ledger Summary
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Total Requests', val: requests.length },
                    { label: 'Pending',  val: requests.filter(r => r.status === RequestStatus.PENDING_PAYMENT || r.status === RequestStatus.UNDER_REVIEW).length },
                    { label: 'Approved', val: requests.filter(r => r.status === RequestStatus.GENERATED).length },
                    { label: 'Rejected', val: requests.filter(r => r.status === RequestStatus.REJECTED).length },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
                      <span className="text-[9px] font-mono font-bold text-blue-700">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STUDENTS TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
              <i className="fas fa-users mr-3 text-blue-400"></i>Student Registry
            </h2>
            <button
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-200"
            >
              <i className="fas fa-user-plus text-xs"></i>Add New Student
            </button>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            {studentsLoading ? (
              <div className="p-20 text-center"><i className="fas fa-spinner fa-spin text-blue-200 text-2xl"></i></div>
            ) : students.length === 0 ? (
              <div className="p-20 text-center space-y-4">
                <i className="fas fa-user-slash text-slate-100 text-5xl"></i>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No students found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Full Name</th>
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Roll No.</th>
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Department</th>
                      <th className="hidden md:table-cell px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Program</th>
                      <th className="hidden md:table-cell px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Sem.</th>
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">CGPA</th>
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                      <th className="px-5 py-4 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {students.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-bold text-slate-900 text-sm leading-tight">{s.fullName || '—'}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{s.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">{s.rollNumber || '—'}</span>
                        </td>
                        <td className="px-5 py-4 text-[11px] font-medium text-slate-600 whitespace-nowrap">{s.departmentName || '—'}</td>
                        <td className="hidden md:table-cell px-5 py-4 text-[11px] font-medium text-slate-600 max-w-[140px] truncate">{s.program || '—'}</td>
                        <td className="hidden md:table-cell px-5 py-4 text-center">
                          <span className="text-[11px] font-black text-slate-700">{s.semestersCompleted ?? '—'}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`text-[11px] font-black ${(s.cgpa ?? 0) >= 3 ? 'text-emerald-600' : (s.cgpa ?? 0) >= 2 ? 'text-blue-600' : 'text-rose-600'}`}>
                            {s.cgpa != null ? s.cgpa.toFixed(2) : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                            s.isActive !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-600 border-rose-200'
                          }`}>
                            {s.isActive !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => openEditModal(s)}
                            className="px-4 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95"
                          >
                            <i className="fas fa-pen text-[9px]"></i>Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ADD STUDENT MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Add New Student</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Create auth account and academic profile</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90 flex-shrink-0 ml-4"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Body */}
            <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* Section 1: Account */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <i className="fas fa-key text-[9px]"></i>Account Credentials
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Full Name *">
                      <input className={inputCls} placeholder="Muhammad Ali" value={addForm.fullName}
                        onChange={e => setAddForm(f => ({ ...f, fullName: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Email Address *">
                    <input className={inputCls} type="email" placeholder="student@university.edu" value={addForm.email}
                      onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
                  </Field>
                  <Field label="Password *">
                    <input className={inputCls} type="password" placeholder="Min. 8 characters" value={addForm.password}
                      onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
                  </Field>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100"></div>

              {/* Section 2: Academic Profile */}
              <div className="space-y-5">
                <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <i className="fas fa-graduation-cap text-[9px]"></i>Academic Profile
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Roll Number *">
                    <input className={inputCls} placeholder="CS-2024-001" value={addForm.rollNumber}
                      onChange={e => setAddForm(f => ({ ...f, rollNumber: e.target.value }))} />
                  </Field>
                  <Field label="CNIC">
                    <input className={inputCls} placeholder="35201-1234567-1" value={addForm.cnic}
                      onChange={e => setAddForm(f => ({ ...f, cnic: e.target.value }))} />
                  </Field>
                  <Field label="Date of Birth">
                    <input className={inputCls} type="date" value={addForm.dob}
                      onChange={e => setAddForm(f => ({ ...f, dob: e.target.value }))} />
                  </Field>
                  <Field label="Admission Date">
                    <input className={inputCls} type="date" value={addForm.admissionDate}
                      onChange={e => setAddForm(f => ({ ...f, admissionDate: e.target.value }))} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Department">
                      <select className={selectCls} value={addForm.departmentId}
                        onChange={e => setAddForm(f => ({ ...f, departmentId: e.target.value }))}>
                        <option value="">— Select Department —</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Degree Title">
                    <input className={inputCls} placeholder="Bachelor of Science" value={addForm.degreeTitle}
                      onChange={e => setAddForm(f => ({ ...f, degreeTitle: e.target.value }))} />
                  </Field>
                  <Field label="Program">
                    <input className={inputCls} placeholder="BS Computer Science" value={addForm.program}
                      onChange={e => setAddForm(f => ({ ...f, program: e.target.value }))} />
                  </Field>
                  <Field label="Batch Year">
                    <input className={inputCls} type="number" placeholder="2024" value={addForm.batchYear}
                      onChange={e => setAddForm(f => ({ ...f, batchYear: e.target.value }))} />
                  </Field>
                  <Field label="Program Duration (years)">
                    <select className={selectCls} value={addForm.programDuration}
                      onChange={e => setAddForm(f => ({ ...f, programDuration: e.target.value }))}>
                      <option value="2">2 Years</option>
                      <option value="3">3 Years</option>
                      <option value="4">4 Years</option>
                    </select>
                  </Field>
                  <Field label="Semesters Completed">
                    <input className={inputCls} type="number" min="0" max="8" value={addForm.semestersCompleted}
                      onChange={e => setAddForm(f => ({ ...f, semestersCompleted: e.target.value }))} />
                  </Field>
                  <Field label="CGPA (0.00 – 4.00)">
                    <input className={inputCls} type="number" step="0.01" min="0" max="4" value={addForm.cgpa}
                      onChange={e => setAddForm(f => ({ ...f, cgpa: e.target.value }))} />
                  </Field>
                  <Field label="Total Credits">
                    <input className={inputCls} type="number" min="0" value={addForm.totalCredits}
                      onChange={e => setAddForm(f => ({ ...f, totalCredits: e.target.value }))} />
                  </Field>
                  <Field label="Conduct">
                    <select className={selectCls} value={addForm.conduct}
                      onChange={e => setAddForm(f => ({ ...f, conduct: e.target.value }))}>
                      <option value="Good">Good</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Satisfactory">Satisfactory</option>
                    </select>
                  </Field>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex-shrink-0 space-y-3">
              {addWarmingUp && !addError && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <i className="fas fa-circle-notch fa-spin text-amber-500 flex-shrink-0"></i>
                  <span className="text-amber-700 text-xs font-bold leading-snug">Server is warming up — this can take up to 60s on first use. Please wait…</span>
                </div>
              )}
              {addError && (
                <div data-add-error className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <i className="fas fa-circle-exclamation text-rose-500 mt-0.5 flex-shrink-0"></i>
                  <span className="text-rose-700 text-xs font-bold leading-snug">{addError}</span>
                </div>
              )}
              {addSuccess && (
                <div className="flex items-center gap-2 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                  <i className="fas fa-circle-check"></i>Student created successfully!
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAddStudent}
                  disabled={addLoading || addSuccess}
                  className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-user-plus"></i>}
                  <span>{addLoading ? 'Creating…' : 'Create Student'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          EDIT STUDENT MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {editStudent && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Edit Student</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  {editStudent.fullName} &bull; {editStudent.rollNumber}
                </p>
              </div>
              <button onClick={() => setEditStudent(null)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90 flex-shrink-0 ml-4">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Body */}
            <div className="flex-grow overflow-y-auto p-8 space-y-5 custom-scrollbar">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <i className="fas fa-lock mr-1.5 text-amber-400"></i>Email, password, and roll number cannot be changed here.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Department">
                    <select className={selectCls} value={editForm.departmentId}
                      onChange={e => setEditForm(f => ({ ...f, departmentId: e.target.value }))}>
                      <option value="">— Select Department —</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Degree Title">
                  <input className={inputCls} placeholder="Bachelor of Science" value={editForm.degreeTitle}
                    onChange={e => setEditForm(f => ({ ...f, degreeTitle: e.target.value }))} />
                </Field>
                <Field label="Program">
                  <input className={inputCls} placeholder="BS Computer Science" value={editForm.program}
                    onChange={e => setEditForm(f => ({ ...f, program: e.target.value }))} />
                </Field>
                <Field label="Batch Year">
                  <input className={inputCls} type="number" placeholder="2024" value={editForm.batchYear}
                    onChange={e => setEditForm(f => ({ ...f, batchYear: e.target.value }))} />
                </Field>
                <Field label="Admission Date">
                  <input className={inputCls} type="date" value={editForm.admissionDate}
                    onChange={e => setEditForm(f => ({ ...f, admissionDate: e.target.value }))} />
                </Field>
                <Field label="Program Duration (years)">
                  <select className={selectCls} value={editForm.programDuration}
                    onChange={e => setEditForm(f => ({ ...f, programDuration: e.target.value }))}>
                    <option value="2">2 Years</option>
                    <option value="3">3 Years</option>
                    <option value="4">4 Years</option>
                  </select>
                </Field>
                <Field label="Semesters Completed">
                  <input className={inputCls} type="number" min="0" max="8" value={editForm.semestersCompleted}
                    onChange={e => setEditForm(f => ({ ...f, semestersCompleted: e.target.value }))} />
                </Field>
                <Field label="CGPA (0.00 – 4.00)">
                  <input className={inputCls} type="number" step="0.01" min="0" max="4" value={editForm.cgpa}
                    onChange={e => setEditForm(f => ({ ...f, cgpa: e.target.value }))} />
                </Field>
                <Field label="Total Credits">
                  <input className={inputCls} type="number" min="0" value={editForm.totalCredits}
                    onChange={e => setEditForm(f => ({ ...f, totalCredits: e.target.value }))} />
                </Field>
                <Field label="CNIC">
                  <input className={inputCls} placeholder="35201-1234567-1" value={editForm.cnic}
                    onChange={e => setEditForm(f => ({ ...f, cnic: e.target.value }))} />
                </Field>
                <Field label="Date of Birth">
                  <input className={inputCls} type="date" value={editForm.dob}
                    onChange={e => setEditForm(f => ({ ...f, dob: e.target.value }))} />
                </Field>
                <Field label="Conduct">
                  <select className={selectCls} value={editForm.conduct}
                    onChange={e => setEditForm(f => ({ ...f, conduct: e.target.value }))}>
                    <option value="Good">Good</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Satisfactory">Satisfactory</option>
                  </select>
                </Field>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex-shrink-0 space-y-3">
              {editError && (
                <div className="flex items-center gap-2 text-rose-600 text-[10px] font-bold uppercase tracking-widest">
                  <i className="fas fa-circle-exclamation"></i>{editError}
                </div>
              )}
              {editSuccess && (
                <div className="flex items-center gap-2 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                  <i className="fas fa-circle-check"></i>Student updated successfully!
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setEditStudent(null)}
                  className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleUpdateStudent}
                  disabled={editLoading || editSuccess}
                  className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {editLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-floppy-disk"></i>}
                  <span>{editLoading ? 'Saving…' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          PAYMENT VIEWER MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {paymentModalReq && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden animate-scaleUp flex flex-col max-h-[92vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Payment Verification</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  {paymentModalReq.studentName} &bull; {paymentModalReq.docType}
                </p>
              </div>
              <button onClick={() => setPaymentModalReq(null)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90 flex-shrink-0 ml-4">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-5 text-center">
                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-2">
                  <i className="fas fa-receipt mr-1.5"></i>Transaction Reference Number
                </p>
                <p className="font-mono font-black text-xl text-slate-900 break-all">
                  {paymentModalReq.transactionRef || '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Amount</p>
                  <p className="font-black text-slate-900 text-sm">PKR {paymentModalReq.amount.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Submitted</p>
                  <p className="font-black text-slate-900 text-xs leading-tight">
                    {paymentModalReq.paymentSubmittedAt
                      ? new Date(paymentModalReq.paymentSubmittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>
              {paymentModalReq.paymentProofUrl ? (
                <PaymentImage url={paymentModalReq.paymentProofUrl} />
              ) : (
                <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                  <i className="fas fa-image text-slate-200 text-3xl mb-3 block"></i>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No screenshot uploaded</p>
                </div>
              )}
            </div>

            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
              <button onClick={() => setPaymentModalReq(null)}
                className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors">
                Close
              </button>
              <button
                disabled={verifyingId !== null}
                onClick={() => { const id = paymentModalReq.id; setPaymentModalReq(null); handleReject(id); }}
                className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-200 hover:border-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <i className="fas fa-times-circle text-xs"></i>Reject
              </button>
              <button
                disabled={verifyingId !== null}
                onClick={() => { const id = paymentModalReq.id; setPaymentModalReq(null); handleApprove(id); }}
                className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <i className="fas fa-check-double text-xs"></i>Verify &amp; Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          REJECT REASON MODAL
      ════════════════════════════════════════════════════════════════════════ */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-white/20 overflow-hidden animate-scaleUp flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Reject Request</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Reason will be stored on the ledger entry</p>
              </div>
              <button onClick={() => setRejectModalId(null)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-8 space-y-3 overflow-y-auto flex-grow">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Rejection Reason</label>
              <textarea
                ref={rejectTextareaRef}
                rows={4}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-600/5 focus:border-blue-600 focus:bg-white outline-none transition-all text-slate-700 text-sm font-medium resize-none"
                placeholder="e.g. Payment not verified, unclear screenshot..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 flex-shrink-0">
              {rejectError && (
                <p className="text-[9px] font-bold text-rose-600 uppercase tracking-widest text-center flex items-center justify-center gap-1">
                  <i className="fas fa-exclamation-circle"></i>{rejectError}
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setRejectModalId(null)}
                  className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={!rejectReason.trim() || isRejecting}
                  className="flex-[2] py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-rose-200 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRejecting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-times-circle"></i>}
                  <span>Confirm Reject</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
