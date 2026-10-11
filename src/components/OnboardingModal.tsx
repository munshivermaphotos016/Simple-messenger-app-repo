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
  QrCode,
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
  const [mode, setMode] = useState<'register' | 'login'>('register');

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
    const pwdHash = sha256HexSync(`simple_pw_salt_v1:${cleanUser}:${password}`);
    setIsLoading(true);

    try {
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
            <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
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
            {mode === 'register' && (
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

            {/* Password */}
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
                <strong>Zero Phone/Email Required:</strong> Only your unique @username and password
                authenticated by Google Authenticator (TOTP) are stored to prevent account misuse.
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
                  <span>Continue with Google Authenticator</span>
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
            {mode === 'register' ? (
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
