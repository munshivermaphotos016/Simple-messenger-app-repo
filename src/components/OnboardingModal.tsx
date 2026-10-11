import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  KeyRound,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { AppSettings, ChatConversation, UserAccount } from '../types/simple';
import { PRESET_PROFILE_PHOTOS, UserAvatar } from './ProfilePhotoModal';
import {
  deriveUidFromEmail,
  deriveUidFromPhone,
  normalizePhone,
} from '../data/initialState';
import { getRemoteServerOrigin } from '../utils/androidBridge';
import {
  auth,
  googleProvider,
  recoverCloudAccountBackup,
  signInWithPopup,
} from '../firebase';

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

const AVATAR_COLORS = ['#10B981', '#06B6D4', '#6366F1', '#F59E0B', '#EC4899', '#8B5CF6'];

const COUNTRY_CODES = [
  { code: '+1', label: '🇺🇸/🇨🇦 +1 (US/CA)', digits: 10 },
  { code: '+44', label: '🇬🇧 +44 (UK)', digits: 10 },
  { code: '+91', label: '🇮🇳 +91 (India)', digits: 10 },
  { code: '+41', label: '🇨🇭 +41 (Switzerland)', digits: 9 },
  { code: '+49', label: '🇩🇪 +49 (Germany)', digits: 10 },
  { code: '+33', label: '🇫🇷 +33 (France)', digits: 9 },
  { code: '+61', label: '🇦🇺 +61 (Australia)', digits: 9 },
  { code: '+81', label: '🇯🇵 +81 (Japan)', digits: 10 },
  { code: '+65', label: '🇸🇬 +65 (Singapore)', digits: 8 },
  { code: '+971', label: '🇦🇪 +971 (UAE)', digits: 9 },
  { code: '+55', label: '🇧🇷 +55 (Brazil)', digits: 11 },
  { code: '+234', label: '🇳🇬 +234 (Nigeria)', digits: 10 },
];

async function sha256Hex(input: string): Promise<string> {
  const clean = input.trim();
  if (!clean) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  account,
  settings,
  localFingerprint,
  onComplete,
  onCancel,
}) => {
  const isInitialSetup =
    !account.id || !account.onboardingCompleted || (!account.phone && !account.email);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [onboardingMode, setOnboardingMode] = useState<'register' | 'login'>('register');
  const [verifyChannel, setVerifyChannel] = useState<
    'totp' | 'google_oauth' | 'email_otp' | 'phone_otp'
  >('totp');

  // Step 1: Identity & Credentials
  const [name, setName] = useState(account.name || '');
  const [username, setUsername] = useState(account.username || '');
  const [countryCode, setCountryCode] = useState('+91');
  const [localPhoneNumber, setLocalPhoneNumber] = useState(() => {
    const raw = (account.phone || '').trim();
    if (!raw) return '';
    for (const c of COUNTRY_CODES) {
      if (raw.startsWith(c.code)) {
        return raw.slice(c.code.length).trim();
      }
    }
    return raw.replace(/^\+\d+\s*/, '');
  });
  const [email, setEmail] = useState(account.email || '');
  const [accountPassword, setAccountPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoStepPin, setTwoStepPin] = useState('');
  const [about, setAbout] = useState(
    account.about || 'Hey there! I am using Simple Messenger.'
  );
  const [avatarColor, setAvatarColor] = useState(account.avatarColor || '#10B981');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    account.avatarUrl || PRESET_PROFILE_PHOTOS[0].url
  );

  // Verification State (Zero dummy OTPs!)
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string>(
    account.verificationToken || ''
  );
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [verifiedIdentifier, setVerifiedIdentifier] = useState<string>('');

  // TOTP Authenticator State (RFC 6238)
  const [totpSecret, setTotpSecret] = useState<string>(account.totpSecret || '');
  const [totpUri, setTotpUri] = useState<string>('');
  const [isGeneratingTotp, setIsGeneratingTotp] = useState(false);
  const [copiedTotpSecret, setCopiedTotpSecret] = useState(false);

  // Live SMTP / SMS Gateway Configuration State
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{
    smtpConfigured: boolean;
    smtpUserMasked: string | null;
    smsGatewayConfigured: boolean;
  }>({
    smtpConfigured: false,
    smtpUserMasked: null,
    smsGatewayConfigured: false,
  });
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smsWebhookUrl, setSmsWebhookUrl] = useState('');
  const [smsWebhookApiKey, setSmsWebhookApiKey] = useState('');
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayFeedback, setGatewayFeedback] = useState<string | null>(null);

  // Cloud Backup & Recovery State
  const [restoredChats, setRestoredChats] = useState<ChatConversation[] | undefined>(
    undefined
  );
  const [recoveredAccountData, setRecoveredAccountData] = useState<Partial<UserAccount> | null>(
    null
  );
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Step 3: Privacy & Permissions
  const [allowUsernameDiscovery, setAllowUsernameDiscovery] = useState(
    account.allowUsernameDiscovery ?? true
  );
  const [hidePhoneNumber, setHidePhoneNumber] = useState(
    account.hidePhoneNumber ?? false
  );
  const [appLockEnabled, setAppLockEnabled] = useState(settings.appLockEnabled);
  const [contactsPermission, setContactsPermission] = useState(
    settings.contactsPermissionGranted ?? true
  );
  const [notificationsPermission, setNotificationsPermission] = useState(
    settings.notificationsPermissionGranted ?? true
  );
  const [backupMode, setBackupMode] = useState<AppSettings['backupMode']>(
    settings.backupMode || 'cloud_e2ee'
  );

  const selectedCountry =
    COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];
  const localDigitsOnly = localPhoneNumber.replace(/\D/g, '');
  const fullPhoneDisplay = localDigitsOnly
    ? `${countryCode} ${localPhoneNumber.trim()}`
    : '';
  const normalizedPhoneDigits = normalizePhone(fullPhoneDisplay);
  const isPhoneValid =
    localDigitsOnly.length >= Math.max(7, selectedCountry.digits - 2) &&
    localDigitsOnly.length <= 14;
  const cleanEmail = email.trim().toLowerCase();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  const isVerifiedForProceeding = Boolean(
    verificationToken && (phoneVerified || emailVerified)
  );

  // Check Gateway Status on Mount
  useEffect(() => {
    const apiBase = getRemoteServerOrigin();
    fetch(`${apiBase}/api/auth/gateway-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ok) {
          setGatewayStatus({
            smtpConfigured: Boolean(data.smtpConfigured),
            smtpUserMasked: data.smtpUserMasked || null,
            smsGatewayConfigured: Boolean(data.smsGatewayConfigured),
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveGatewayConfig = async () => {
    setErrorBanner(null);
    setGatewayFeedback(null);
    setIsSavingGateway(true);
    try {
      const apiBase = getRemoteServerOrigin();
      const res = await fetch(`${apiBase}/api/auth/configure-gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 465,
          smtpUser: smtpUser.trim(),
          smtpPass: smtpPass.trim(),
          smsWebhookUrl: smsWebhookUrl.trim(),
          smsWebhookApiKey: smsWebhookApiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Failed to verify SMTP / SMS gateway credentials.');
      } else {
        setGatewayStatus({
          smtpConfigured: Boolean(data.smtpConfigured),
          smtpUserMasked: smtpUser.trim() || null,
          smsGatewayConfigured: Boolean(data.smsGatewayConfigured),
        });
        setGatewayFeedback(
          'Live SMTP / SMS Gateway verified and active! You can now send real OTP codes.'
        );
        setShowGatewayConfig(false);
      }
    } catch {
      setErrorBanner('Could not reach backend server to configure gateway.');
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Validate Step 1 before advancing to Step 2 Verification
  const handleProceedToVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (!isPhoneValid && !isEmailValid) {
      setErrorBanner(
        'Please enter a valid mobile phone number or email address to continue.'
      );
      return;
    }

    if (onboardingMode === 'register') {
      if (!name.trim() || name.trim().length < 2) {
        setErrorBanner('Please enter your full display name (at least 2 characters).');
        return;
      }
      if (!accountPassword || accountPassword.length < 6) {
        setErrorBanner(
          'Please create a strong account password (at least 6 characters) to protect your account.'
        );
        return;
      }
      if (accountPassword !== confirmPassword) {
        setErrorBanner('Password and Confirm Password do not match.');
        return;
      }
      if (!/^\d{6}$/.test(twoStepPin)) {
        setErrorBanner(
          'Please set a 6-digit Two-Step Verification PIN (just like WhatsApp Two-Step Verification).'
        );
        return;
      }
    } else {
      // Login mode requires password or 2-step PIN
      if (!accountPassword && !/^\d{6}$/.test(twoStepPin)) {
        setErrorBanner(
          'Please enter your Account Password or 6-digit Two-Step Verification PIN to sign in.'
        );
        return;
      }
    }

    // Check account existence on server to prevent duplicate registration or invalid login
    setIsSendingOtp(true);
    try {
      const apiBase = getRemoteServerOrigin();
      const checkRes = await fetch(`${apiBase}/api/account/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          username: username.trim().replace(/^@/, ''),
        }),
      });
      const checkData = await checkRes.json();

      if (onboardingMode === 'register' && checkData.exists) {
        setErrorBanner(
          `This ${checkData.matchedBy || 'account'} is already registered on Simple${
            checkData.accountSummary?.username
              ? ` (@${checkData.accountSummary.username})`
              : ''
          }. Please switch to "Sign In to Existing Account" and verify with your password + OTP.`
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && !checkData.exists) {
        setErrorBanner(
          'No registered Simple account was found with this mobile number or email. Please check your details or switch to "Create New Account".'
        );
        setIsSendingOtp(false);
        return;
      }

      // If registering and TOTP is selected, initialize cryptographic RFC 6238 TOTP secret
      if (onboardingMode === 'register' && !totpSecret) {
        const totpRes = await fetch(`${apiBase}/api/auth/setup-totp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountLabel: cleanEmail || fullPhoneDisplay || username || 'SimpleUser',
          }),
        });
        const totpData = await totpRes.json();
        if (totpData && totpData.ok) {
          setTotpSecret(totpData.secret);
          setTotpUri(totpData.otpauthUri);
        }
      }

      setStep(2);
    } catch {
      setErrorBanner(
        'Unable to verify account status with the Simple server. Please check your internet connection.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Generate or refresh TOTP Secret for Authenticator App
  const handleGenerateTotpSecret = async () => {
    setErrorBanner(null);
    setIsGeneratingTotp(true);
    try {
      const apiBase = getRemoteServerOrigin();
      const res = await fetch(`${apiBase}/api/auth/setup-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountLabel: cleanEmail || fullPhoneDisplay || username || 'SimpleUser',
        }),
      });
      const data = await res.json();
      if (data && data.ok) {
        setTotpSecret(data.secret);
        setTotpUri(data.otpauthUri);
      } else {
        setErrorBanner('Failed to generate Authenticator TOTP key.');
      }
    } catch {
      setErrorBanner('Network error while generating Authenticator key.');
    } finally {
      setIsGeneratingTotp(false);
    }
  };

  // Real Google OAuth Sign-In Verification (Zero dummy OTPs)
  const handleGoogleOAuthVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);
    setIsVerifyingOtp(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const apiBase = getRemoteServerOrigin();

      const res = await fetch(`${apiBase}/api/auth/verify-google-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Google Account verification failed.');
        setIsVerifyingOtp(false);
        return;
      }

      const verifiedGmail = String(data.email || result.user.email || '')
        .trim()
        .toLowerCase();

      // If logging in, verify account ownership and recover cloud backup
      if (onboardingMode === 'login') {
        const pwdHash = accountPassword ? await sha256Hex(accountPassword) : undefined;
        const pinHash = twoStepPin ? await sha256Hex(twoStepPin) : undefined;

        const recovered = await recoverCloudAccountBackup({
          email: verifiedGmail,
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          passwordHash: pwdHash,
          twoStepPinHash: pinHash,
          verificationToken: data.verificationToken,
        });

        if (!recovered) {
          setErrorBanner(
            'Google identity verified, but your Account Password / Two-Step PIN did not match the existing account, or no account exists for this Gmail.'
          );
          setIsVerifyingOtp(false);
          return;
        }

        if (recovered.account) {
          setRecoveredAccountData(recovered.account);
          if (recovered.account.name) setName(recovered.account.name);
          if (recovered.account.username) setUsername(recovered.account.username);
          if (recovered.account.about) setAbout(recovered.account.about);
          if (recovered.account.avatarColor) setAvatarColor(recovered.account.avatarColor);
          if (recovered.account.avatarUrl) setAvatarUrl(recovered.account.avatarUrl);
        }
        if (recovered.chats && Array.isArray(recovered.chats)) {
          setRestoredChats(recovered.chats);
        }
        setRecoveryNotice(
          `Verified ${verifiedGmail} via Google OAuth & restored your encrypted account!`
        );
      } else {
        if (!name.trim() && data.name) {
          setName(data.name);
        }
      }

      setEmail(verifiedGmail);
      setEmailVerified(true);
      setVerificationToken(data.verificationToken);
      setVerifiedIdentifier(verifiedGmail);
      setOtpSentMessage(
        `Cryptographically verified ${verifiedGmail} via official Google OAuth 2.0.`
      );
    } catch (err: any) {
      setErrorBanner(
        err?.message ||
          'Google Sign-In popup could not complete. On Android APK or restricted views, use Authenticator App (TOTP) or Live SMTP Email OTP.'
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Request Real Out-of-Band Email or SMS OTP from Server (Never returns code to UI!)
  const handleRequestRealOtp = async (channel: 'email' | 'phone') => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    const identifier = channel === 'email' ? cleanEmail : fullPhoneDisplay;
    if (channel === 'email' && !isEmailValid) {
      setErrorBanner('Please enter a valid email address first.');
      return;
    }
    if (channel === 'phone' && !isPhoneValid) {
      setErrorBanner('Please enter a valid mobile phone number first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const apiBase = getRemoteServerOrigin();
      const pwdHash = accountPassword ? await sha256Hex(accountPassword) : undefined;
      const pinHash = twoStepPin ? await sha256Hex(twoStepPin) : undefined;

      const res = await fetch(`${apiBase}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          identifier,
          mode: onboardingMode,
          passwordHash: pwdHash,
          twoStepPinHash: pinHash,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.requiresGatewaySetup) {
          setShowGatewayConfig(true);
        }
        setErrorBanner(
          data.error ||
            `Could not dispatch real ${channel.toUpperCase()} OTP. Configure your live SMTP/SMS gateway or use Authenticator App (TOTP) / Google Sign-In.`
        );
        return;
      }

      setOtpSentMessage(
        data.message ||
          `A real 6-digit verification code has been dispatched to ${
            data.maskedTarget || identifier
          }. Check your external inbox/messages.`
      );
    } catch {
      setErrorBanner('Network error while requesting real OTP from server.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify 6-digit code (TOTP Authenticator, Real Email OTP, Real SMS OTP, or Two-Step PIN on login)
  const handleVerifyCode = async () => {
    setErrorBanner(null);
    const cleanCode = otpInput.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setErrorBanner('Please enter the 6-digit verification code.');
      return;
    }

    const identifier =
      verifyChannel === 'email_otp'
        ? cleanEmail
        : verifyChannel === 'phone_otp'
        ? fullPhoneDisplay
        : fullPhoneDisplay || cleanEmail;

    if (!identifier) {
      setErrorBanner('Please provide a valid phone number or email address in Step 1.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const apiBase = getRemoteServerOrigin();
      const res = await fetch(`${apiBase}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: verifyChannel === 'totp' ? 'totp' : verifyChannel === 'email_otp' ? 'email' : 'phone',
          identifier,
          code: cleanCode,
          mode: onboardingMode,
          totpSecret: onboardingMode === 'register' ? totpSecret : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok || !data.verificationToken) {
        setErrorBanner(
          data.error ||
            'Invalid or expired 6-digit verification code. Please check your Authenticator app or inbox and try again.'
        );
        setIsVerifyingOtp(false);
        return;
      }

      // If logging into an existing account, verify password/PIN and recover account backup
      if (onboardingMode === 'login') {
        const pwdHash = accountPassword ? await sha256Hex(accountPassword) : undefined;
        const pinHash = twoStepPin ? await sha256Hex(twoStepPin) : undefined;

        const recovered = await recoverCloudAccountBackup({
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          twoStepPinHash: pinHash,
          verificationToken: data.verificationToken,
        });

        if (!recovered) {
          setErrorBanner(
            'Verification code matched, but Account Password / Two-Step PIN did not match the registered account.'
          );
          setIsVerifyingOtp(false);
          return;
        }

        if (recovered.account) {
          setRecoveredAccountData(recovered.account);
          if (recovered.account.name) setName(recovered.account.name);
          if (recovered.account.username) setUsername(recovered.account.username);
          if (recovered.account.about) setAbout(recovered.account.about);
          if (recovered.account.avatarColor) setAvatarColor(recovered.account.avatarColor);
          if (recovered.account.avatarUrl) setAvatarUrl(recovered.account.avatarUrl);
          if (recovered.account.phone) {
            setPhoneVerified(true);
          }
          if (recovered.account.email) {
            setEmail(recovered.account.email);
            setEmailVerified(true);
          }
        }
        if (recovered.chats && Array.isArray(recovered.chats)) {
          setRestoredChats(recovered.chats);
        }
        setRecoveryNotice(
          `Welcome back! Verified your identity and restored your encrypted account.`
        );
      }

      setVerificationToken(data.verificationToken);
      setVerifiedIdentifier(identifier);
      if (isPhoneValid) setPhoneVerified(true);
      if (isEmailValid) setEmailVerified(true);
      setOtpInput('');
      setOtpSentMessage(
        `Verified via ${
          data.verifiedMethod === 'totp_authenticator'
            ? 'RFC 6238 Authenticator App (TOTP)'
            : data.verifiedMethod === 'two_step_pin'
            ? 'Two-Step Verification PIN'
            : 'Real Out-of-Band OTP'
        }!`
      );
    } catch {
      setErrorBanner('Verification request failed. Please check your connection.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Finalize Account Creation or Sign-In
  const handleFinish = async () => {
    if (!isVerifiedForProceeding || !verificationToken) {
      setErrorBanner('You must complete real account verification before continuing.');
      return;
    }

    const cleanName = (recoveredAccountData?.name || name).trim() || 'Simple User';
    const cleanHandle =
      (recoveredAccountData?.username || username)
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9._]/g, '') ||
      cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      `user.${ normalizedPhoneDigits.slice(-4) || '1001' }`;

    const deterministicUid =
      recoveredAccountData?.id ||
      (isPhoneValid && normalizedPhoneDigits.length >= 7
        ? deriveUidFromPhone(normalizedPhoneDigits)
        : deriveUidFromEmail(cleanEmail));

    const pwdHash = accountPassword
      ? await sha256Hex(accountPassword)
      : recoveredAccountData?.passwordHash;
    const pinHash = twoStepPin
      ? await sha256Hex(twoStepPin)
      : recoveredAccountData?.twoStepPinHash;

    const finalAccount: UserAccount = {
      id: deterministicUid,
      name: cleanName,
      username: cleanHandle,
      phone: isPhoneValid ? fullPhoneDisplay : recoveredAccountData?.phone || '',
      normalizedPhone: isPhoneValid
        ? normalizedPhoneDigits
        : recoveredAccountData?.normalizedPhone || '',
      email: isEmailValid ? cleanEmail : recoveredAccountData?.email || '',
      authMethod:
        verifyChannel === 'google_oauth'
          ? 'google_oauth'
          : verifyChannel === 'totp'
          ? 'totp'
          : phoneVerified && emailVerified
          ? 'both'
          : phoneVerified
          ? 'phone_otp'
          : 'gmail_otp',
      phoneVerified: phoneVerified || Boolean(recoveredAccountData?.phoneVerified),
      emailVerified: emailVerified || Boolean(recoveredAccountData?.emailVerified),
      passwordHash: pwdHash,
      twoStepPinHash: pinHash,
      totpSecret: totpSecret || recoveredAccountData?.totpSecret,
      verificationToken,
      about: about.trim() || 'Available on Simple E2EE',
      avatarColor,
      avatarUrl,
      allowUsernameDiscovery,
      hidePhoneNumber,
      onboardingCompleted: true,
      cloudBackupGmail: isEmailValid ? cleanEmail : recoveredAccountData?.email,
    };

    onComplete(
      finalAccount,
      {
        appLockEnabled,
        contactsPermissionGranted: contactsPermission,
        notificationsPermissionGranted: notificationsPermission,
        backupMode,
        cloudBackupGmail: isEmailValid ? cleanEmail : undefined,
        cloudBackupGmailVerified: emailVerified,
      },
      restoredChats
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070A0E] p-2.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[95dvh] flex flex-col">
        {/* Top Progress Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-white truncate">
                {onboardingMode === 'register'
                  ? 'Create Verified Simple Account'
                  : 'Sign In to Existing Account'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Real cryptographic verification · Zero dummy OTPs · E2EE Database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  step === s
                    ? 'w-7 bg-emerald-400'
                    : step > s
                    ? 'w-4 bg-emerald-600'
                    : 'w-4 bg-slate-800'
                }`}
              />
            ))}
            {!isInitialSetup && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="ml-1 w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorBanner && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-rose-300 hover:text-white shrink-0 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {recoveryNotice && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{recoveryNotice}</span>
            </div>
          )}

          {/* STEP 1: ACCOUNT MODE, PHONE / EMAIL & PASSWORD / 2-STEP PIN */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Toggle: Create New Account vs Sign In to Existing Account */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('register');
                    setErrorBanner(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'register'
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create New Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('login');
                    setErrorBanner(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'login'
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Sign In (Existing)</span>
                </button>
              </div>

              {/* Avatar & Name Section (For New Account Registration) */}
              {onboardingMode === 'register' && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="flex items-center gap-3.5">
                    <UserAvatar
                      name={name || 'Simple User'}
                      avatarColor={avatarColor}
                      avatarUrl={avatarUrl}
                      sizeClass="w-14 h-14"
                      textSizeClass="text-lg"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Full Display Name *
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setName(val);
                            if (!username) {
                              setUsername(
                                val
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]/g, '')
                                  .slice(0, 18)
                              );
                            }
                          }}
                          placeholder="e.g., Aryan Sharma"
                          className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Unique @username Handle
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-emerald-400">
                            @
                          </span>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) =>
                              setUsername(
                                e.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9._]/g, '')
                                  .slice(0, 28)
                              )
                            }
                            placeholder="aryan.sharma"
                            className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-7 pr-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Avatar Picker */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                    {PRESET_PROFILE_PHOTOS.slice(0, 8).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setAvatarUrl(preset.url)}
                        className={`p-1 rounded-xl border transition-all shrink-0 ${
                          avatarUrl === preset.url
                            ? 'border-emerald-400 bg-emerald-500/15 scale-105'
                            : 'border-slate-800 bg-slate-900 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                      </button>
                    ))}
                    {AVATAR_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => {
                          setAvatarColor(col);
                          setAvatarUrl(undefined);
                        }}
                        className={`w-7 h-7 rounded-full shrink-0 border-2 ${
                          !avatarUrl && avatarColor === col
                            ? 'border-white scale-110'
                            : 'border-transparent opacity-75'
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile Number & Email Identifiers */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Mobile Phone Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 shrink-0"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={localPhoneNumber}
                      onChange={(e) => setLocalPhoneNumber(e.target.value)}
                      placeholder="98765 43210"
                      className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Email / Gmail Address (for Email OTP, Google Auth & Cloud Backup)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Account Password & WhatsApp-Style 6-Digit Two-Step Verification PIN */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {onboardingMode === 'register'
                        ? 'Set Account Password & 6-Digit 2-Step PIN'
                        : 'Enter Account Password & 6-Digit 2-Step PIN'}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    SHA-256 Protected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Account Password *
                    </label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {onboardingMode === 'register' ? (
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">
                        Confirm Password *
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">
                        6-Digit Two-Step PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={twoStepPin}
                        onChange={(e) =>
                          setTwoStepPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="••••••"
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-mono tracking-widest text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                {onboardingMode === 'register' && (
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      WhatsApp-Style 6-Digit Two-Step Verification PIN *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={twoStepPin}
                      onChange={(e) =>
                        setTwoStepPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Enter 6-digit secret PIN (e.g. 482910)"
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-mono tracking-widest text-white focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Required whenever signing in or recovering your account on a new phone. Nobody can access your account without this PIN and password.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isSendingOtp}
                onClick={handleProceedToVerification}
                className="w-full min-h-[46px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                {isSendingOtp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Checking Account Directory…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {onboardingMode === 'register'
                        ? 'Continue to Real Verification →'
                        : 'Verify Ownership & Sign In →'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: REAL CRYPTOGRAPHIC VERIFICATION (NO DUMMY OTPs!) */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Choose Real Verification Method
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                    Zero Dummy OTPs
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  For your security, Simple never displays or auto-fills OTP codes inside the app. Verify using Google Authenticator / Authy (RFC 6238 TOTP), Official Google Sign-In, or a real external Email/SMS gateway.
                </p>

                {/* 4 Real Verification Channel Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('totp');
                      setErrorBanner(null);
                      if (onboardingMode === 'register' && !totpSecret) {
                        handleGenerateTotpSecret();
                      }
                    }}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'totp'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Authenticator</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('google_oauth');
                      setErrorBanner(null);
                    }}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'google_oauth'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Google Auth</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('email_otp');
                      setErrorBanner(null);
                    }}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'email_otp'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Real Email OTP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('phone_otp');
                      setErrorBanner(null);
                    }}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'phone_otp'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Real SMS OTP</span>
                  </button>
                </div>
              </div>

              {/* CHANNEL 1: RFC 6238 TOTP AUTHENTICATOR APP (OR 2-STEP PIN ON LOGIN) */}
              {verifyChannel === 'totp' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  {onboardingMode === 'register' ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold text-emerald-400">
                            Step A: Link Authenticator App (RFC 6238 TOTP)
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Add this secret key to Google Authenticator, Authy, 1Password, or Microsoft Authenticator, then enter the live 6-digit code generated by your authenticator app.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateTotpSecret}
                          disabled={isGeneratingTotp}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 shrink-0"
                        >
                          New Key
                        </button>
                      </div>

                      {totpSecret && (
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                              Your Secret Setup Key (Base32)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(totpSecret);
                                setCopiedTotpSecret(true);
                                setTimeout(() => setCopiedTotpSecret(false), 2000);
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold flex items-center gap-1"
                            >
                              {copiedTotpSecret ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Key</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-bold text-emerald-300 tracking-wider break-all select-all bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            {totpSecret}
                          </div>
                          {totpUri && (
                            <a
                              href={totpUri}
                              className="w-full min-h-[38px] rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Open in Authenticator App on This Device</span>
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-emerald-400">
                        Enter Authenticator App Code or 6-Digit Two-Step PIN
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Open your linked Authenticator App (Google Authenticator / Authy) and enter the current 6-digit code, or enter your registered 6-digit Two-Step Verification PIN.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-semibold text-slate-200">
                      Enter 6-Digit Code from Authenticator App
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpInput}
                        onChange={(e) =>
                          setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="6-digit code"
                        className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-center font-mono text-base tracking-[0.35em] text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyCode}
                        disabled={isVerifyingOtp || otpInput.length !== 6}
                        className="px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                      >
                        {isVerifyingOtp ? 'Verifying…' : 'Verify Code'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CHANNEL 2: REAL GOOGLE OAUTH 2.0 VERIFICATION */}
              {verifyChannel === 'google_oauth' && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-emerald-400">
                    Official Google Account Verification (OAuth 2.0)
                  </h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Sign in directly with Google to cryptographically prove ownership of your Gmail address without needing to type an OTP code.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleOAuthVerification}
                    disabled={isVerifyingOtp}
                    className="w-full min-h-[44px] rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isVerifyingOtp
                        ? 'Verifying with Google Servers…'
                        : 'Verify with Google Sign-In'}
                    </span>
                  </button>
                </div>
              )}

              {/* CHANNEL 3 & 4: REAL SMTP EMAIL OTP OR REAL SMS GATEWAY OTP */}
              {(verifyChannel === 'email_otp' || verifyChannel === 'phone_otp') && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-emerald-400">
                        {verifyChannel === 'email_otp'
                          ? `Real SMTP Email OTP (${cleanEmail || 'No email set'})`
                          : `Real Carrier SMS OTP (${fullPhoneDisplay || 'No phone set'})`}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dispatches a real 6-digit code to your external{' '}
                        {verifyChannel === 'email_otp' ? 'email inbox' : 'mobile number'}.
                        Code is never shown inside the app.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig((v) => !v)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-emerald-300 font-semibold shrink-0"
                    >
                      {showGatewayConfig ? 'Hide Gateway' : 'Configure SMTP/SMS'}
                    </button>
                  </div>

                  {/* Gateway Status Badge */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`px-2.5 py-1 rounded-lg border font-medium ${
                        (verifyChannel === 'email_otp' && gatewayStatus.smtpConfigured) ||
                        (verifyChannel === 'phone_otp' && gatewayStatus.smsGatewayConfigured)
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {verifyChannel === 'email_otp'
                        ? gatewayStatus.smtpConfigured
                          ? `SMTP Active (${gatewayStatus.smtpUserMasked})`
                          : 'SMTP Relay Not Configured Yet'
                        : gatewayStatus.smsGatewayConfigured
                        ? 'SMS Webhook Active'
                        : 'SMS Gateway Not Configured Yet'}
                    </span>
                  </div>

                  {/* Collapsible Live SMTP / SMS Gateway Configuration */}
                  {showGatewayConfig && (
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
                      <div className="text-xs font-bold text-white">
                        Configure Live Outbound OTP Delivery Gateway
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Enter your SMTP server credentials (e.g., Gmail address + 16-character Google App Password) or SMS Webhook URL so Simple can dispatch real emails/SMS directly to users.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          placeholder="SMTP Host (smtp.gmail.com)"
                          className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          placeholder="SMTP Port (465 or 587)"
                          className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="email"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          placeholder="SMTP Email (you@gmail.com)"
                          className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="password"
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                          placeholder="SMTP App Password"
                          className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="url"
                          value={smsWebhookUrl}
                          onChange={(e) => setSmsWebhookUrl(e.target.value)}
                          placeholder="SMS Gateway Webhook URL (optional)"
                          className="sm:col-span-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveGatewayConfig}
                        disabled={isSavingGateway}
                        className="w-full min-h-[38px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                      >
                        {isSavingGateway
                          ? 'Verifying Gateway Connection…'
                          : 'Save & Verify Live Gateway'}
                      </button>
                    </div>
                  )}

                  {gatewayFeedback && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-200">
                      {gatewayFeedback}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      disabled={isSendingOtp}
                      onClick={() =>
                        handleRequestRealOtp(
                          verifyChannel === 'email_otp' ? 'email' : 'phone'
                        )
                      }
                      className="min-h-[42px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      {isSendingOtp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Dispatching Real OTP…</span>
                        </>
                      ) : (
                        <>
                          {verifyChannel === 'email_otp' ? (
                            <Mail className="w-3.5 h-3.5" />
                          ) : (
                            <Phone className="w-3.5 h-3.5" />
                          )}
                          <span>
                            Send Real OTP to{' '}
                            {verifyChannel === 'email_otp' ? 'Email' : 'Mobile'}
                          </span>
                        </>
                      )}
                    </button>

                    <div className="flex flex-1 gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpInput}
                        onChange={(e) =>
                          setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="Enter 6-digit OTP"
                        className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-center font-mono text-sm tracking-[0.25em] text-white"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyCode}
                        disabled={isVerifyingOtp || otpInput.length !== 6}
                        className="px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                      >
                        {isVerifyingOtp ? 'Checking…' : 'Verify'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {otpSentMessage && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{otpSentMessage}</span>
                </div>
              )}

              {isVerifiedForProceeding && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        Cryptographic Verification Complete
                      </div>
                      <div className="text-[11px] font-mono text-emerald-300">
                        Verified: {verifiedIdentifier || cleanEmail || fullPhoneDisplay}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0"
                  >
                    Next Step →
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  ← Back to Credentials
                </button>
                <button
                  type="button"
                  disabled={!isVerifiedForProceeding}
                  onClick={() => setStep(3)}
                  className="min-h-[42px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs"
                >
                  Continue to Privacy Setup →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PRIVACY, PERMISSIONS & FINALIZATION */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Privacy & Contact Discovery
                </div>

                <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Sync Contacts to Find Simple Users
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Matches saved phone numbers via SHA-256 hash so you can message friends on Simple or share the APK on WhatsApp.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={contactsPermission}
                    onChange={(e) => setContactsPermission(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Allow @username Discovery
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Let contacts find you by @{username || 'username'} without needing your phone number.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowUsernameDiscovery}
                    onChange={(e) => setAllowUsernameDiscovery(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Hide Phone Number in Public Directory
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Only people who already have your number saved can see it.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={hidePhoneNumber}
                    onChange={(e) => setHidePhoneNumber(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                <div className="text-emerald-400 font-bold">
                  ECDH P-256 Device Safety Fingerprint:
                </div>
                <div className="break-all text-slate-300">{localFingerprint}</div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[42px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex-1 min-h-[46px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {onboardingMode === 'register'
                      ? 'Complete Account Setup & Open Chats'
                      : 'Complete Sign-In & Open Chats'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
