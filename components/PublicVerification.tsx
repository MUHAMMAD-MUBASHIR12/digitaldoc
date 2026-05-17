import React, { useState, useEffect, useCallback } from 'react';
import { VerifyResponse } from '../types';
import { api } from '../services/api';

type VerifyState = 'idle' | 'loading' | 'valid' | 'invalid';

interface Props {
  initialPsid?: string;
  initialToken?: string;
}

const Field: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-100 px-6 py-5">
    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
    <p className="font-black text-slate-900 text-sm tracking-tight truncate">{value || '—'}</p>
  </div>
);

const PublicVerification: React.FC<Props> = ({ initialPsid, initialToken }) => {
  const [psid, setPsid] = useState(initialPsid ?? '');
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [result, setResult] = useState<VerifyResponse | null>(null);

  const runVerify = useCallback(async (id: string, tok?: string) => {
    if (id.length < 9) return;
    setVerifyState('loading');
    setResult(null);
    try {
      const response = await api.verifyDocument(id, tok);
      setResult(response);
      setVerifyState(response.verified ? 'valid' : 'invalid');
    } catch {
      setVerifyState('invalid');
    }
  }, []);

  // Auto-fire when landing via QR scan (?psid=...&token=...)
  useEffect(() => {
    if (initialPsid && initialPsid.length === 9) {
      runVerify(initialPsid, initialToken);
    }
  }, [initialPsid, initialToken, runVerify]);

  // Manual form submit — use token only if the typed PSID matches the URL PSID
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = psid === initialPsid ? initialToken : undefined;
    runVerify(psid, tok);
  };

  const handleReset = () => {
    setPsid('');
    setResult(null);
    setVerifyState('idle');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-20 animate-fadeIn">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase tracking-[0.2em]">
          Official Record Validator
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Public Record Verification</h1>
        <p className="text-slate-500 font-medium text-sm max-w-sm mx-auto">
          Instant cryptographic authentication of university-issued academic documents.
        </p>
      </div>

      {/* Search form — always visible */}
      <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Reference Transaction PSID
            </label>
            <div className="relative">
              <input
                type="text"
                className="w-full px-6 py-6 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:bg-white transition-all font-mono tracking-[0.3em] text-3xl font-black placeholder:font-sans placeholder:tracking-normal placeholder:font-bold placeholder:text-slate-200"
                placeholder="000000000"
                value={psid}
                onChange={(e) => {
                  setPsid(e.target.value.replace(/\D/g, '').slice(0, 9));
                  if (verifyState !== 'idle') handleReset();
                }}
                maxLength={9}
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-blue-200">
                <i className="fas fa-fingerprint text-2xl"></i>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={verifyState === 'loading' || psid.length < 9}
            className="w-full py-5 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] text-white shadow-md transition-all flex items-center justify-center space-x-3 active:scale-[0.98] disabled:bg-slate-200 disabled:cursor-not-allowed disabled:text-slate-400 disabled:shadow-none bg-blue-600 hover:bg-blue-700 shadow-blue-100 shadow-xl"
          >
            {verifyState === 'loading' ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                <span>Querying Secure Ledger…</span>
              </>
            ) : (
              <>
                <i className="fas fa-shield-halved text-sm"></i>
                <span>Search Repository</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Loading skeleton */}
      {verifyState === 'loading' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center space-y-6 result-enter">
          <div className="w-20 h-20 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin"></div>
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Querying Secure Ledger</p>
            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Cross-referencing cryptographic index…</p>
          </div>
        </div>
      )}

      {/* Valid document */}
      {verifyState === 'valid' && result && (
        <div className="rounded-3xl border border-emerald-200 shadow-lg shadow-emerald-50 overflow-hidden result-enter">
          {/* Header */}
          <div className="bg-emerald-600 px-8 py-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <i className="fas fa-circle-check text-white text-2xl"></i>
              </div>
              <div>
                <p className="text-white font-black text-base uppercase tracking-tight">Valid Document</p>
                <p className="text-emerald-200 text-[10px] font-bold uppercase tracking-widest mt-0.5">Authentic Record Found in Ledger</p>
              </div>
            </div>

            {/* Token-verified badge — only shown when strong verification passed */}
            {result.token_verified && (
              <div className="hidden sm:flex items-center space-x-2 bg-white/15 border border-white/20 px-4 py-2 rounded-xl">
                <i className="fas fa-shield-check text-emerald-200 text-xs"></i>
                <span className="text-[9px] font-bold text-emerald-100 uppercase tracking-widest">Cryptographically Verified</span>
              </div>
            )}

            {/* Legacy badge — shown when no token was in the URL */}
            {result.legacy && (
              <div className="hidden sm:flex items-center space-x-2 bg-amber-400/20 border border-amber-300/30 px-4 py-2 rounded-xl">
                <i className="fas fa-triangle-exclamation text-amber-300 text-xs"></i>
                <span className="text-[9px] font-bold text-amber-200 uppercase tracking-widest">Legacy Mode</span>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="bg-white p-8 space-y-6">

            {/* Legacy warning banner */}
            {result.legacy && (
              <div className="flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4">
                <i className="fas fa-triangle-exclamation text-amber-500 flex-shrink-0 mt-0.5"></i>
                <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                  Legacy verification — token not checked. Rescan the QR code printed on the
                  PDF for full 128-bit cryptographic security.
                </p>
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Student Name"            value={result.student_name} />
              <Field label="Document Classification" value={result.doc_type} />
              <Field label="Degree Title"            value={result.degree_title} />
              <Field label="CGPA"                    value={result.cgpa != null ? String(result.cgpa) : null} />
              <Field
                label="Issue Date"
                value={result.issued_at
                  ? new Date(result.issued_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })
                  : null}
              />
              <Field
                label="Semesters Covered"
                value={result.semesters && result.semesters.length
                  ? result.semesters.map(s => `S${s}`).join(', ')
                  : null}
              />
            </div>

            {/* Verification payload */}
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center">
                <i className="fas fa-key mr-2 opacity-50"></i>Ledger Signature Payload
              </p>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 font-mono text-[11px] text-blue-600 break-all select-all">
                {result.verification_payload || '—'}
              </div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3.5 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 hover:text-slate-600 hover:border-slate-300 uppercase tracking-widest transition-all"
            >
              Verify Another Document
            </button>
          </div>
        </div>
      )}

      {/* Invalid PSID */}
      {verifyState === 'invalid' && (
        <div className="rounded-3xl border border-rose-200 shadow-lg shadow-rose-50 overflow-hidden result-enter">
          <div className="bg-rose-600 px-8 py-6 flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <i className="fas fa-circle-xmark text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-white font-black text-base uppercase tracking-tight">Invalid Document</p>
              <p className="text-rose-200 text-[10px] font-bold uppercase tracking-widest mt-0.5">No Matching Record Found</p>
            </div>
          </div>

          <div className="bg-white p-8 space-y-6 text-center">
            <div className="space-y-2">
              <p className="text-slate-800 font-black text-lg tracking-tight">PSID Not Recognised</p>
              <p className="text-slate-500 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                The PSID <span className="font-mono font-black text-rose-600">{psid}</span> does not match any
                authenticated record in the ledger. The document may be fraudulent, the PSID may be incorrect,
                or the record may not have been approved yet.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {[
                { icon: 'fa-spell-check', text: 'Double-check the PSID printed on the document' },
                { icon: 'fa-clock',       text: 'Approved documents may take a few minutes to appear' },
                { icon: 'fa-phone',       text: "Contact the Registrar's Office to verify authenticity" },
              ].map((hint, i) => (
                <div key={i} className="flex items-start space-x-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <i className={`fas ${hint.icon} text-slate-300 mt-0.5 flex-shrink-0`}></i>
                  <p className="text-[10px] text-slate-500 font-bold leading-relaxed">{hint.text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleReset}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-xl shadow-slate-200 flex items-center justify-center space-x-2"
            >
              <i className="fas fa-rotate-left"></i>
              <span>Try Another PSID</span>
            </button>
          </div>
        </div>
      )}

      {/* Trust badges — only shown on idle */}
      {verifyState === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60">
          {[
            { icon: 'fa-lock',         title: 'SHA-256 Hashing',  text: 'All record entries are immutable.' },
            { icon: 'fa-shield-heart', title: 'Trusted Source',   text: 'Only verified registrar output is indexed.' },
            { icon: 'fa-globe',        title: 'Public Reach',     text: 'Global verification for employers.' },
          ].map((feat, i) => (
            <div key={i} className="flex flex-col items-center text-center p-4">
              <i className={`fas ${feat.icon} text-blue-600 mb-3`}></i>
              <h4 className="font-bold text-slate-900 uppercase tracking-widest text-[9px]">{feat.title}</h4>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">{feat.text}</p>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes resultEnter {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .result-enter { animation: resultEnter 0.3s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default PublicVerification;
