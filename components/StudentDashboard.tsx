import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import QRCode from 'react-qr-code';
import { User, DocumentType, DocumentRequest, RequestStatus } from '../types';
import { supabaseApi } from '../services/supabaseApi';

interface Props {
  user: User;
}

const StudentDashboard: React.FC<Props> = ({ user }) => {
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'selection' | 'confirmation' | 'success'>('selection');
  const [selectedType, setSelectedType] = useState<DocumentType>(DocumentType.TRANSCRIPT);
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [hasScrolledStep1, setHasScrolledStep1] = useState(false);
  const [hasScrolledStep2, setHasScrolledStep2] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRequest | null>(null);

  // Payment modal state
  const [paymentModalReq, setPaymentModalReq] = useState<DocumentRequest | null>(null);
  const [txRef, setTxRef] = useState('');
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentUploadError, setPaymentUploadError] = useState<string | null>(null);

  const [studentProfile, setStudentProfile] = useState<{
    roll_number: string | null;
    cgpa: number | null;
    degree_title: string | null;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const paymentFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshRequests();
  }, []);

  useEffect(() => {
    supabaseApi.getStudentPublicInfo(user.id).then(info => {
      if (info) setStudentProfile(info);
    });
  }, [user.id]);

  useEffect(() => {
    if (showModal) {
      setHasScrolledStep1(true);
      setHasScrolledStep2(true);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [showModal, modalStep]);

  const refreshRequests = async () => {
    setIsLoading(true);
    const all = await supabaseApi.getRequests(user.id);
    setRequests(all);
    setIsLoading(false);
  };

  const handleCreateRequest = async () => {
    if (selectedSemesters.length === 0) return;
    setIsSubmitting(true);
    setRequestError(null);
    try {
      await supabaseApi.createRequest(user, selectedType, selectedSemesters);
      setModalStep('success');
      await refreshRequests();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalStep('selection');
    setSelectedSemesters([]);
    setRequestError(null);
    setHasScrolledStep1(false);
    setHasScrolledStep2(false);
  };

  const openPaymentModal = (req: DocumentRequest) => {
    setPaymentModalReq(req);
    setTxRef('');
    setPaymentFile(null);
    setPaymentUploadError(null);
  };

  const closePaymentModal = () => {
    setPaymentModalReq(null);
    setTxRef('');
    setPaymentFile(null);
    setPaymentUploadError(null);
  };

  const handlePaymentFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPaymentFile(file);
    e.target.value = '';
  };

  const handlePaymentSubmit = async () => {
    if (!paymentModalReq || !paymentFile || !txRef.trim()) return;
    setIsUploading(true);
    setPaymentUploadError(null);
    try {
      await supabaseApi.uploadPayment(paymentModalReq.id, paymentFile, user.id, txRef.trim());
      closePaymentModal();
      await refreshRequests();
    } catch (err) {
      setPaymentUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSemester = (sem: number) => {
    setSelectedSemesters(prev =>
      prev.includes(sem) ? prev.filter(s => s !== sem) : [...prev, sem]
    );
  };

  const handleScrollCheck = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 20;
      if (isAtBottom) {
        if (modalStep === 'selection') setHasScrolledStep1(true);
        else if (modalStep === 'confirmation') setHasScrolledStep2(true);
      }
    }
  };

  const statusBadgeClass = (status: RequestStatus) => {
    switch (status) {
      case RequestStatus.GENERATED:      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case RequestStatus.APPROVED:       return 'bg-green-50 text-green-700 border-green-100';
      case RequestStatus.UNDER_REVIEW:   return 'bg-blue-50 text-blue-700 border-blue-100';
      case RequestStatus.PENDING_PAYMENT: return 'bg-amber-50 text-amber-700 border-amber-100';
      case RequestStatus.REJECTED:       return 'bg-rose-50 text-rose-700 border-rose-100';
      default:                           return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  const handleDownloadPdf = () => {
    if (!previewDoc || !previewDoc.verificationPayload) return;
    const url = `https://livcbioyoaupoyuemvmm.supabase.co/storage/v1/object/public/generated-pdfs/${previewDoc.psid}.pdf`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 animate-fadeIn pb-16 px-4 md:px-0">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 md:border-b md:border-slate-200 md:pb-10">
        <div className="space-y-2">
          <div className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest rounded shadow-lg shadow-blue-200">
            Student Desktop
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Welcome, {user.name}</h1>
          <p className="text-slate-500 text-base font-medium max-w-xl">Manage your verified academic archive. All documents undergo registrar counter-validation before issuance.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-5 rounded-2xl font-bold shadow-2xl shadow-blue-200 transition-all flex items-center justify-center space-x-3 active:scale-95 group"
        >
          <i className="fas fa-file-plus text-lg opacity-70 group-hover:opacity-100 transition-opacity"></i>
          <span className="text-xs uppercase tracking-widest">Apply for New Document</span>
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-5 transition-transform hover:-translate-y-1">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 shadow-inner">
            <i className="fas fa-fingerprint text-xl"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enrollment ID</p>
            <p className="text-sm font-mono font-black text-slate-800 tracking-tighter">{studentProfile?.roll_number ?? '—'}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-5 transition-transform hover:-translate-y-1">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100">
            <i className="fas fa-hourglass-half text-xl"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Processing</p>
            <p className="text-2xl font-black text-slate-900 leading-none mt-1">{requests.filter(r => r.status !== RequestStatus.GENERATED && r.status !== RequestStatus.REJECTED).length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-5 transition-transform hover:-translate-y-1">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100">
            <i className="fas fa-shield-check text-xl"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authenticated Docs</p>
            <p className="text-2xl font-black text-slate-900 leading-none mt-1">{requests.filter(r => r.status === RequestStatus.GENERATED).length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-5 transition-transform hover:-translate-y-1">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100">
            <i className="fas fa-star-half-stroke text-xl"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CGPA</p>
            <p className="text-2xl font-black text-slate-900 leading-none mt-1">
              {studentProfile?.cgpa != null ? studentProfile.cgpa.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-3xl md:rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-8 md:px-12 py-7 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Verification Timeline</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 font-black border-b border-slate-100 tracking-[0.15em] bg-slate-50/60">
                <th className="px-8 md:px-12 py-5">Transaction PSID</th>
                <th className="px-8 md:px-12 py-5">Document Details</th>
                <th className="px-8 md:px-12 py-5">Ledger Status</th>
                <th className="px-8 md:px-12 py-5 text-right">Gateway Access</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-8 md:px-12 py-24 text-center">
                    <i className="fas fa-spinner fa-spin text-blue-200 text-2xl"></i>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 md:px-12 py-24 text-center text-slate-300 italic font-bold">No ledger entries found for this identification.</td>
                </tr>
              ) : requests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                  <td className="px-8 md:px-12 py-6">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 text-base tracking-tighter">{req.psid}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(req.psid)}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="Copy PSID"
                      >
                        <i className="fas fa-copy text-[11px]"></i>
                      </button>
                    </div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-1.5">{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '—'}</div>
                  </td>
                  <td className="px-8 md:px-12 py-6">
                    <div className="font-black text-slate-900 uppercase tracking-tight text-sm">{req.docType}</div>
                    <div className="text-[10px] text-slate-500 font-bold mt-0.5">Semesters: {req.semesters.join(', ')}</div>
                    <div className="text-[10px] font-black text-slate-300 mt-2 uppercase tracking-widest">PKR {req.amount.toLocaleString()}</div>
                  </td>
                  <td className="px-8 md:px-12 py-6">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${statusBadgeClass(req.status)}`}>
                      {req.status}
                    </span>
                    {req.status === RequestStatus.REJECTED && req.adminNote && (
                      <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 max-w-[220px]">
                        <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-1">Rejection Reason</p>
                        <p className="text-[10px] text-rose-700 font-medium leading-snug break-words">{req.adminNote}</p>
                      </div>
                    )}
                  </td>
                  <td className="px-8 md:px-12 py-6 text-right">
                    {req.status === RequestStatus.PENDING_PAYMENT && (
                      <button
                        onClick={() => openPaymentModal(req)}
                        className="border-2 border-blue-500 hover:bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center ml-auto gap-2"
                      >
                        <i className="fas fa-upload text-xs"></i>
                        Proof Upload
                      </button>
                    )}
                    {req.status === RequestStatus.GENERATED && (
                      <button
                        className="border-2 border-emerald-500 hover:bg-emerald-50 text-emerald-600 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center ml-auto gap-2"
                        onClick={() => setPreviewDoc(req)}
                      >
                        <i className="fas fa-eye text-xs"></i>
                        <span>Inspect Asset</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment proof upload modal */}
      {paymentModalReq && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-scaleUp border border-white/20">
            <div className="px-8 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Upload Payment Proof</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">PSID: {paymentModalReq.psid}</p>
              </div>
              <button
                onClick={closePaymentModal}
                className="text-slate-400 hover:text-red-500 bg-white w-10 h-10 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm transition-all active:scale-90"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* Amount due */}
              <div className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-4 flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Amount Due</span>
                <span className="text-xl font-black text-amber-700 tracking-tighter">PKR {paymentModalReq.amount.toLocaleString()}</span>
              </div>

              {/* Transaction reference */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Transaction Reference Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={txRef}
                  onChange={e => setTxRef(e.target.value)}
                  placeholder="e.g. TXN-1234567890"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-mono text-sm font-bold text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:text-slate-300"
                />
              </div>

              {/* File picker */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Payment Screenshot / Receipt <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={paymentFileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handlePaymentFileChange}
                />
                <button
                  type="button"
                  onClick={() => paymentFileRef.current?.click()}
                  className={`w-full px-5 py-5 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-2 ${
                    paymentFile
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {paymentFile ? (
                    <>
                      <i className="fas fa-file-check text-emerald-500 text-2xl"></i>
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest truncate max-w-[280px]">{paymentFile.name}</span>
                      <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Tap to change file</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-cloud-arrow-up text-slate-300 text-2xl"></i>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tap to select file</span>
                      <span className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Image or PDF</span>
                    </>
                  )}
                </button>
              </div>

              {/* Error */}
              {paymentUploadError && (
                <div className="flex items-start space-x-3 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-4">
                  <i className="fas fa-exclamation-circle text-rose-500 flex-shrink-0 mt-0.5"></i>
                  <p className="text-[11px] font-bold text-rose-700 leading-relaxed">{paymentUploadError}</p>
                </div>
              )}
            </div>

            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-4">
              <button
                onClick={closePaymentModal}
                className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePaymentSubmit}
                disabled={!txRef.trim() || !paymentFile || isUploading}
                className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 transition-all text-xs uppercase tracking-widest disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center space-x-3 active:scale-[0.98]"
              >
                {isUploading ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <>
                    <i className="fas fa-upload text-sm"></i>
                    <span>Submit Proof</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New document request modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[200] flex items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-none sm:rounded-[3rem] shadow-2xl w-full max-w-xl h-full sm:h-auto sm:max-h-[95vh] flex flex-col overflow-hidden animate-scaleUp border border-white/20">
            {modalStep !== 'success' && (
              <div className="px-8 md:px-10 py-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                    {modalStep === 'selection' ? 'New Application' : 'Finalize Application'}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Audit Step {modalStep === 'selection' ? '1' : '2'} of 2</p>
                </div>
                <button onClick={closeModal} className="text-slate-400 hover:text-red-500 bg-white w-10 h-10 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm transition-all active:scale-90">
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}

            <div className="flex-grow relative overflow-hidden flex flex-col">
              {modalStep === 'success' ? (
                <div className="p-10 md:p-20 text-center space-y-8 flex flex-col items-center justify-center h-full">
                  <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border-4 border-emerald-100/50 shadow-2xl shadow-emerald-100">
                    <i className="fas fa-check-circle text-5xl"></i>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Application Lodged</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto font-medium leading-relaxed">Your request has been successfully indexed in the digital ledger. Proceed to your dashboard for bank proof verification.</p>
                  </div>
                  <button
                    onClick={closeModal}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-5 rounded-2xl font-bold transition-all w-full text-xs uppercase tracking-widest shadow-2xl shadow-blue-200 active:scale-95"
                  >
                    Return to Portal
                  </button>
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  onScroll={handleScrollCheck}
                  className="overflow-y-auto p-6 md:p-10 space-y-12 custom-scrollbar flex-grow"
                >
                  {modalStep === 'selection' ? (
                    <>
                      <div className="space-y-5">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">1. Choose Document Category</p>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: DocumentType.TRANSCRIPT, icon: 'fa-file-invoice', label: 'Transcript' },
                            { id: DocumentType.MARKSHEET, icon: 'fa-table-list', label: 'Marksheet' },
                            { id: DocumentType.CERTIFICATE, icon: 'fa-award', label: 'Certificate' },
                          ].map(type => (
                            <button
                              key={type.id}
                              onClick={() => setSelectedType(type.id)}
                              className={`py-6 md:py-10 rounded-3xl text-[10px] font-black transition-all border-2 flex flex-col items-center gap-4 ${
                                selectedType === type.id
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-300'
                                  : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100 hover:border-slate-200'
                              }`}
                            >
                              <i className={`fas ${type.icon} text-xl md:text-2xl`}></i>
                              <span className="tracking-tight uppercase">{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">2. Target Semesters</p>
                        <div className="grid grid-cols-4 gap-2.5 md:gap-4">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                            <button
                              key={num}
                              onClick={() => toggleSemester(num)}
                              className={`h-14 md:h-16 rounded-2xl border-2 font-black text-sm transition-all flex items-center justify-center ${
                                selectedSemesters.includes(num)
                                  ? 'border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-200'
                                  : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-300'
                              }`}
                            >
                              S{num}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                        <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Official Submission Protocol</h4>
                        <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
                          Ensure all academic course cycles are correct before proceeding. Duplicate requests for existing records within a 30-day window trigger an automatic ledger audit. Please scroll to acknowledge.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-10">
                      <div className="bg-[#f8fafc] p-8 md:p-10 rounded-[3rem] border border-slate-200/60 shadow-inner space-y-8">
                        <div className="flex justify-between items-center text-sm md:text-base">
                          <span className="font-bold text-slate-500 uppercase tracking-widest text-[11px]">Document:</span>
                          <span className="font-black text-slate-900 uppercase tracking-tight">{selectedType}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm md:text-base">
                          <span className="font-bold text-slate-500 uppercase tracking-widest text-[11px]">Semester Count:</span>
                          <span className="font-black text-slate-900">{selectedSemesters.length}</span>
                        </div>
                        <div className="pt-8 border-t border-slate-200/50 flex justify-between items-center">
                          <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em]">Total Processing Fee:</span>
                          <span className="text-3xl font-black text-blue-600 tracking-tighter">PKR {(selectedSemesters.length * 500).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="space-y-5">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Terms of Authenticity</p>
                        <div className="bg-slate-50 p-8 md:p-10 rounded-[3rem] border border-slate-100 text-[12px] text-slate-500 leading-relaxed font-medium">
                          <p className="mb-4">1. Document issuance is subject to bank ledger reconciliation with the provided PSID.</p>
                          <p className="mb-4">2. Digital entries are immutable; once authenticated, amendments require a manual registrar override.</p>
                          <p className="mb-4">3. I certify that all inputs provided match the Registrar's Office official academic ledger.</p>
                          <div className="h-px bg-slate-200/60 my-8"></div>
                          <div className="space-y-2">
                             <p className="text-slate-900 font-black uppercase tracking-tight text-[11px]">Legal Declaration</p>
                             <p className="text-slate-800 font-bold italic leading-relaxed">"I hereby authorize the automated generation of my academic record from the university database."</p>
                          </div>
                          <div className="mt-10 text-center">
                            <p className="font-black text-blue-300 uppercase text-[10px] tracking-[0.4em] animate-pulse">Scroll to End to Enable Submission &darr;</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {((modalStep === 'selection' && !hasScrolledStep1) || (modalStep === 'confirmation' && !hasScrolledStep2)) && (
                     <div className="text-center py-5 bg-white/95 backdrop-blur-md sticky bottom-0 border-t border-slate-50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center">
                           Review Required to Proceed <i className="fas fa-arrow-down ml-2 animate-bounce"></i>
                        </span>
                     </div>
                  )}
                </div>
              )}
            </div>

            {modalStep !== 'success' && (
              <div className="px-8 md:px-10 py-8 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
                {requestError && (
                  <div className="flex items-start space-x-3 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-3">
                    <i className="fas fa-exclamation-circle text-rose-500 flex-shrink-0 mt-0.5 text-xs"></i>
                    <p className="text-[10px] font-bold text-rose-700 leading-relaxed">{requestError}</p>
                  </div>
                )}
                <div className="flex flex-row gap-4">
                  {modalStep === 'selection' ? (
                    <>
                      <button onClick={closeModal} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Discard</button>
                      <button
                        disabled={selectedSemesters.length === 0 || !hasScrolledStep1}
                        onClick={() => setModalStep('confirmation')}
                        className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 transition-all text-xs uppercase tracking-widest disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed active:scale-[0.98]"
                      >
                        Verify Summary
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setModalStep('selection'); setRequestError(null); }} className="flex-1 py-4 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Back</button>
                      <button
                        disabled={!hasScrolledStep2 || isSubmitting}
                        onClick={handleCreateRequest}
                        className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-2xl shadow-emerald-200 transition-all text-xs uppercase tracking-widest disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center space-x-3 active:scale-[0.98]"
                      >
                        {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-double text-sm"></i>}
                        <span>Post to Ledger</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[300] flex items-center justify-center p-0 md:p-6 lg:p-12">
          <div className="bg-white rounded-none md:rounded-[4rem] shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden animate-scaleUp border border-white/10">
            <div className="px-8 md:px-12 py-6 border-b flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-600 w-10 h-10 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-100">
                  <i className="fas fa-shield-check text-white text-lg"></i>
                </div>
                <div>
                  <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight uppercase leading-none">Record Authentication Preview</h2>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mt-1.5">Cryptographically Signed Archive</p>
                </div>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-red-500 w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            <div className="flex-grow overflow-auto p-6 md:p-16 bg-slate-200 flex justify-center custom-scrollbar">
              <div className="bg-white w-[595px] h-[842px] min-w-[595px] shadow-2xl relative p-20 flex flex-col border border-slate-200 select-none overflow-hidden origin-top scale-[0.55] sm:scale-[0.8] md:scale-100">
                <div className="absolute inset-0 opacity-[0.015] pointer-events-none flex items-center justify-center rotate-[-45deg] whitespace-nowrap">
                   <span className="text-9xl font-black uppercase text-slate-900 tracking-[0.5em]">CERTIFIED OFFICIAL RECORD</span>
                </div>
                <div className="text-center mb-20 relative">
                  <div className="w-20 h-20 border-4 border-blue-600 rounded-full mx-auto mb-8 flex items-center justify-center shadow-2xl">
                    <i className="fas fa-university text-3xl text-blue-600"></i>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">University Ledger Authentication Bureau</h3>
                  <div className="w-16 h-[3px] bg-blue-600 mx-auto mt-4 rounded-full"></div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-5">Office of Registrar &bull; Automated Document Systems</p>
                </div>
                <div className="flex-grow space-y-20">
                   <div className="text-center space-y-4">
                      <h4 className="text-6xl font-black text-slate-900 uppercase tracking-tighter leading-none">{previewDoc.docType}</h4>
                      <p className="text-[11px] font-black text-slate-400 tracking-[0.5em] uppercase bg-slate-50 px-6 py-2 rounded-full inline-block border border-slate-100">Ledger Index: {previewDoc.psid}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-16 text-xs border-t-2 border-slate-900 pt-12">
                      <div className="space-y-8">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Record Holder</p>
                          <p className="font-black text-slate-900 text-2xl uppercase tracking-tight leading-none">{previewDoc.studentName}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Registration ID</p>
                          <p className="font-black text-slate-900 font-mono text-xl tracking-tighter">{studentProfile?.roll_number ?? '—'}</p>
                        </div>
                      </div>
                      <div className="space-y-8 text-right">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Authentication Date</p>
                          <p className="font-black text-slate-900 text-2xl tracking-tight leading-none">{previewDoc.createdAt ? new Date(previewDoc.createdAt).toLocaleDateString() : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Academic scope</p>
                          <p className="font-black text-slate-900 uppercase tracking-tighter text-base">Cycles {previewDoc.semesters.join(', ')}</p>
                        </div>
                      </div>
                   </div>
                   <div className="p-12 bg-slate-50 border-2 border-slate-100 rounded-[3rem] text-center relative shadow-inner">
                      <p className="text-[13px] font-bold text-slate-500 leading-relaxed italic uppercase tracking-wider px-8">
                        This digital asset represents an authorized cryptographic hash of the university's central academic record. Public validation is facilitated through the blockchain QR index below.
                      </p>
                   </div>
                </div>
                <div className="mt-auto flex justify-between items-end border-t-2 border-slate-100 pt-12">
                   <div className="flex items-center space-x-8">
                      <a
                        href={`${window.location.origin}/verify?psid=${previewDoc.psid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-white p-5 border-2 border-slate-100 shadow-2xl rounded-[2rem] hover:border-blue-300 transition-colors"
                        title="Open verification page"
                      >
                        <QRCode
                          value={`${window.location.origin}/verify?psid=${previewDoc.psid}`}
                          size={112}
                        />
                      </a>
                      <div className="max-w-[180px]">
                         <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest leading-tight">Digital Signature Verified</p>
                         <p className="text-[8px] text-slate-400 font-bold mt-1.5 uppercase">Authentic Node Hash: {previewDoc.psid}</p>
                         <a
                           href={`${window.location.origin}/verify?psid=${previewDoc.psid}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="text-[8px] text-blue-500 hover:text-blue-700 font-bold mt-2 block truncate underline underline-offset-2 transition-colors"
                           title={`${window.location.origin}/verify?psid=${previewDoc.psid}`}
                         >
                           {window.location.origin}/verify?psid={previewDoc.psid}
                         </a>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="h-[3px] w-48 bg-blue-600 ml-auto mb-4 opacity-20 rounded-full"></div>
                      <p className="text-[13px] font-black text-slate-900 uppercase tracking-[0.3em]">University Registrar</p>
                      <p className="text-[9px] font-mono text-slate-300 mt-2 uppercase tracking-tighter truncate max-w-[220px] ml-auto">{previewDoc.verificationPayload}</p>
                   </div>
                </div>
              </div>
            </div>

            <div className="px-8 md:px-12 py-8 md:py-10 bg-white border-t flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="flex items-center space-x-6 bg-slate-50 px-8 py-5 rounded-[2.5rem] border border-slate-100 flex-grow max-w-2xl">
                <i className="fas fa-info-circle text-blue-300 text-xl"></i>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                  Cryptographic verification complete. You are authorized to download the secure PDF bundle for official documentation needs.
                </span>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={!previewDoc.verificationPayload}
                className="w-full lg:w-auto px-12 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-200 transition-all flex items-center justify-center space-x-4 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="fas fa-file-arrow-down text-xl opacity-70"></i>
                <span>Download Secure PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        @keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 250px; opacity: 1; } }
        .animate-slideDown { animation: slideDown 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default StudentDashboard;
