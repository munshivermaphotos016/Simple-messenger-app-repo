import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Bell,
  Mic,
  Camera,
  Users,
  Fingerprint,
  HardDrive,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { AppSettings, AudienceVisibility, UserAccount } from '../types/simple';
import { generateDefaultUsername, normalizePhone } from '../data/initialState';
import { recoverCloudAccountBackup } from '../firebase';
import { InlineProfilePhotoEditor, PRESET_PROFILE_PHOTOS, UserAvatar } from './ProfilePhotoModal';
import { apiFetch } from '../utils/androidBridge';

interface OnboardingModalProps {
  account: UserAccount;
  settings: AppSettings;
  localFingerprint: string;
  onComplete: (updatedAccount: UserAccount, updatedSettings: Partial<AppSettings>, restoredChats?: any[]) => void;
  onCancel?: () => void;
}

const STEPS = [
  'Welcome',
  'Privacy Principles',
  'Account Identifier',
  'Verification',
  'Profile Setup',
  'Username & Discovery',
  'Profile Photo',
  'Contacts Permission',
  'Notification Permission',
  'Microphone Permission',
  'Camera Permission',
  'Biometric Lock',
  'PIN / Passcode',
  'Encrypted Backup',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  account,
  settings,
  localFingerprint,
  onComplete,
  onCancel,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  // Form states across the 14 steps
  const [authMethod, setAuthMethod] = useState<'phone_otp' | 'gmail_otp' | 'both'>(
    account.authMethod || 'phone_otp'
  );
  const [phoneInput, setPhoneInput] = useState(account.phone);
  const [emailInput, setEmailInput] = useState(
    account.email && account.email.toLowerCase().endsWith('@gmail.com')
      ? account.email
      : account.email
      ? `${account.email.split('@')[0]}@gmail.com`
      : ''
  );
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [dispatchedPhoneOtp, setDispatchedPhoneOtp] = useState<string | null>(null);
  const [dispatchedEmailOtp, setDispatchedEmailOtp] = useState<string | null>(null);
  const [isPhoneOtpVerified, setIsPhoneOtpVerified] = useState(false);
  const [isEmailOtpVerified, setIsEmailOtpVerified] = useState(false);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const [otpStatusMsg, setOtpStatusMsg] = useState<string | null>(null);
  const [isBusyOtp, setIsBusyOtp] = useState(false);
  const [nameInput, setNameInput] = useState(account.name);
  const [aboutInput, setAboutInput] = useState(account.about);
  const [usernameInput, setUsernameInput] = useState(account.username);
  const [allowDiscovery, setAllowDiscovery] = useState(account.allowUsernameDiscovery);
  const [hidePhone, setHidePhone] = useState(account.hidePhoneNumber);
  const [avatarColor, setAvatarColor] = useState(account.avatarColor);
  const [avatarUrlInput, setAvatarUrlInput] = useState<string | undefined>(account.avatarUrl);
  const [photoVisibilityInput, setPhotoVisibilityInput] = useState<AudienceVisibility>(
    settings.profilePhotoVisibility || 'contacts'
  );

  const [contactsPerm, setContactsPerm] = useState(settings.contactsPermissionGranted);
  const [notifPerm, setNotifPerm] = useState(settings.notificationsPermissionGranted);
  const [privateNotif, setPrivateNotif] = useState(settings.privateNotificationsMode);
  const [micPerm, setMicPerm] = useState(settings.microphonePermissionGranted);
  const [camPerm, setCamPerm] = useState(settings.cameraPermissionGranted);
  const [bioEnabled, setBioEnabled] = useState(settings.biometricsEnabled);
  const [pinCode, setPinCode] = useState(settings.appLockPin);
  const [enableAppPin, setEnableAppPin] = useState(settings.appLockMethod === 'pin');
  const [backupChoice, setBackupChoice] = useState<'none' | 'local_encrypted' | 'cloud_e2ee'>(
    settings.backupMode
  );
  const [cloudBackupProvider, setCloudBackupProvider] = useState<'google_drive' | 'gmail'>(
    settings.cloudBackupProvider || 'google_drive'
  );
  const [backupGmailInput, setBackupGmailInput] = useState(
    emailInput.toLowerCase().endsWith('@gmail.com') ? emailInput : settings.cloudBackupGmail || ''
  );
  const [backupGmailOtpInput, setBackupGmailOtpInput] = useState('');
  const [dispatchedBackupGmailOtp, setDispatchedBackupGmailOtp] = useState<string | null>(null);
  const [isBackupGmailVerified, setIsBackupGmailVerified] = useState(false);
  const [backupGmailError, setBackupGmailError] = useState<string | null>(null);

  const isValidGmailAddress = (raw: string) => {
    const clean = raw.trim().toLowerCase();
    return (
      clean.length >= 11 &&
      (clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com')) &&
      !clean.startsWith('@')
    );
  };

  const [existingAccountFound, setExistingAccountFound] = useState<{
    uid: string;
    username: string;
    name?: string;
    chats?: any[];
    settings?: Partial<AppSettings>;
  } | null>(null);
  const [autoRestoreOnVerify, setAutoRestoreOnVerify] = useState(true);
  const [accountMode, setAccountMode] = useState<'register' | 'login'>('register');
  const [passwordInput, setPasswordInput] = useState('');

  const sha256Hex = async (text: string): Promise<string> => {
    const encoded = new TextEncoder().encode(text.trim());
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  // Check database for existing account by phone or email
  const checkDatabaseForExistingAccount = async () => {
    const normPhone = authMethod !== 'gmail_otp' ? normalizePhone(phoneInput) : '';
    const cleanEmail = authMethod !== 'phone_otp' ? emailInput.trim().toLowerCase() : '';
    if (normPhone.length < 7 && !cleanEmail.includes('@')) return;

    try {
      const qParams = new URLSearchParams();
      if (normPhone.length >= 7) qParams.set('phoneHash', normPhone);
      if (cleanEmail.includes('@')) qParams.set('emailHash', cleanEmail);
      const res = await apiFetch(`/api/account/recover?${qParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.backupJson) {
          const parsed = JSON.parse(data.backupJson);
          setExistingAccountFound({
            uid: data.uid || parsed.account?.id || `usr_${normPhone || Date.now()}`,
            username: data.username || parsed.account?.username || 'user',
            name: parsed.account?.name,
            chats: parsed.chats,
            settings: parsed.settings,
          });
          return;
        }
      }

      // Check Firestore Cloud backup
      const cloudJson = await recoverCloudAccountBackup({
        phoneHash: normPhone.length >= 7 ? normPhone : undefined,
        emailHash: cleanEmail.includes('@') ? cleanEmail : undefined,
      });
      if (cloudJson) {
        const parsed = JSON.parse(cloudJson);
        setExistingAccountFound({
          uid: parsed.account?.id || `usr_${normPhone || Date.now()}`,
          username: parsed.account?.username || 'user',
          name: parsed.account?.name,
          chats: parsed.chats,
          settings: parsed.settings,
        });
      }
    } catch {
      // Ignore network errors during lookup
    }
  };

  // Request real server-side 6-digit OTP codes for Mobile Phone & Gmail
  const handleDispatchOnboardingOtps = async () => {
    setOtpErrorMsg(null);
    setOtpStatusMsg(null);
    const needPhone = authMethod === 'phone_otp' || authMethod === 'both';
    const needGmail = authMethod === 'gmail_otp' || authMethod === 'both';
    const hasPhone = normalizePhone(phoneInput).length >= 7;
    const hasGmail = isValidGmailAddress(emailInput);

    if (needPhone && !hasPhone) {
      setOtpErrorMsg(
        'Please enter a valid Mobile Phone Number (at least 7 digits) to receive your SMS verification OTP.'
      );
      return false;
    }

    if (needGmail && !hasGmail) {
      setOtpErrorMsg(
        'Account creation by email requires a valid Gmail address ending in @gmail.com to receive your verification OTP.'
      );
      return false;
    }

    setIsBusyOtp(true);
    try {
      if (needPhone && !isPhoneOtpVerified) {
        const res = await apiFetch('/api/auth/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'phone', target: phoneInput.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setOtpErrorMsg(data.error || 'Failed to send SMS OTP.');
          setIsBusyOtp(false);
          return false;
        }
        setDispatchedPhoneOtp(String(data.sandboxDispatchedOtp || ''));
      }

      if (needGmail && !isEmailOtpVerified) {
        const res = await apiFetch('/api/auth/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'email', target: emailInput.trim().toLowerCase() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setOtpErrorMsg(data.error || 'Failed to send Gmail OTP.');
          setIsBusyOtp(false);
          return false;
        }
        setDispatchedEmailOtp(String(data.sandboxDispatchedOtp || ''));
      }

      setOtpStatusMsg(
        '6-digit verification OTP dispatched! Enter the code below to verify your account.'
      );
      setIsBusyOtp(false);
      return true;
    } catch {
      setOtpErrorMsg('Network error while requesting OTP from verification server.');
      setIsBusyOtp(false);
      return false;
    }
  };

  // Verify entered 6-digit OTP(s) against server
  const handleVerifyOnboardingOtps = async (): Promise<boolean> => {
    setOtpErrorMsg(null);
    const needPhone = authMethod === 'phone_otp' || authMethod === 'both';
    const needGmail = authMethod === 'gmail_otp' || authMethod === 'both';

    setIsBusyOtp(true);
    try {
      if (needPhone && !isPhoneOtpVerified) {
        if (phoneOtpInput.trim().length !== 6) {
          setOtpErrorMsg('Please enter the 6-digit SMS OTP sent to your mobile number.');
          setIsBusyOtp(false);
          return false;
        }
        const res = await apiFetch('/api/auth/request-otp-check-or-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => null);
        void res;
        const vRes = await apiFetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'phone',
            target: phoneInput.trim(),
            code: phoneOtpInput.trim(),
          }),
        });
        const data = await vRes.json();
        if (!vRes.ok || !data.ok) {
          setOtpErrorMsg(data.error || 'Invalid Mobile SMS OTP code.');
          setIsBusyOtp(false);
          return false;
        }
        setIsPhoneOtpVerified(true);
      }

      if (needGmail && !isEmailOtpVerified) {
        if (emailOtpInput.trim().length !== 6) {
          setOtpErrorMsg('Please enter the 6-digit OTP sent to your Gmail address.');
          setIsBusyOtp(false);
          return false;
        }
        const vRes = await apiFetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'email',
            target: emailInput.trim().toLowerCase(),
            code: emailOtpInput.trim(),
          }),
        });
        const data = await vRes.json();
        if (!vRes.ok || !data.ok) {
          setOtpErrorMsg(data.error || 'Invalid Gmail OTP code.');
          setIsBusyOtp(false);
          return false;
        }
        setIsEmailOtpVerified(true);
        setBackupGmailInput(emailInput.trim().toLowerCase());
        setIsBackupGmailVerified(true);
      }

      setIsBusyOtp(false);
      return true;
    } catch {
      setOtpErrorMsg('Failed to verify OTP with server.');
      setIsBusyOtp(false);
      return false;
    }
  };

  // Send OTP specifically for Cloud Backup Gmail in Step 13 (when user registered by Phone only)
  const handleRequestBackupGmailOtp = async () => {
    setBackupGmailError(null);
    if (!isValidGmailAddress(backupGmailInput)) {
      setBackupGmailError(
        'Cloud Backup to Google Drive or Gmail requires a valid @gmail.com address.'
      );
      return;
    }
    setIsBusyOtp(true);
    try {
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          target: backupGmailInput.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupGmailError(data.error || 'Failed to send Gmail OTP for Cloud Backup.');
      } else {
        setDispatchedBackupGmailOtp(String(data.sandboxDispatchedOtp || ''));
      }
    } catch {
      setBackupGmailError('Network error requesting Gmail OTP.');
    } finally {
      setIsBusyOtp(false);
    }
  };

  const handleVerifyBackupGmailOtp = async (): Promise<boolean> => {
    setBackupGmailError(null);
    if (isBackupGmailVerified && isValidGmailAddress(backupGmailInput)) return true;
    if (!isValidGmailAddress(backupGmailInput)) {
      setBackupGmailError('Please provide a valid @gmail.com address for Cloud Backup.');
      return false;
    }
    if (backupGmailOtpInput.trim().length !== 6) {
      setBackupGmailError('Please enter the 6-digit Gmail OTP to link your Cloud Backup Gmail.');
      return false;
    }
    setIsBusyOtp(true);
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          target: backupGmailInput.trim().toLowerCase(),
          code: backupGmailOtpInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupGmailError(data.error || 'Invalid 6-digit Gmail OTP.');
        setIsBusyOtp(false);
        return false;
      }
      setIsBackupGmailVerified(true);
      setEmailInput(backupGmailInput.trim().toLowerCase());
      setIsEmailOtpVerified(true);
      setIsBusyOtp(false);
      return true;
    } catch {
      setBackupGmailError('Failed to verify Gmail OTP.');
      setIsBusyOtp(false);
      return false;
    }
  };

  const finalizeAccountSetup = async (customCloudGmail?: string) => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setOtpErrorMsg('Please enter your display name to create your account.');
      setStepIdx(4);
      return;
    }

    const finalPhone = authMethod !== 'gmail_otp' ? phoneInput.trim() : '';
    const normPhone = normalizePhone(finalPhone);
    const finalEmail =
      customCloudGmail ||
      (authMethod !== 'phone_otp' ? emailInput.trim().toLowerCase() : '');
    const finalUsername =
      usernameInput.trim().toLowerCase().replace(/^@/, '') ||
      generateDefaultUsername(trimmedName, finalPhone, finalEmail);

    const deterministicUid =
      account.id && account.id.trim().length > 0
        ? account.id
        : normPhone.length >= 7
        ? `usr_${normPhone}`
        : finalEmail
        ? `usr_${finalEmail.replace(/[^a-z0-9]/g, '_')}`
        : `usr_${Date.now().toString(36)}`;

    const phoneHash = normPhone.length >= 7 ? await sha256Hex(normPhone) : '';
    const phoneTailHash =
      normPhone.length >= 7 ? await sha256Hex(normPhone.slice(-10)) : '';
    const emailHash = finalEmail.includes('@') ? await sha256Hex(finalEmail) : '';
    const passwordHash = passwordInput.trim()
      ? await sha256Hex(passwordInput.trim())
      : '';

    try {
      await apiFetch('/api/directory/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: deterministicUid,
          name: trimmedName,
          username: finalUsername,
          phone: finalPhone,
          normalizedPhone: normPhone,
          phoneHash,
          phoneTailHash,
          email: finalEmail,
          emailHash,
          passwordHash,
          about: aboutInput.trim() || 'Hey there! I am using Simple.',
          avatarColor,
          avatarUrl: avatarUrlInput,
          identityFingerprint: localFingerprint,
          allowUsernameDiscovery: allowDiscovery,
          hidePhoneNumber: hidePhone,
        }),
      });
    } catch {
      // Offline fallback handled by App.tsx sync
    }

    onComplete(
      {
        ...account,
        id: deterministicUid,
        name: trimmedName,
        username: finalUsername,
        phone: finalPhone,
        normalizedPhone: normPhone,
        email: finalEmail,
        authMethod:
          finalPhone && finalEmail ? 'both' : finalPhone ? 'phone_otp' : 'gmail_otp',
        phoneVerified: Boolean(finalPhone),
        emailVerified: Boolean(finalEmail),
        about: aboutInput.trim() || 'Hey there! I am using Simple.',
        avatarColor,
        avatarUrl: avatarUrlInput,
        allowUsernameDiscovery: allowDiscovery,
        hidePhoneNumber: hidePhone,
        onboardingCompleted: true,
      },
      {
        profilePhotoVisibility: photoVisibilityInput,
        contactsPermissionGranted: contactsPerm,
        notificationsPermissionGranted: notifPerm,
        privateNotificationsMode: privateNotif,
        microphonePermissionGranted: micPerm,
        cameraPermissionGranted: camPerm,
        biometricsEnabled: bioEnabled,
        appLockPin: pinCode || '2580',
        chatLockPin: pinCode || '2580',
        appLockMethod: enableAppPin ? 'pin' : bioEnabled ? 'biometric' : 'none',
        backupMode: backupChoice,
        cloudBackupProvider,
        cloudBackupGmail: customCloudGmail || settings.cloudBackupGmail,
        cloudBackupGmailVerified: Boolean(customCloudGmail),
      }
    );
  };

  const nextStep = async () => {
    if (stepIdx === 2) {
      await checkDatabaseForExistingAccount();
      const dispatched = await handleDispatchOnboardingOtps();
      if (!dispatched) return;
      setStepIdx(3);
      return;
    }

    if (stepIdx === 3) {
      const verified = await handleVerifyOnboardingOtps();
      if (!verified) return;

      if (existingAccountFound && (autoRestoreOnVerify || accountMode === 'login')) {
        if (existingAccountFound.name) setNameInput(existingAccountFound.name);
        if (existingAccountFound.username) setUsernameInput(existingAccountFound.username);
        const cleanPhone = authMethod !== 'gmail_otp' ? phoneInput.trim() : '';
        const cleanGmail =
          authMethod !== 'phone_otp' ? emailInput.trim().toLowerCase() : '';
        onComplete(
          {
            ...account,
            id:
              existingAccountFound.uid ||
              account.id ||
              `usr_${normalizePhone(cleanPhone) || Date.now()}`,
            name: existingAccountFound.name || nameInput.trim() || 'Simple User',
            username: existingAccountFound.username,
            phone: cleanPhone,
            normalizedPhone: normalizePhone(cleanPhone),
            email: cleanGmail,
            authMethod,
            phoneVerified: authMethod !== 'gmail_otp',
            emailVerified: authMethod !== 'phone_otp',
            avatarUrl: avatarUrlInput,
            avatarColor,
            onboardingCompleted: true,
          },
          {
            ...settings,
            profilePhotoVisibility: photoVisibilityInput,
            ...(existingAccountFound.settings || {}),
          },
          existingAccountFound.chats
        );
        return;
      }

      setStepIdx(4);
      return;
    }

    if (stepIdx === 4) {
      if (!nameInput.trim()) {
        setOtpErrorMsg('Please enter your real display name to continue.');
        return;
      }
      setOtpErrorMsg(null);
      if (!usernameInput.trim()) {
        setUsernameInput(
          generateDefaultUsername(
            nameInput,
            authMethod !== 'gmail_otp' ? phoneInput : '',
            authMethod !== 'phone_otp' ? emailInput : ''
          )
        );
      }
      setStepIdx(5);
      return;
    }

    if (stepIdx < STEPS.length - 1) {
      setStepIdx((s) => s + 1);
    } else {
      // Step 13 (Final Step: Encrypted Backup)
      let verifiedCloudGmail =
        authMethod !== 'phone_otp' && isValidGmailAddress(emailInput)
          ? emailInput.trim().toLowerCase()
          : '';

      if (backupChoice === 'cloud_e2ee') {
        if (!verifiedCloudGmail) {
          const ok = await handleVerifyBackupGmailOtp();
          if (!ok) return;
          verifiedCloudGmail = backupGmailInput.trim().toLowerCase();
        }
      }

      await finalizeAccountSetup(verifiedCloudGmail);
    }
  };

  const prevStep = () => {
    if (stepIdx > 0) setStepIdx((s) => s - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header Progress */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-800 shrink-0">
          <div>
            <span className="text-xs font-mono text-emerald-400 tabular-nums">
              Step {stepIdx + 1} of {STEPS.length} · {STEPS[stepIdx]}
            </span>
            <div className="mt-1.5 w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${(stepIdx + 1) / STEPS.length})` }}
              />
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Close onboarding wizard"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Step Body */}
        <div className="py-4 sm:py-6 min-h-[240px] flex-1 overflow-y-auto flex flex-col justify-start">
          {stepIdx === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
                  Created by Dr. M Verma
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Welcome to Simple</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                A modern, fast, private native Android messenger created by <strong>Dr. M Verma</strong>. Create your real account or sign in to sync your phone contacts, chat with friends on Simple, or invite anyone via WhatsApp APK share.
              </p>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-xs text-emerald-400 font-medium">
                🔒 End-to-End Encrypted · Real-Time Messaging & Calls
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAccountMode('register');
                    setStepIdx(2);
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <span>Create New Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountMode('login');
                    setStepIdx(2);
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2"
                >
                  <span>Sign In to Existing Account</span>
                </button>
              </div>
            </div>
          )}

          {stepIdx === 1 && (
            <div className="space-y-3.5">
              <h2 className="text-xl font-bold tracking-tight">Transparent Privacy Boundaries</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Simple protects your message contents, voice notes, media, and calls using end-to-end encryption.
              </p>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2 text-xs text-slate-400 leading-relaxed">
                <p className="text-emerald-400 font-medium">What Simple guarantees:</p>
                <p>• Server never stores plaintext messages, call audio, or backup keys.</p>
                <p>• No advertising SDKs or behavioral analytics.</p>
                <p className="text-amber-300 font-medium pt-1">What no app can guarantee:</p>
                <p>
                  • Your device operating system, network provider, recipient screenshots, or system notifications may still retain external metadata outside the app’s control.
                </p>
              </div>
            </div>
          )}

          {stepIdx === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {accountMode === 'login' ? 'Sign In to Your Account' : 'Create Your Account'}
                </h2>
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAccountMode('register')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      accountMode === 'register'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    New Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('login')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      accountMode === 'login'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your real <strong>Mobile Phone Number</strong> or <strong>Gmail Address</strong>. Your account credentials are saved in the database so your contacts on Simple can find and message you immediately.
              </p>

              {/* Account Creation Method Selector */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'phone_otp',
                      title: '📱 Phone + OTP',
                      sub: 'Mobile number',
                    },
                    {
                      id: 'gmail_otp',
                      title: '✉️ Gmail + OTP',
                      sub: '@gmail.com',
                    },
                    {
                      id: 'both',
                      title: '🔐 Phone & Gmail',
                      sub: 'Verify both',
                    },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setAuthMethod(mode.id);
                      setOtpErrorMsg(null);
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      authMethod === mode.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-white ring-1 ring-emerald-400/40'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{mode.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{mode.sub}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {(authMethod === 'phone_otp' || authMethod === 'both') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Mobile Phone Number (with Country Code)
                    </label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setIsPhoneOtpVerified(false);
                        setDispatchedPhoneOtp(null);
                        setOtpErrorMsg(null);
                      }}
                      placeholder="+91 98765 43210"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono text-cyan-300 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                {(authMethod === 'gmail_otp' || authMethod === 'both') && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-300">
                        Gmail Address (@gmail.com)
                      </label>
                      {emailInput && !emailInput.includes('@') && (
                        <button
                          type="button"
                          onClick={() => setEmailInput(`${emailInput.trim()}@gmail.com`)}
                          className="text-[10px] font-mono text-emerald-400 hover:underline"
                        >
                          Append @gmail.com
                        </button>
                      )}
                    </div>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setIsEmailOtpVerified(false);
                        setDispatchedEmailOtp(null);
                        setOtpErrorMsg(null);
                      }}
                      placeholder="yourname@gmail.com"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Account Password (Saved Encrypted to Database)
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={
                      accountMode === 'login'
                        ? 'Enter your account password (or verify via OTP)'
                        : 'Create a password for your account'
                    }
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              {existingAccountFound && (
                <div className="p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 text-xs space-y-1">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Existing Account Detected: @{existingAccountFound.username}</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    An existing account with previous chats and verified identity is registered for this mobile/Gmail. Complete OTP verification in the next step to recover your exact account and restore your conversation history.
                  </p>
                </div>
              )}
              {otpErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                  {otpErrorMsg}
                </div>
              )}
            </div>
          )}

          {stepIdx === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold tracking-tight">Verify Account Ownership (OTP)</h2>
                <button
                  type="button"
                  onClick={handleDispatchOnboardingOtps}
                  disabled={isBusyOtp}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-400"
                >
                  Resend OTP
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Enter the 6-digit verification code(s) generated by the server to verify your{' '}
                {authMethod === 'phone_otp'
                  ? 'mobile phone number'
                  : authMethod === 'gmail_otp'
                  ? 'Gmail address'
                  : 'mobile phone number and Gmail address'}
                .
              </p>

              {existingAccountFound && (
                <div className="p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 space-y-2 text-xs">
                  <div className="font-bold text-cyan-300 flex items-center justify-between">
                    <span>Account Recovery: @{existingAccountFound.username}</span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px] text-cyan-300">
                      Backup Ready
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoRestoreOnVerify}
                      onChange={(e) => setAutoRestoreOnVerify(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4"
                    />
                    <span className="text-[11px]">
                      Automatically restore all previous chats and account settings upon verifying OTP
                    </span>
                  </label>
                </div>
              )}

              {/* Android SMS Retriever / Push OTP Auto-Fill Banner */}
              {(dispatchedPhoneOtp || dispatchedEmailOtp) && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-emerald-300 font-semibold">
                    <span>📲 Android Push OTP Auto-Fill Notification</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (dispatchedPhoneOtp && authMethod !== 'gmail_otp')
                          setPhoneOtpInput(dispatchedPhoneOtp);
                        if (dispatchedEmailOtp && authMethod !== 'phone_otp')
                          setEmailOtpInput(dispatchedEmailOtp);
                        setOtpErrorMsg(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px]"
                    >
                      Auto-Fill OTP
                    </button>
                  </div>
                  {dispatchedPhoneOtp && authMethod !== 'gmail_otp' && (
                    <div className="font-mono text-slate-200 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                      [SMS to <span className="text-cyan-300">{phoneInput}</span>]: Your Simple verification code is{' '}
                      <strong className="text-emerald-400 text-sm tracking-widest">
                        {dispatchedPhoneOtp}
                      </strong>
                    </div>
                  )}
                  {dispatchedEmailOtp && authMethod !== 'phone_otp' && (
                    <div className="font-mono text-slate-200 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                      [Gmail to <span className="text-cyan-300">{emailInput}</span>]: Your Simple verification code is{' '}
                      <strong className="text-emerald-400 text-sm tracking-widest">
                        {dispatchedEmailOtp}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {(authMethod === 'phone_otp' || authMethod === 'both') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    6-Digit Mobile SMS OTP ({phoneInput})
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={phoneOtpInput}
                    onChange={(e) => {
                      setPhoneOtpInput(e.target.value.replace(/[^0-9]/g, ''));
                      setOtpErrorMsg(null);
                    }}
                    placeholder="••••••"
                    className="w-full text-center font-mono text-2xl tracking-[0.4em] rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-emerald-400 focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              )}

              {(authMethod === 'gmail_otp' || authMethod === 'both') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    6-Digit Gmail OTP ({emailInput})
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={emailOtpInput}
                    onChange={(e) => {
                      setEmailOtpInput(e.target.value.replace(/[^0-9]/g, ''));
                      setOtpErrorMsg(null);
                    }}
                    placeholder="••••••"
                    className="w-full text-center font-mono text-2xl tracking-[0.4em] rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-cyan-300 focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              )}

              {otpStatusMsg && !otpErrorMsg && (
                <p className="text-xs text-emerald-400">{otpStatusMsg}</p>
              )}

              {otpErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                  {otpErrorMsg}
                </div>
              )}
            </div>
          )}

          {stepIdx === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Profile Info & Photo</h2>
                  <p className="text-xs text-slate-400">
                    Please provide your name, about bio, and an optional profile photo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStepIdx(6)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 whitespace-nowrap"
                >
                  Pro Photo Studio →
                </button>
              </div>

              {/* Quick Profile Photo Row in Step 5 */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <label className="cursor-pointer">
                    <UserAvatar
                      name={nameInput || 'User'}
                      avatarUrl={avatarUrlInput}
                      avatarColor={avatarColor}
                      sizeClass="w-16 h-16"
                      textClass="text-lg"
                      showCameraBadge
                      title="Tap to upload a profile photo"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          setAvatarUrlInput(String(reader.result || ''));
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white">Profile Photo</div>
                    <div className="text-[11px] text-slate-400">
                      Tap the camera icon to upload a photo, or pick a quick avatar:
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {PRESET_PROFILE_PHOTOS.slice(0, 5).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setAvatarUrlInput(preset.url)}
                          className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-transform ${
                            avatarUrlInput === preset.url
                              ? 'border-emerald-400 scale-110'
                              : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                          title={`Use ${preset.label}`}
                        >
                          <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {avatarUrlInput && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrlInput(undefined)}
                          className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 text-[10px] font-semibold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name / Display Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      setOtpErrorMsg(null);
                    }}
                    placeholder="Enter your real name"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">About / Bio</label>
                  <input
                    type="text"
                    value={aboutInput}
                    onChange={(e) => setAboutInput(e.target.value)}
                    placeholder="Hey there! I am using Simple."
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {otpErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
                  {otpErrorMsg}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => finalizeAccountSetup()}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Account to Database & Open Chats</span>
                </button>
              </div>
            </div>
          )}

          {stepIdx === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight">Username & Number Discovery</h2>
              <p className="text-xs text-slate-400">
                Your `@username` is created from your phone number and email so anyone on Simple can find you by `@username`, mobile number, or email.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Username (@handle)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setUsernameInput(generateDefaultUsername(nameInput, phoneInput, emailInput))
                    }
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    From Phone/Email
                  </button>
                </div>
              </div>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Hide my phone number display from strangers</span>
                <input
                  type="checkbox"
                  checked={hidePhone}
                  onChange={(e) => setHidePhone(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Allow lookup by @username, phone, or email</span>
                <input
                  type="checkbox"
                  checked={allowDiscovery}
                  onChange={(e) => setAllowDiscovery(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => finalizeAccountSetup()}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Complete Account & Start Chatting</span>
                </button>
              </div>
            </div>
          )}

          {stepIdx === 6 && (
            <div className="space-y-3.5">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Profile Photo & Privacy</h2>
                <p className="text-xs text-slate-400">
                  Set your profile photo using your device gallery, camera, curated portraits, or emoji studio, and choose who can see your profile photo.
                </p>
              </div>
              <InlineProfilePhotoEditor
                name={nameInput || 'Alex Rivera'}
                avatarUrl={avatarUrlInput}
                avatarColor={avatarColor}
                profilePhotoVisibility={photoVisibilityInput}
                onChangeAvatarUrl={(url) => setAvatarUrlInput(url)}
                onChangeAvatarColor={(col) => setAvatarColor(col)}
                onChangeVisibility={(vis) => setPhotoVisibilityInput(vis)}
                compact
              />
            </div>
          )}

          {stepIdx === 7 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Users className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Optional Contacts Permission</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Simple matches saved mobile phone numbers against registered Simple users so you can immediately message anyone who has the app. You can also continue without granting contacts permission and add people manually.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setContactsPerm(false)}
                  className={`flex-1 min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                    !contactsPerm
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Continue Without Contacts
                </button>
                <button
                  type="button"
                  onClick={() => setContactsPerm(true)}
                  className={`flex-1 min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                    contactsPerm
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Allow Mobile Contact Matching
                </button>
              </div>
            </div>
          )}

          {stepIdx === 8 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Bell className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Notification Permission & Privacy</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Receive real-time message and call alerts. Enable <strong>Private Notifications</strong> to show only generic <em>"New private message"</em> banners without exposing sender names or content to your lock screen.
              </p>
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Enable Notifications</span>
                <input
                  type="checkbox"
                  checked={notifPerm}
                  onChange={(e) => setNotifPerm(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Private Notifications Mode ("New private message")</span>
                <input
                  type="checkbox"
                  checked={privateNotif}
                  onChange={(e) => setPrivateNotif(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          )}

          {stepIdx === 9 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Mic className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Microphone Permission</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Used only when you record a voice note or make a voice or video call. Simple never listens in the background.
              </p>
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Allow Microphone for Calls & Voice Notes</span>
                <input
                  type="checkbox"
                  checked={micPerm}
                  onChange={(e) => setMicPerm(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          )}

          {stepIdx === 10 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Camera className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Camera Permission</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Used only during video calls, capturing in-chat photos, or scanning Safety Number QR codes.
              </p>
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Allow Camera Access When Active</span>
                <input
                  type="checkbox"
                  checked={camPerm}
                  onChange={(e) => setCamPerm(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          )}

          {stepIdx === 11 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Fingerprint className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Optional Biometric Lock</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Use Fingerprint or Face Unlock on your phone to quickly open Locked Chats and keep your app secure.
              </p>
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Enable Biometric Authentication</span>
                <input
                  type="checkbox"
                  checked={bioEnabled}
                  onChange={(e) => setBioEnabled(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          )}

          {stepIdx === 12 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <Lock className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">PIN / Passcode Setup</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Set a 4-digit PIN to protect your Locked Chats vault and optional full App Lock.
              </p>
              <input
                type="password"
                maxLength={8}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="4-digit PIN (e.g. 2580)"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-emerald-500"
              />
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs text-slate-200">Require PIN immediately when opening Simple</span>
                <input
                  type="checkbox"
                  checked={enableAppPin}
                  onChange={(e) => setEnableAppPin(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>
          )}

          {stepIdx === 13 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <HardDrive className="w-5 h-5" />
                <h2 className="text-xl font-bold tracking-tight text-white">Chat Backup Options</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Choose how you want to back up your chats. For <strong>Cloud Backup (Google Drive or Gmail)</strong>, a verified <strong>@gmail.com</strong> account is required.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'none', label: 'Off' },
                    { id: 'local_encrypted', label: 'Save to Device' },
                    { id: 'cloud_e2ee', label: 'Drive / Gmail Cloud' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setBackupChoice(opt.id);
                      setBackupGmailError(null);
                    }}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      backupChoice === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {backupChoice === 'cloud_e2ee' && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">
                      ☁️ Cloud Backup Destination (Drive or Gmail)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCloudBackupProvider('google_drive')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                          cloudBackupProvider === 'google_drive'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        Google Drive
                      </button>
                      <button
                        type="button"
                        onClick={() => setCloudBackupProvider('gmail')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                          cloudBackupProvider === 'gmail'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        Gmail Archive
                      </button>
                    </div>
                  </div>

                  {authMethod !== 'phone_otp' && isValidGmailAddress(emailInput) ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                      <span>
                        ✓ Linked Cloud Backup Gmail: <strong>{emailInput.trim().toLowerCase()}</strong>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20">
                        OTP Verified
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5 pt-1 border-t border-slate-800">
                      <p className="text-[11px] text-amber-200 leading-relaxed">
                        You created your account using a phone number. To enable Cloud Backup to{' '}
                        <strong>{cloudBackupProvider === 'google_drive' ? 'Google Drive' : 'Gmail'}</strong>, please provide and verify your <strong>@gmail.com</strong> address:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={backupGmailInput}
                          onChange={(e) => {
                            setBackupGmailInput(e.target.value);
                            setIsBackupGmailVerified(false);
                            setDispatchedBackupGmailOtp(null);
                            setBackupGmailError(null);
                          }}
                          placeholder="yourname@gmail.com"
                          className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleRequestBackupGmailOtp}
                          disabled={isBusyOtp}
                          className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold whitespace-nowrap"
                        >
                          Send Gmail OTP
                        </button>
                      </div>

                      {dispatchedBackupGmailOtp && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span>
                              ✉️ Gmail OTP:{' '}
                              <strong className="text-emerald-300 tracking-widest">
                                {dispatchedBackupGmailOtp}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setBackupGmailOtpInput(dispatchedBackupGmailOtp);
                                setBackupGmailError(null);
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-sans font-bold text-[10px]"
                            >
                              Auto-Fill
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              value={backupGmailOtpInput}
                              onChange={(e) =>
                                setBackupGmailOtpInput(e.target.value.replace(/[^0-9]/g, ''))
                              }
                              placeholder="6-digit Gmail OTP"
                              className="flex-1 text-center font-mono tracking-[0.3em] rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-cyan-300"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyBackupGmailOtp}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold"
                            >
                              {isBackupGmailVerified ? 'Verified ✓' : 'Verify Gmail'}
                            </button>
                          </div>
                        </div>
                      )}

                      {isBackupGmailVerified && (
                        <div className="text-[11px] text-emerald-400 font-semibold">
                          ✓ Gmail verified for {cloudBackupProvider === 'google_drive' ? 'Google Drive' : 'Gmail'} Cloud Backup!
                        </div>
                      )}

                      {backupGmailError && (
                        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-[11px] text-rose-300">
                          {backupGmailError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-3.5 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={prevStep}
            disabled={stepIdx === 0}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <button
            type="button"
            onClick={nextStep}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {stepIdx === STEPS.length - 1 ? (
              <>
                <Check className="w-4 h-4" />
                Finish Setup
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
