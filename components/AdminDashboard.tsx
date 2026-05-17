import React, { useState, useEffect, useRef } from 'react';
import { User, DocumentRequest, RequestStatus, ActivityLog } from '../types';
import { supabaseApi } from '../services/supabaseApi';
import { api } from '../services/api';

interface Props {
  user: User;
}

// Separate component so image-load failure state is isolated from AdminDashboard.
const PaymentImage: React.FC<{ url: string }> = ({ url }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

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
          <i className="fas fa-up-right-from-square text-[9px]"></i>
          Open Full Size
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

const AdminDashboard: React.FC<Props> = ({ user }) => {
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Reject modal
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Payment viewer modal
  const [paymentModalReq, setPaymentModalReq] = useState<DocumentRequest | null>(null);

  const rejectTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (rejectModalId && rejectTextareaRef.current) {
      rejectTextareaRef.current.focus();
    }
  }, [rejectModalId]);

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
      const msg = err instanceof Error ? err.message : 'Backend unavailable. Check server is running.';
      setApproveError(msg);
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
      const msg = err instanceof Error ? err.message : 'Submission failed. Check connection and try again.';
      setRejectError(msg);
    } finally {
      setIsRejecting(false);
    }
  };

  const filteredRequests = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);

  const hasPayment = (req: DocumentRequest) =>
    !!(req.transactionRef || req.paymentProofUrl);

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 animate-fadeIn px-2 md:px-0">
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
              <i className="fas fa-shield-check mr-2 text-blue-600"></i>
              Cryptographic Active
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Review',    val: requests.filter(r => r.status === RequestStatus.UNDER_REVIEW).length,    icon: 'fa-shield-halved' },
          { label: 'Awaiting Payment',  val: requests.filter(r => r.status === RequestStatus.PENDING_PAYMENT).length, icon: 'fa-clock' },
          { label: 'Documents Issued',  val: requests.filter(r => r.status === RequestStatus.GENERATED).length,       icon: 'fa-file-circle-check' },
          { label: 'Audit Rejections',  val: requests.filter(r => r.status === RequestStatus.REJECTED).length,        icon: 'fa-ban' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-50 text-blue-600 border border-slate-100">
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
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
              <i className="fas fa-list-ul mr-3 text-blue-400"></i>
              Application Queue
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
              <div className="p-20 text-center">
                <i className="fas fa-spinner fa-spin text-blue-200 text-2xl"></i>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-20 text-center space-y-4">
                <i className="fas fa-folder-open text-slate-100 text-5xl"></i>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No matching applications</p>
              </div>
            ) : filteredRequests.map(req => (
              <div key={req.id} className="p-6 md:p-8 hover:bg-slate-50/30 transition-colors">
                {/* ── Request info row ─────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  {/* Left: student + doc info */}
                  <div className="flex items-start space-x-4 min-w-0">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center flex-shrink-0 border border-slate-100">
                      <i className="fas fa-user-tie text-blue-300"></i>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 tracking-tight">{req.studentName}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${
                          req.status === RequestStatus.UNDER_REVIEW   ? 'bg-blue-600 text-white border-blue-600' :
                          req.status === RequestStatus.GENERATED       ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          req.status === RequestStatus.REJECTED        ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {req.status}
                        </span>
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
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                            {new Date(req.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  {req.status === RequestStatus.UNDER_REVIEW && (
                    <div className="flex flex-col gap-2.5 w-full md:w-auto md:min-w-[220px] flex-shrink-0">
                      {/* VIEW PAYMENT button — only when payment data exists */}
                      {hasPayment(req) && (
                        <button
                          onClick={() => setPaymentModalReq(req)}
                          className="w-full bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
                        >
                          <i className="fas fa-receipt text-blue-400 text-xs"></i>
                          View Payment
                        </button>
                      )}

                      {/* REJECT + VERIFY & POST */}
                      <div className="flex gap-2">
                        <button
                          disabled={verifyingId !== null}
                          onClick={() => handleReject(req.id)}
                          className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          <i className="fas fa-times-circle text-xs"></i>
                          Reject
                        </button>
                        <button
                          disabled={verifyingId !== null}
                          onClick={() => handleApprove(req.id)}
                          className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl font-bold shadow-xl shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
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

                {/* Admin rejection note — shown on rejected requests */}
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
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-pulse"></span>
              Real-time Audit Log
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
              <i className="fas fa-network-wired mr-3 text-blue-400"></i>
              Ledger Summary
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

      {/* ── Payment Viewer Modal ─────────────────────────────────────────────── */}
      {paymentModalReq && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden animate-scaleUp flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Payment Verification</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  {paymentModalReq.studentName} &bull; {paymentModalReq.docType}
                </p>
              </div>
              <button
                onClick={() => setPaymentModalReq(null)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90 flex-shrink-0 ml-4"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-grow overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {/* Transaction ref — large and prominent */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-5 text-center">
                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-2">
                  <i className="fas fa-receipt mr-1.5"></i>Transaction Reference Number
                </p>
                <p className="font-mono font-black text-xl text-slate-900 break-all">
                  {paymentModalReq.transactionRef || '—'}
                </p>
              </div>

              {/* Detail chips */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Amount</p>
                  <p className="font-black text-slate-900 text-sm">PKR {paymentModalReq.amount.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Method</p>
                  <p className="font-black text-slate-900 text-xs capitalize leading-tight">
                    {paymentModalReq.paymentMethod?.replace(/_/g, ' ') || '—'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Submitted</p>
                  <p className="font-black text-slate-900 text-xs leading-tight">
                    {paymentModalReq.paymentSubmittedAt
                      ? new Date(paymentModalReq.paymentSubmittedAt).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Payment proof image */}
              {paymentModalReq.paymentProofUrl ? (
                <PaymentImage url={paymentModalReq.paymentProofUrl} />
              ) : (
                <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                  <i className="fas fa-image text-slate-200 text-3xl mb-3 block"></i>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">No screenshot uploaded</p>
                </div>
              )}
            </div>

            {/* Footer: Close + Reject + Approve */}
            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setPaymentModalReq(null)}
                className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors"
              >
                Close
              </button>
              <button
                disabled={verifyingId !== null}
                onClick={() => {
                  const id = paymentModalReq.id;
                  setPaymentModalReq(null);
                  handleReject(id);
                }}
                className="flex-1 py-3.5 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-200 hover:border-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <i className="fas fa-times-circle text-xs"></i>
                Reject
              </button>
              <button
                disabled={verifyingId !== null}
                onClick={() => {
                  const id = paymentModalReq.id;
                  setPaymentModalReq(null);
                  handleApprove(id);
                }}
                className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <i className="fas fa-check-double text-xs"></i>
                Verify &amp; Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Reason Modal ──────────────────────────────────────────────── */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-white/20 overflow-hidden animate-scaleUp">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Reject Request</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Reason will be stored on the ledger entry</p>
              </div>
              <button
                onClick={() => setRejectModalId(null)}
                className="text-slate-400 hover:text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-slate-100 shadow-sm transition-all active:scale-90"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="p-8 space-y-3">
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

            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
              {rejectError && (
                <p className="text-[9px] font-bold text-rose-600 uppercase tracking-widest text-center flex items-center justify-center gap-1">
                  <i className="fas fa-exclamation-circle"></i>{rejectError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectModalId(null)}
                  className="flex-1 py-3.5 font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest text-[10px] transition-colors"
                >
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
