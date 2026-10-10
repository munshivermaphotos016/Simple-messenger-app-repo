import React, { useEffect, useState } from 'react';
import { Download, Smartphone, CheckCircle2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const isStandalone =
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
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const isCompact = compact || variant === 'compact';

  if (variant === 'banner') {
    if (isInstalled || bannerDismissed || !isInstallable) return null;
    return (
      <div className="px-4 py-2 bg-emerald-500/15 border-b border-emerald-500/30 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-emerald-200 min-w-0">
          <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">
            Install <strong>Simple</strong> on your Android home screen for full-screen native experience
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => install()}
            className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold"
          >
            Install Now
          </button>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Dismiss install banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (isInstalled) {
    if (isCompact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>Installed as Native App</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await install();
          } else {
            setShowGuide(true);
          }
        }}
        className={
          isCompact
            ? 'min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors shrink-0'
            : 'min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95'
        }
        title="Install Simple on Android Home Screen"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{isCompact ? 'Install App' : 'Install Android App'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Install Native Android App</h3>
                  <p className="text-[11px] text-slate-400">Created by Dr. M Verma</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <p>
                  1. Tap the <strong>Share</strong> button in your browser toolbar.
                </p>
                <p>
                  2. Scroll down and select <strong>Add to Home Screen</strong> to launch Simple in full-screen native mode.
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <p>
                  1. Open the browser menu (<strong>⋮</strong> in Chrome on Android).
                </p>
                <p>
                  2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
                <p>
                  3. Launch <strong>Simple</strong> directly from your Android app drawer in standalone full-screen mode.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[40px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
