import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  QrCode,
  Share2,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { UserAccount } from '../types/simple';
import { UserAvatar } from './ProfilePhotoModal';

interface ShareMeModalProps {
  account: UserAccount;
  onClose: () => void;
  onOpenChatWithUsername?: (username: string) => void;
}

export const ShareMeModal: React.FC<ShareMeModalProps> = ({
  account,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const cleanUsername = (account.username || 'user').replace(/^@/, '');
  const shareUrl = `${window.location.origin}?invite=${encodeURIComponent(cleanUsername)}`;

  useEffect(() => {
    QRCode.toDataURL(shareUrl, {
      width: 260,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [shareUrl]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setShareFeedback('Profile link copied to clipboard!');
      setTimeout(() => setCopied(false), 3000);
      setTimeout(() => setShareFeedback(null), 3500);
    } catch {
      setShareFeedback('Could not copy link to clipboard');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Connect with ${account.name || '@' + cleanUsername} on Simple`,
          text: `Add me on Simple Messenger (@${cleanUsername})! Click my link to connect directly:`,
          url: shareUrl,
        });
        setShareFeedback('Shared successfully!');
        setTimeout(() => setShareFeedback(null), 3000);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl shadow-emerald-950/50 overflow-hidden flex flex-col">
        {/* Header decoration */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-emerald-600/20 via-teal-600/10 to-transparent pointer-events-none" />

        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Share Profile</h2>
              <p className="text-xs text-slate-400">Invite friends directly with your personal link</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Identity Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-inner flex flex-col items-center text-center relative group">
            <div className="relative mb-3">
              <div className="ring-4 ring-emerald-500/30 rounded-full p-1 bg-slate-950">
                <UserAvatar
                  name={account.name || cleanUsername}
                  avatarUrl={account.avatarUrl}
                  avatarColor={account.avatarColor}
                  sizeClass="w-20 h-20"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1.5 rounded-full border-2 border-slate-900 shadow-md">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>

            <h3 className="text-lg font-bold text-white tracking-tight">
              {account.name || cleanUsername}
            </h3>
            <p className="text-sm font-semibold text-emerald-400 font-mono">@{cleanUsername}</p>

            {account.about && (
              <p className="text-xs text-slate-400 mt-2 max-w-xs line-clamp-2">
                &ldquo;{account.about}&rdquo;
              </p>
            )}

            {/* QR Code */}
            <div className="mt-4 p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for @${cleanUsername}`}
                  className="w-44 h-44 object-contain"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-slate-400">
                  <QrCode className="w-10 h-10 animate-spin" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">
              Scan with camera to connect on Simple
            </p>
          </div>

          {/* Link box */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Direct Invite Link
            </label>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="bg-transparent text-xs text-slate-300 font-mono flex-1 outline-none truncate selection:bg-emerald-500/30 select-all"
              />
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  copied
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Feedback banner */}
          {shareFeedback && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-fade-in font-medium">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{shareFeedback}</span>
            </div>
          )}

          {/* Share Actions */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleCopy}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 flex items-center justify-center gap-2 transition-colors active:scale-98"
            >
              <Copy className="w-4 h-4 text-emerald-400" />
              Copy Link
            </button>
            <button
              onClick={handleNativeShare}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <Share2 className="w-4 h-4" />
              Share Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
