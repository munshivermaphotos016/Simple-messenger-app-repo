import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Check, Copy, RefreshCw, X, KeyRound } from 'lucide-react';
import { computeSafetyNumberBlocks } from '../crypto/e2ee';

interface SafetyNumberModalProps {
  contactName: string;
  localFingerprint: string;
  remoteFingerprint: string;
  isVerified: boolean;
  keyChangedWarning?: boolean;
  onToggleVerify: () => void;
  onDismissKeyWarning?: () => void;
  onClose: () => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({
  contactName,
  localFingerprint,
  remoteFingerprint,
  isVerified,
  keyChangedWarning,
  onToggleVerify,
  onDismissKeyWarning,
  onClose,
}) => {
  const [blocks, setBlocks] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    computeSafetyNumberBlocks(localFingerprint, remoteFingerprint).then(setBlocks);
  }, [localFingerprint, remoteFingerprint]);

  const fullCode = blocks.join(' ');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            {isVerified ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <KeyRound className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <h2 className="text-base font-semibold tracking-tight">
              Verify Security Code
            </h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close safety number dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {keyChangedWarning && (
          <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-medium text-amber-100">
                Security key changed for {contactName}
              </p>
              <p className="text-amber-200/80 leading-relaxed">
                This usually happens when {contactName} reinstalls Simple or switches devices. Verify the new 60-digit code below out-of-band before continuing sensitive communication.
              </p>
              {onDismissKeyWarning && (
                <button
                  onClick={onDismissKeyWarning}
                  className="mt-1 text-xs font-semibold text-amber-300 underline hover:text-white"
                >
                  Acknowledge key change
                </button>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400 leading-relaxed">
          To verify your chat with <span className="text-slate-200 font-medium">{contactName}</span> is completely private, compare the 60-digit code below with their phone in person.
        </p>

        {/* Deterministic Visual Verification Matrix */}
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl bg-slate-950 border border-slate-800/90 p-5">
          <div
            className="grid grid-cols-8 gap-1 p-3 bg-white rounded-xl shadow-inner"
            aria-label="Security code QR pattern"
          >
            {Array.from({ length: 64 }).map((_, idx) => {
              const charCode = (localFingerprint + remoteFingerprint).charCodeAt(idx % 64) || idx;
              const active = (charCode + idx) % 2 === 0;
              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-[2px] ${
                    active ? 'bg-slate-950' : 'bg-slate-200'
                  }`}
                />
              );
            })}
          </div>

          {/* 60-Digit Safety Number (12 groups of 5 digits) */}
          <div className="mt-5 grid grid-cols-4 gap-x-4 gap-y-2 font-mono text-sm tabular-nums tracking-wider text-emerald-300 select-all">
            {blocks.map((block, i) => (
              <span key={i} className="text-center">
                {block}
              </span>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-emerald-400 font-medium">
            End-to-End Encrypted · Private & Secure 🔒
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={handleCopy}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied 60-Digit Code' : 'Copy Code'}
          </button>

          <button
            onClick={onToggleVerify}
            className={`min-h-[44px] flex-1 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
              isVerified
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {isVerified ? 'Verified (Tap to Clear)' : 'Mark as Verified'}
          </button>
        </div>
      </div>
    </div>
  );
};
