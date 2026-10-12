import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { AppSettings, ChatConversation, UserAccount } from '../types/simple';
import { PRESET_PROFILE_PHOTOS, UserAvatar } from './ProfilePhotoModal';
import { apiFetch, generateBase32Secret } from '../utils/androidBridge';
import { sha256HexSync } from '../data/initialState';
import { auth, googleProvider, signInWithPopup } from '../firebase';

interface DetectedGoogleAccount {
  email: string;
  name: string;
  picture?: string;
  source: 'firebase_device' | 'android_account_manager' | 'saved_device' | 'oauth_verified';
  oauthVerified?: boolean;
}

interface OnboardingModalProps {
  account: UserAccount;
  settings: AppSettings;
  localFingerprint: string;
  onComplete: (
    updatedAccount: UserAccount,
    updatedSettings: Partial<AppSettings>,
    restoredChats?: ChatConversation[]
  ) => void;
  onCancel?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  account,
  settings,
  localFingerprint,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'register' | 'login' | 'google'>('register');

  // Fields
  const [name, setName] = useState(account.name || '');
  const [username, setUsername] = useState(account.username || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [about, setAbout] = useState(account.about || 'Hey there! I am using Simple.');
  const [avatarColor, setAvatarColor] = useState(account.avatarColor || '#10B981');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    account.avatarUrl || PRESET_PROFILE_PHOTOS[0].url
  );

  // Device Google Account auto-detection state
  const [detectedGoogleAccounts, setDetectedGoogleAccounts] = useState<DetectedGoogleAccount[]>([]);
  const [selectedGoogleAccount, setSelectedGoogleAccount] = useState<DetectedGoogleAccount | null>(null);
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');
  const [isScanningGoogle, setIsScanningGoogle] = useState(false);

  // Username validation state
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);

  // Google Authenticator state
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [totpUri, setTotpUri] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [totpCodeInput, setTotpCodeInput] = useState<string>('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Pending invite check
  const [invitedBy, setInvitedBy] = useState<string | null>(null);

  // Status & errors
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Auto-detect Google accounts on the device (Android AccountManager bridge, Firebase Auth session, saved device accounts)
  const scanDeviceGoogleAccounts = () => {
    setIsScanningGoogle(true);
    const list: DetectedGoogleAccount[] = [];
    const seen = new Set<string>();

    const addAccount = (acc: DetectedGoogleAccount) => {
      const clean = (acc.email || '').trim().toLowerCase();
      if (!clean || !clean.includes('@') || seen.has(clean)) return;
      seen.add(clean);
      list.push({ ...acc, email: clean });
    };

    try {
      // 1. Check active Firebase Auth user on device
      if (auth.currentUser && auth.currentUser.email) {
        addAccount({
          email: auth.currentUser.email,
          name: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
          picture: auth.currentUser.photoURL || undefined,
          source: 'firebase_device',
          oauthVerified: true,
        });
      }

      // 2. Check Native Android WebView bridge if running inside Android APK
      const winAny = window as any;
      if (winAny.SimpleAndroidBridge && typeof winAny.SimpleAndroidBridge.getDeviceGoogleAccounts === 'function') {
        const rawAndroidAccounts = winAny.SimpleAndroidBridge.getDeviceGoogleAccounts();
        const parsedAndroid = typeof rawAndroidAccounts === 'string' ? JSON.parse(rawAndroidAccounts) : rawAndroidAccounts;
        if (Array.isArray(parsedAndroid)) {
          parsedAndroid.forEach((item: any) => {
            const emailStr = typeof item === 'string' ? item : item?.email;
            if (emailStr) {
              addAccount({
                email: emailStr,
                name: item?.name || emailStr.split('@')[0],
                picture: item?.picture,
                source: 'android_account_manager',
              });
            }
          });
        }
      }

      // 3. Check previously detected / linked Google accounts on this device
      const rawSaved = localStorage.getItem('simple_device_google_accounts_v1');
      if (rawSaved) {
        const parsedSaved = JSON.parse(rawSaved);
        if (Array.isArray(parsedSaved)) {
          parsedSaved.forEach((item: any) => {
            if (item && item.email) {
              addAccount({
                email: item.email,
                name: item.name || item.email.split('@')[0],
                picture: item.picture,
                source: 'saved_device',
                oauthVerified: Boolean(item.oauthVerified),
              });
            }
          });
        }
      }

      // 4. Check current account email if it's a Google email
      if (account.email && account.email.includes('@')) {
        addAccount({
          email: account.email,
          name: account.name || account.email.split('@')[0],
          picture: account.avatarUrl,
          source: 'saved_device',
        });
      }
    } catch {
      // Ignore storage errors
    }

    setDetectedGoogleAccounts(list);
    if (list.length > 0 && !selectedGoogleAccount) {
      setSelectedGoogleAccount(list[0]);
      if (!name) setName(list[0].name);
      if (!username) {
        setUsername(
          list[0].email
            .split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '')
        );
      }
    }
    setTimeout(() => setIsScanningGoogle(false), 250);
  };

  useEffect(() => {
    scanDeviceGoogleAccounts();
  }, []);

  const persistDeviceGoogleAccount = (acc: DetectedGoogleAccount) => {
    try {
      const raw = localStorage.getItem('simple_device_google_accounts_v1');
      const existing: DetectedGoogleAccount[] = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter((x) => x.email.toLowerCase() !== acc.email.toLowerCase());
      filtered.unshift(acc);
      localStorage.setItem('simple_device_google_accounts_v1', JSON.stringify(filtered.slice(0, 6)));
    } catch {
      // Ignore
    }
  };

  const handleTriggerGoogleAccountChooser = async () => {
    setErrorBanner(null);
    setIsLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const gUser = cred.user;
      if (gUser && gUser.email) {
        const detected: DetectedGoogleAccount = {
          email: gUser.email.toLowerCase(),
          name: gUser.displayName || gUser.email.split('@')[0],
          picture: gUser.photoURL || undefined,
          source: 'oauth_verified',
          oauthVerified: true,
        };
        persistDeviceGoogleAccount(detected);
        setDetectedGoogleAccounts((prev) => [
          detected,
          ...prev.filter((a) => a.email !== detected.email),
        ]);
        setSelectedGoogleAccount(detected);
        setName(detected.name);
        setUsername(
          detected.email
            .split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, '')
        );
        if (detected.picture) setAvatarUrl(detected.picture);
        setMode('google');
      }
    } catch {
      // In Android WebView or environments where popup is blocked, switch to Google Account tab so user can select or enter their device Google account and verify via Google Authenticator
      setMode('google');
    } finally {
      setIsLoading(false);
    }
  };

  // Check URL or session for invite
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite') || params.get('add_friend');
    if (inviteParam) {
      const cleanInvite = inviteParam.toLowerCase().replace(/^@/, '').trim();
      setInvitedBy(cleanInvite);
      try {
        sessionStorage.setItem('pending_invite_username', cleanInvite);
      } catch {
        // ignore
      }
    } else {
      try {
        const cachedInvite = sessionStorage.getItem('pending_invite_username');
        if (cachedInvite) setInvitedBy(cachedInvite);
      } catch {
        // ignore
      }
    }
  }, []);

  // Real-time username check on register
  useEffect(() => {
    if (mode !== 'register') {
      setUsernameAvailable(null);
      setUsernameFeedback(null);
      return;
    }

    const clean = username.toLowerCase().trim().replace(/^@/, '');
    if (!clean) {
      setUsernameAvailable(null);
      setUsernameFeedback(null);
      return;
    }

    if (clean.length < 3) {
      setUsernameAvailable(false);
      setUsernameFeedback('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-z0-9._-]+$/.test(clean)) {
      setUsernameAvailable(false);
      setUsernameFeedback('Only letters, numbers, dots, dashes, underscores');
      return;
    }

    setIsCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          setUsernameAvailable(data.available);
          setUsernameFeedback(
            data.available ? `@${clean} is available!` : `@${clean} is already taken`
          );
        }
      } catch {
        // Network error
      } finally {
        setIsCheckingUsername(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username, mode]);

  // Generate Google Authenticator secret when advancing to step 2 in Register
  const initTotpEnrollment = async (cleanUser: string) => {
    const secret = generateBase32Secret(20);
    const label = encodeURIComponent(`Simple:@${cleanUser}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=Simple&algorithm=SHA1&digits=6&period=30`;
    setTotpSecret(secret);
    setTotpUri(uri);

    try {
      const qr = await QRCode.toDataURL(uri, {
        width: 240,
        margin: 1,
        color: { dark: '#020617', light: '#ffffff' },
      });
      setQrDataUrl(qr);
    } catch (err) {
      console.error('Failed to render TOTP QR code', err);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSecret) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(totpSecret);
      } else {
        const el = document.createElement('input');
        el.value = totpSecret;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      // ignore
    }
  };

  // Step 1 Submission
  const handleProceedToStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const cleanUser = username.toLowerCase().trim().replace(/^@/, '');
    if (!cleanUser || cleanUser.length < 3) {
      setErrorBanner('Please enter a username of at least 3 characters.');
      return;
    }

    if (mode === 'google') {
      const targetEmail = (selectedGoogleAccount?.email || manualGoogleEmail || '').trim().toLowerCase();
      if (!targetEmail || !targetEmail.includes('@')) {
        setErrorBanner('Please select a detected Google account or enter your Google email.');
        return;
      }
      if (!cleanUser || cleanUser.length < 3) {
        setErrorBanner('Please choose a unique @username (min 3 characters).');
        return;
      }

      if (!selectedGoogleAccount) {
        const added: DetectedGoogleAccount = {
          email: targetEmail,
          name: name.trim() || targetEmail.split('@')[0],
          source: 'saved_device',
        };
        setSelectedGoogleAccount(added);
        persistDeviceGoogleAccount(added);
      }

      // If already OAuth verified via Google Sign-In popup, we can create/sign-in directly or let them enroll TOTP
      if (selectedGoogleAccount?.oauthVerified) {
        setIsLoading(true);
        try {
          const res = await apiFetch('/api/auth/google-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: targetEmail,
              name: name.trim() || selectedGoogleAccount.name || cleanUser,
              username: cleanUser,
              avatarUrl,
              avatarColor,
              googleVerified: true,
              identityFingerprint: localFingerprint,
            }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            const googleAcct: UserAccount = {
              id: data.user.uid,
              name: data.user.name,
              username: data.user.username,
              phone: data.user.phone || '',
              normalizedPhone: data.user.normalizedPhone || '',
              email: data.user.email || targetEmail,
              authMethod: 'google',
              verificationToken: data.sessionToken,
              about: data.user.about || about,
              avatarColor: data.user.avatarColor || avatarColor,
              avatarUrl: data.user.avatarUrl || avatarUrl,
              allowUsernameDiscovery: true,
              hidePhoneNumber: true,
              onboardingCompleted: true,
            };
            if (invitedBy && invitedBy !== googleAcct.username) {
              apiFetch('/api/friends/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fromUid: data.user.uid,
                  toUsername: invitedBy,
                }),
              }).catch(() => {});
            }
            onComplete(googleAcct, {
              ...settings,
              cloudBackupAccountEmail: targetEmail,
            });
            return;
          }
        } catch {
          // Fall back to Google Authenticator verification for this Google account
        } finally {
          setIsLoading(false);
        }
      }

      await initTotpEnrollment(targetEmail);
      setStep(2);
      return;
    }

    if (password.length < 6) {
      setErrorBanner('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorBanner('Please enter your full name or display name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorBanner('Passwords do not match. Please re-enter.');
        return;
      }
      if (usernameAvailable === false) {
        setErrorBanner(`Username @${cleanUser} is already taken. Please choose another.`);
        return;
      }

      await initTotpEnrollment(cleanUser);
      setStep(2);
    } else {
      // Mode is login: pre-verify username and password on backend
      setIsLoading(true);
      try {
        const pwdHash = sha256HexSync(`simple_pw_salt_v1:${cleanUser}:${password}`);
        const checkRes = await apiFetch('/api/auth/check-user-for-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cleanUser,
            passwordHash: pwdHash,
          }),
        });
        const checkData = await checkRes.json();
        if (!checkRes.ok || !checkData.ok) {
          setErrorBanner(checkData.error || 'Invalid username or password.');
          setIsLoading(false);
          return;
        }

        setName(checkData.name || cleanUser);
        if (checkData.avatarUrl) setAvatarUrl(checkData.avatarUrl);
        if (checkData.avatarColor) setAvatarColor(checkData.avatarColor);
        setStep(2);
      } catch {
        setErrorBanner('Unable to contact server. Please verify your connection.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Step 2 Submission (Google Authenticator Code Verification)
  const handleFinalizeVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const cleanCode = totpCodeInput.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorBanner('Please enter the 6-digit verification code from Google Authenticator.');
      return;
    }

    const cleanUser = username.toLowerCase().trim().replace(/^@/, '');
    const pwdHash = sha256HexSync(`simple_pw_salt_v1:${cleanUser}:${password || cleanUser}`);
    setIsLoading(true);

    try {
      if (mode === 'google') {
        const targetEmail = (selectedGoogleAccount?.email || manualGoogleEmail || '').trim().toLowerCase();
        const res = await apiFetch('/api/auth/google-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: targetEmail,
            name: name.trim() || selectedGoogleAccount?.name || cleanUser,
            username: cleanUser,
            avatarUrl,
            avatarColor,
            passwordHash: pwdHash,
            totpSecret,
            totpCode: cleanCode,
            identityFingerprint: localFingerprint,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorBanner(data.error || 'Invalid 6-digit Google Authenticator code.');
          setIsLoading(false);
          return;
        }

        const googleAcct: UserAccount = {
          id: data.user.uid,
          name: data.user.name,
          username: data.user.username,
          phone: data.user.phone || '',
          normalizedPhone: data.user.normalizedPhone || '',
          email: data.user.email || targetEmail,
          authMethod: 'google',
          passwordHash: pwdHash,
          totpSecret,
          verificationToken: data.sessionToken,
          about: data.user.about || about,
          avatarColor: data.user.avatarColor || avatarColor,
          avatarUrl: data.user.avatarUrl || avatarUrl,
          allowUsernameDiscovery: true,
          hidePhoneNumber: true,
          onboardingCompleted: true,
        };

        if (invitedBy && invitedBy !== googleAcct.username) {
          apiFetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromUid: data.user.uid,
              toUsername: invitedBy,
            }),
          }).catch(() => {});
        }

        onComplete(googleAcct, {
          ...settings,
          cloudBackupAccountEmail: targetEmail,
        });
        return;
      }

      if (mode === 'register') {
        const res = await apiFetch('/api/auth/register-totp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cleanUser,
            name: name.trim(),
            passwordHash: pwdHash,
            totpSecret,
            code: cleanCode,
            avatarUrl,
            avatarColor,
            about,
            identityFingerprint: localFingerprint,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorBanner(data.error || 'Verification failed. Please check your 6-digit code.');
          setIsLoading(false);
          return;
        }

        const registeredAccount: UserAccount = {
          id: data.user.uid,
          name: data.user.name,
          username: data.user.username,
          phone: '',
          normalizedPhone: '',
          email: '',
          authMethod: 'totp',
          passwordHash: pwdHash,
          totpSecret,
          verificationToken: data.sessionToken,
          about: data.user.about || about,
          avatarColor: data.user.avatarColor || avatarColor,
          avatarUrl: data.user.avatarUrl || avatarUrl,
          allowUsernameDiscovery: true,
          hidePhoneNumber: true,
          onboardingCompleted: true,
        };

        // If there was an invite from another user, send friend request automatically!
        if (invitedBy && invitedBy !== cleanUser) {
          apiFetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromUid: data.user.uid,
              toUsername: invitedBy,
            }),
          }).catch(() => {});
        }

        onComplete(registeredAccount, settings);
      } else {
        // LOGIN
        const res = await apiFetch('/api/auth/login-totp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cleanUser,
            passwordHash: pwdHash,
            code: cleanCode,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorBanner(data.error || 'Verification failed. Incorrect Google Authenticator code.');
          setIsLoading(false);
          return;
        }

        let restoredChats: ChatConversation[] = [];
        if (data.backupJson) {
          try {
            const parsedBackup = JSON.parse(data.backupJson);
            if (Array.isArray(parsedBackup.chats)) {
              restoredChats = parsedBackup.chats;
            }
          } catch {
            // ignore backup parse error
          }
        }

        const loggedInAccount: UserAccount = {
          id: data.user.uid,
          name: data.user.name,
          username: data.user.username,
          phone: data.user.phone || '',
          normalizedPhone: data.user.normalizedPhone || '',
          email: data.user.email || '',
          authMethod: 'totp',
          passwordHash: pwdHash,
          verificationToken: data.sessionToken,
          about: data.user.about || 'Hey there! I am using Simple.',
          avatarColor: data.user.avatarColor || '#10B981',
          avatarUrl: data.user.avatarUrl,
          allowUsernameDiscovery: true,
          hidePhoneNumber: true,
          onboardingCompleted: true,
        };

        // If there was an invite from another user, send friend request automatically!
        if (invitedBy && invitedBy !== cleanUser) {
          apiFetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromUid: data.user.uid,
              toUsername: invitedBy,
            }),
          }).catch(() => {});
        }

        onComplete(loggedInAccount, settings, restoredChats);
      }
    } catch {
      setErrorBanner('Failed to complete verification. Please check your network.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl shadow-emerald-950/50 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top ambient glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-emerald-500/20 via-teal-500/10 to-transparent pointer-events-none" />

        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-600 text-slate-950 rounded-2xl shadow-md shadow-emerald-500/20 font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {step === 1
                  ? mode === 'register'
                    ? 'Create Your Account'
                    : 'Sign In to Simple'
                  : 'Google Authenticator'}
              </h2>
              <p className="text-xs text-slate-400">
                {step === 1
                  ? 'Protected with Google Authenticator (TOTP)'
                  : 'Enter 6-digit code to verify your identity'}
              </p>
            </div>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Invited banner */}
        {invitedBy && (
          <div className="mx-5 mt-3 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5 animate-fade-in">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Invited by <strong className="font-mono text-white">@{invitedBy}</strong>! You will
              be automatically connected as friends after verification.
            </span>
          </div>
        )}

        {/* Mode Switch (Only on Step 1) */}
        {step === 1 && (
          <div className="px-5 pt-3">
            <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorBanner(null);
                }}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'register'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorBanner(null);
                }}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'login'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('google');
                  setErrorBanner(null);
                  scanDeviceGoogleAccounts();
                }}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'google'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Google Account</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorBanner && (
          <div className="mx-5 mt-3 p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2 animate-fade-in">
            <X className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Step 1: Form Details */}
        {step === 1 && (
          <form onSubmit={handleProceedToStep2} className="p-5 space-y-4 overflow-y-auto flex-1">
            {mode !== 'google' && (
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-emerald-500/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {detectedGoogleAccounts.length > 0
                        ? `Device Google Account: ${detectedGoogleAccounts[0].email}`
                        : 'Use Google Account on Device'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      Auto-detects your device Google account for fast signup/login
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('google');
                    scanDeviceGoogleAccounts();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold shrink-0 transition-colors"
                >
                  Use Google
                </button>
              </div>
            )}

            {mode === 'google' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">
                        Detected Google Accounts on Device
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={scanDeviceGoogleAccounts}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                    >
                      <RefreshCw className={`w-3 h-3 ${isScanningGoogle ? 'animate-spin' : ''}`} />
                      <span>Rescan</span>
                    </button>
                  </div>

                  {detectedGoogleAccounts.length > 0 ? (
                    <div className="space-y-2">
                      {detectedGoogleAccounts.map((acc) => {
                        const isSelected = selectedGoogleAccount?.email === acc.email;
                        return (
                          <button
                            key={acc.email}
                            type="button"
                            onClick={() => {
                              setSelectedGoogleAccount(acc);
                              setManualGoogleEmail(acc.email);
                              setName(acc.name);
                              setUsername(
                                acc.email
                                  .split('@')[0]
                                  .toLowerCase()
                                  .replace(/[^a-z0-9._-]/g, '')
                              );
                              if (acc.picture) setAvatarUrl(acc.picture);
                            }}
                            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-all ${
                              isSelected
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <UserAvatar
                                name={acc.name || acc.email}
                                avatarUrl={acc.picture}
                                avatarColor="#10B981"
                                sizeClass="w-9 h-9"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{acc.name}</p>
                                <p className="text-[11px] text-emerald-400 font-mono truncate">
                                  {acc.email}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              {acc.oauthVerified && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                                  Verified
                                </span>
                              )}
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Tap below to auto-detect your Google account from this device or enter your Google Account email.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleTriggerGoogleAccountChooser}
                    className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <Mail className="w-4 h-4 text-emerald-600" />
                    <span>Detect / Choose Google Account from Device</span>
                  </button>

                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Or confirm device Google Account Email:
                    </label>
                    <input
                      type="email"
                      value={selectedGoogleAccount?.email || manualGoogleEmail}
                      onChange={(e) => {
                        const val = e.target.value.trim().toLowerCase();
                        setManualGoogleEmail(val);
                        setSelectedGoogleAccount(
                          val
                            ? {
                                email: val,
                                name: name || val.split('@')[0],
                                source: 'saved_device',
                              }
                            : null
                        );
                        if (val.includes('@') && !username) {
                          setUsername(
                            val
                              .split('@')[0]
                              .toLowerCase()
                              .replace(/[^a-z0-9._-]/g, '')
                          );
                        }
                      }}
                      placeholder="your.account@gmail.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>
              </div>
            )}

            {(mode === 'register' || mode === 'google') && (
              <>
                {/* Avatar Picker */}
                <div className="flex flex-col items-center justify-center py-2">
                  <div className="relative mb-2">
                    <UserAvatar
                      name={name || username || 'U'}
                      avatarUrl={avatarUrl}
                      avatarColor={avatarColor}
                      sizeClass="w-16 h-16"
                    />
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
                    {PRESET_PROFILE_PHOTOS.slice(0, 5).map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setAvatarUrl(photo.url)}
                        className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform ${
                          avatarUrl === photo.url
                            ? 'border-emerald-400 scale-110 shadow-md shadow-emerald-500/30'
                            : 'border-slate-700 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={photo.url}
                          alt={photo.label}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Profile Name</label>
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-emerald-500/50">
                    <User className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Rivers"
                      className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Unique Username */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Unique Username</label>
                {mode === 'register' && usernameFeedback && (
                  <span
                    className={`text-[11px] font-semibold ${
                      usernameAvailable ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {usernameFeedback}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-emerald-500/50">
                <span className="text-emerald-400 font-mono font-bold text-sm">@</span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="unique_username"
                  className="w-full bg-transparent text-sm text-white font-mono placeholder-slate-500 focus:outline-none"
                />
                {mode === 'register' && username && (
                  <div className="shrink-0">
                    {isCheckingUsername ? (
                      <span className="text-[10px] text-slate-400">...</span>
                    ) : usernameAvailable ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <X className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                )}
              </div>
              {mode === 'register' && (
                <p className="text-[10px] text-slate-500">
                  Friends can find and add you using your unique @username.
                </p>
              )}
            </div>

            {/* Password (for username/password modes) */}
            {mode !== 'google' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Account Password</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-emerald-500/50">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (min 6 chars)"
                    className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password (Register only) */}
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-emerald-500/50">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Security Guarantee Notice */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                {mode === 'google' ? (
                  <>
                    <strong>Verified Google Account:</strong> Your device Google account is verified with Google Sign-In or Google Authenticator before creating or signing into your Simple account.
                  </>
                ) : (
                  <>
                    <strong>Zero Phone/Email Required:</strong> Only your unique @username and password authenticated by Google Authenticator (TOTP) are stored to prevent account misuse.
                  </>
                )}
              </span>
            </div>

            {/* Next Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              {isLoading ? (
                'Checking...'
              ) : (
                <>
                  <span>
                    {mode === 'google'
                      ? 'Continue with Google Account'
                      : 'Continue with Google Authenticator'}
                  </span>
                  <Smartphone className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2: Google Authenticator Verification */}
        {step === 2 && (
          <form
            onSubmit={handleFinalizeVerification}
            className="p-5 space-y-4 overflow-y-auto flex-1 flex flex-col"
          >
            {mode === 'register' || mode === 'google' ? (
              <>
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center flex flex-col items-center">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full mb-3">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Scan with Google Authenticator</span>
                  </div>

                  {/* QR Code Container */}
                  <div className="p-3 bg-white rounded-2xl shadow-xl border border-slate-200">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Google Authenticator QR Code"
                        className="w-44 h-44 object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-slate-400">
                        <QrCode className="w-10 h-10 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Setup Key box with copy */}
                  <div className="w-full mt-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-left">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">
                        Manual Setup Key
                      </p>
                      <p className="text-xs font-mono font-bold text-emerald-300 truncate">
                        {totpSecret}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-all ${
                        copiedSecret
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                      }`}
                    >
                      {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">How to set up:</p>
                  <p>1. Open Google Authenticator (or Authy / 1Password) on your device.</p>
                  <p>2. Tap &ldquo;+&rdquo; and scan the QR code above or enter the setup key.</p>
                  <p>3. Enter the 6-digit code generated for Simple below.</p>
                </div>
              </>
            ) : (
              /* LOGIN STEP 2 */
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center flex flex-col items-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Enter 6-Digit Authenticator Code</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Open Google Authenticator and enter the active code for{' '}
                    <strong className="text-emerald-400 font-mono">@{username}</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* 6-Digit Numeric Code Input */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-300 block text-center">
                6-Digit Authenticator Code
              </label>
              <input
                type="text"
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full bg-slate-950 border border-emerald-500/40 rounded-2xl py-3.5 text-center text-2xl font-mono font-bold tracking-[0.5em] text-emerald-400 placeholder-slate-700 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 py-3 px-3 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading || totpCodeInput.length !== 6}
                className="w-2/3 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                {isLoading ? (
                  'Verifying...'
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{mode === 'register' ? 'Verify & Create Account' : 'Verify & Sign In'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
