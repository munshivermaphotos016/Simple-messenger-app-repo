import React, { useEffect, useState } from 'react';
import { Download, Share2, CheckCircle2, MessageCircle } from 'lucide-react';
import { isAndroidApkRuntime, getRemoteServerOrigin } from '../utils/androidBridge';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export async function shareApkOrInvite(options?: {
  recipientPhone?: string;
  recipientName?: string;
  senderName?: string;
  senderUsername?: string;
  preferFileShare?: boolean;
}): Promise<'shared_file' | 'shared_link' | 'whatsapp_opened'> {
  const origin = isAndroidApkRuntime()
    ? getRemoteServerOrigin()
    : window.location.origin;
  const apkUrl = `${origin}/Simple-Android-v5.0.0.apk`;
  const senderLabel = options?.senderName
    ? `${options.senderName}${options.senderUsername ? ` (@${options.senderUsername})` : ''}`
    : 'me';

  const inviteText = options?.recipientName
    ? `Hi ${options.recipientName}! Chat with ${senderLabel} on Simple Private Messenger (End-to-End Encrypted).\n\nDownload & install the Android APK here:\n${apkUrl}`
    : `Hey! Join ${senderLabel} on Simple Private Messenger (End-to-End Encrypted).\n\nDownload & install the Android APK here:\n${apkUrl}`;

  // If user requested sharing the actual APK file (or no specific phone number is targeted) and Web Share API supports files
  if (options?.preferFileShare && typeof navigator !== 'undefined' && navigator.share) {
    try {
      const response = await fetch(apkUrl);
      if (response.ok) {
        const blob = await response.blob();
        const apkFile = new File([blob], 'Simple-Android-v5.0.0.apk', {
          type: 'application/vnd.android.package-archive',
        });
        if (!navigator.canShare || navigator.canShare({ files: [apkFile] })) {
          await navigator.share({
            title: 'Simple Messenger Android APK',
            text: inviteText,
            files: [apkFile],
          });
          return 'shared_file';
        }
      }
    } catch {
      // Fall through to link share or WhatsApp URL
    }
  }

  // If a specific recipient phone is provided, open WhatsApp directly to that number with the APK link
  if (options?.recipientPhone) {
    const cleanPhone = options.recipientPhone.replace(/[^\d]/g, '');
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(inviteText)}`
      : `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
    window.location.href = waUrl;
    return 'whatsapp_opened';
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'Simple Messenger APK',
        text: inviteText,
        url: apkUrl,
      });
      return 'shared_link';
    } catch {
      // Fall through to WhatsApp share
    }
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
  window.location.href = waUrl;
  return 'whatsapp_opened';
}

export async function shareSimpleApk(options?: {
  recipientPhone?: string;
  recipientName?: string;
  senderName?: string;
  senderUsername?: string;
}): Promise<void> {
  await shareApkOrInvite({
    ...options,
    preferFileShare: true,
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const isStandalone =
      isAndroidApkRuntime() ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}

export const AndroidInstallButton: React.FC<{
  compact?: boolean;
  variant?: 'compact' | 'banner' | 'default';
}> = ({ compact = false, variant = 'default' }) => {
  const { isInstalled } = usePWAInstall();
  const [sharingApk, setSharingApk] = useState(false);

  // Never render install/download banners or compact header buttons so the UI is clean like a real native app
  if (variant === 'banner' || variant === 'compact' || compact) {
    return null;
  }

  const origin = isAndroidApkRuntime()
    ? getRemoteServerOrigin()
    : window.location.origin;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={sharingApk}
        onClick={async () => {
          setSharingApk(true);
          try {
            await shareApkOrInvite({ preferFileShare: true });
          } finally {
            setSharingApk(false);
          }
        }}
        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
      >
        <Share2 className="w-3.5 h-3.5 shrink-0" />
        <span>{sharingApk ? 'Preparing APK...' : 'Share APK on WhatsApp'}</span>
      </button>

      {!isAndroidApkRuntime() && !isInstalled && (
        <a
          href={`${origin}/Simple-Android-v5.0.0.apk`}
          download="Simple-Android-v5.0.0.apk"
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Download APK (v5.0.0)</span>
        </a>
      )}

      {isInstalled && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Native App Active</span>
        </div>
      )}
    </div>
  );
};

