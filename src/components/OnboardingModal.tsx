import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
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
  computeEmailHash,
  computePhoneHash,
  computePhoneTailHash,
  deriveUidFromEmail,
  deriveUidFromPhone,
  maskPhoneForFirestore,
  normalizePhone,
  sha256HexSync,
} from '../data/initialState';
import {
  apiFetch,
  createVerificationToken,
  dispatchDeviceOtpNotification,
  generateBase32Secret,
  isAndroidApkEnvironment,
} from '../utils/androidBridge';
import {
  auth,
  checkAccountInDatabase,
  ConfirmationResult,
  createPendingFirestoreAuthenticatorChallenge,
  db,
  doc,
  googleProvider,
  RecaptchaVerifier,
  recoverCloudAccountBackup,
  saveCloudAccountBackup,
  setDoc,
  signInWithPhoneNumber,
  signInWithPopup,
  verifyFirestoreAuthenticatorChallenge,
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

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91 (India)', digits: 10 },
  { code: '+1', label: '🇺🇸/🇨🇦 +1 (US/CA)', digits: 10 },
  { code: '+44', label: '🇬🇧 +44 (UK)', digits: 10 },
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

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  account,
  settings,
  localFingerprint,
  onComplete,
  onCancel,
}) => {
  const isInitialSetup =
    !account.id || !account.onboardingCompleted || (!account.phone && !account.email);

  const [step, setStep] = useState<1 | 2>(1);
  const [onboardingMode, setOnboardingMode] = useState<'register' | 'login'>('register');

  // Account Identity Mode: 'phone' (Phone Only), 'email' (Email Only), or 'both' (Phone + Email)
  const [identityMode, setIdentityMode] = useState<'phone' | 'email' | 'both'>(() => {
    if (account.phone && account.email) return 'both';
    if (account.email && !account.phone) return 'email';
    return 'phone';
  });

  const [verifyChannel, setVerifyChannel] = useState<
    'phone_otp' | 'email_otp' | 'totp' | 'google_oauth'
  >('phone_otp');

  // Step 1: User Details & Password
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
  const [about, setAbout] = useState(
    account.about || 'Hey there! I am using Simple.'
  );
  const [avatarColor, setAvatarColor] = useState(account.avatarColor || '#10B981');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    account.avatarUrl || PRESET_PROFILE_PHOTOS[0].url
  );

  // Step 2: OTP Verification State
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [incomingOtpBanner, setIncomingOtpBanner] = useState<{
    channel: 'phone' | 'email';
    target: string;
    code: string;
    emailPreviewUrl?: string;
  } | null>(null);

  // Authenticator App State
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [totpUri, setTotpUri] = useState<string>('');
  const [isGeneratingTotp, setIsGeneratingTotp] = useState(false);
  const [copiedTotpSecret, setCopiedTotpSecret] = useState(false);

  // Firebase Phone Auth State
  const [firebaseSmsConfirmation, setFirebaseSmsConfirmation] =
    useState<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Optional Custom SMTP / SMS Gateway Configuration
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayFeedback, setGatewayFeedback] = useState<string | null>(null);

  // Error Banner
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const selectedCountry =
    COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];
  const localDigitsOnly = localPhoneNumber.replace(/\D/g, '');
  const fullPhoneDisplay = localDigitsOnly
    ? `${countryCode} ${localPhoneNumber.trim()}`
    : '';
  const e164Phone = localDigitsOnly ? `${countryCode}${localDigitsOnly}` : '';
  const normalizedPhoneDigits = normalizePhone(fullPhoneDisplay);
  const rawPhoneValid =
    localDigitsOnly.length >= Math.max(7, selectedCountry.digits - 2) &&
    localDigitsOnly.length <= 14;
  const cleanEmail = email.trim().toLowerCase();
  const rawEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  const usePhoneField = identityMode === 'phone' || identityMode === 'both';
  const useEmailField = identityMode === 'email' || identityMode === 'both';

  const isPhoneValid = usePhoneField && rawPhoneValid;
  const isEmailValid = useEmailField && rawEmailValid;

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Ignore
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const handleSaveGatewayConfig = async () => {
    setErrorBanner(null);
    setGatewayFeedback(null);
    setIsSavingGateway(true);
    try {
      const res = await apiFetch('/api/auth/configure-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 465,
          smtpUser: smtpUser.trim(),
          smtpPass: smtpPass.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Could not save email settings.');
      } else {
        setGatewayFeedback('Email settings saved.');
        setShowGatewayConfig(false);
      }
    } catch {
      setErrorBanner('Could not reach server to update settings.');
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Dispatch Mobile OTP (Firebase Free Tier + Backend OTP Service)
  const dispatchMobileOtp = async (pwdHashOverride?: string) => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (!isPhoneValid || !e164Phone) {
      setErrorBanner('Please enter a valid mobile number first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      // 1. Try Firebase Phone Auth (`signInWithPhoneNumber`) when running on an authorized web domain
      if (!isAndroidApkEnvironment() && recaptchaContainerRef.current) {
        try {
          if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(
              auth,
              recaptchaContainerRef.current,
              { size: 'invisible' }
            );
          }
          const confirmation = await Promise.race([
            signInWithPhoneNumber(auth, e164Phone, recaptchaVerifierRef.current),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
          ]);
          if (confirmation) {
            setFirebaseSmsConfirmation(confirmation);
            setOtpSentMessage(`Verification code sent to ${fullPhoneDisplay}.`);
            setIsSendingOtp(false);
            return;
          }
        } catch {
          // Fall through cleanly to Firebase Free-Tier OTP Challenge Service
        }
      }

      // 2. Dispatch via Mobile OTP Service
      const pwdHash = pwdHashOverride || sha256HexSync(accountPassword.trim());
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: normalizedPhoneDigits,
          target: fullPhoneDisplay || normalizedPhoneDigits,
          channel: 'phone',
          mode: onboardingMode,
          passwordHash: pwdHash,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Could not send verification code. Please check your number.');
        return;
      }

      if (data.deliveredCode) {
        const codeStr = String(data.deliveredCode);
        dispatchDeviceOtpNotification('phone', fullPhoneDisplay, codeStr);
        setIncomingOtpBanner({
          channel: 'phone',
          target: fullPhoneDisplay,
          code: codeStr,
        });
      }

      setOtpSentMessage(`6-digit verification code sent to ${fullPhoneDisplay}.`);
    } catch {
      setErrorBanner('Could not send verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Dispatch Email OTP (Free Cloud Email / Configured SMTP)
  const dispatchEmailOtp = async (pwdHashOverride?: string) => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (!isEmailValid) {
      setErrorBanner('Please enter a valid email address first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const pwdHash = pwdHashOverride || sha256HexSync(accountPassword.trim());
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: cleanEmail,
          target: cleanEmail,
          channel: 'email',
          mode: onboardingMode,
          passwordHash: pwdHash,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Could not send email verification code.');
        return;
      }

      if (data.deliveredCode) {
        const codeStr = String(data.deliveredCode);
        dispatchDeviceOtpNotification('email', cleanEmail, codeStr);
        setIncomingOtpBanner({
          channel: 'email',
          target: cleanEmail,
          code: codeStr,
          emailPreviewUrl: data.emailPreviewUrl ? String(data.emailPreviewUrl) : undefined,
        });
      }

      setOtpSentMessage(`6-digit verification code sent to ${cleanEmail}.`);
    } catch {
      setErrorBanner('Could not send verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Finalize Account Creation or Sign-In Immediately & Open Chats (Never hangs!)
  const finalizeAndOpenChats = async (params: {
    issuedToken: string;
    recoveredAccount?: Partial<UserAccount> | null;
    recoveredChats?: ChatConversation[];
    resolvedTotpSecret?: string;
  }) => {
    const cleanName = (params.recoveredAccount?.name || name).trim() || 'Simple User';
    const fallbackSuffix =
      normalizedPhoneDigits.slice(-4) ||
      cleanEmail.slice(0, 4).replace(/[^a-z0-9]/g, '') ||
      '1001';
    const cleanHandle =
      (params.recoveredAccount?.username || username)
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9._]/g, '') ||
      cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      `user.${fallbackSuffix}`;

    const deterministicUid =
      params.recoveredAccount?.id ||
      (isPhoneValid && normalizedPhoneDigits.length >= 7
        ? deriveUidFromPhone(normalizedPhoneDigits)
        : deriveUidFromEmail(cleanEmail));

    const pwdHash = accountPassword
      ? sha256HexSync(accountPassword.trim())
      : params.recoveredAccount?.passwordHash;

    const finalPhone = isPhoneValid
      ? fullPhoneDisplay
      : params.recoveredAccount?.phone || '';
    const finalNormPhone = isPhoneValid
      ? normalizedPhoneDigits
      : params.recoveredAccount?.normalizedPhone || '';
    const finalEmail = isEmailValid
      ? cleanEmail
      : params.recoveredAccount?.email || '';

    const finalAccount: UserAccount = {
      id: deterministicUid,
      name: cleanName,
      username: cleanHandle,
      phone: finalPhone,
      normalizedPhone: finalNormPhone,
      email: finalEmail,
      authMethod:
        verifyChannel === 'totp'
          ? 'totp'
          : verifyChannel === 'google_oauth'
          ? 'google_oauth'
          : isPhoneValid && isEmailValid
          ? 'both'
          : isPhoneValid
          ? 'phone_otp'
          : 'gmail_otp',
      phoneVerified: Boolean(isPhoneValid || params.recoveredAccount?.phoneVerified),
      emailVerified: Boolean(isEmailValid || params.recoveredAccount?.emailVerified),
      passwordHash: pwdHash,
      totpSecret:
        params.resolvedTotpSecret || totpSecret || params.recoveredAccount?.totpSecret,
      verificationToken: params.issuedToken,
      about: (params.recoveredAccount?.about || about).trim() || 'Hey there! I am using Simple.',
      avatarColor: params.recoveredAccount?.avatarColor || avatarColor,
      avatarUrl: params.recoveredAccount?.avatarUrl || avatarUrl,
      allowUsernameDiscovery: account.allowUsernameDiscovery ?? true,
      hidePhoneNumber: account.hidePhoneNumber ?? false,
      onboardingCompleted: true,
      cloudBackupGmail: finalEmail || undefined,
    };

    const backupPayload = JSON.stringify({
      version: '6.0.0',
      totpVerified: true,
      onboardingCompleted: true,
      exportedAt: Date.now(),
      account: finalAccount,
      passwordHash: pwdHash,
      totpSecret: finalAccount.totpSecret,
      chats: params.recoveredChats || [],
    });

    // Save account & directory in parallel with fast 750ms ceiling so UI opens Chats immediately
    const phoneHash = finalNormPhone ? computePhoneHash(finalNormPhone) : '';
    const phoneTailHash = finalNormPhone ? computePhoneTailHash(finalNormPhone) : '';
    const emailHash = finalEmail ? computeEmailHash(finalEmail) : '';

    const dirPayload: Record<string, any> = {
      uid: finalAccount.id,
      name: finalAccount.name.slice(0, 80),
      username: finalAccount.username.slice(0, 40),
      phone: finalPhone ? maskPhoneForFirestore(finalPhone) : 'Email Account',
      normalizedPhone: finalNormPhone
        ? finalNormPhone.slice(-2).padStart(finalNormPhone.length, '0')
        : '0000000000',
      about: (finalAccount.about || 'Hey there! I am using Simple.').slice(0, 160),
      avatarColor: finalAccount.avatarColor || '#10B981',
      identityFingerprint: localFingerprint || 'E2EE-VERIFIED',
      allowUsernameDiscovery: true,
      hidePhoneNumber: false,
      isOnline: true,
      lastSeen: Date.now(),
      updatedAt: Date.now(),
    };
    if (phoneHash) dirPayload.phoneHash = phoneHash;
    if (phoneTailHash) dirPayload.phoneTailHash = phoneTailHash;
    if (emailHash) dirPayload.emailHash = emailHash;

    // Trigger directory writes without blocking UI
    Promise.race([
      Promise.all([
        saveCloudAccountBackup({
          uid: finalAccount.id,
          username: finalAccount.username,
          phone: finalNormPhone || undefined,
          email: finalEmail || undefined,
          phoneHash: phoneHash || undefined,
          emailHash: emailHash || undefined,
          passwordHash: pwdHash,
          totpSecret: finalAccount.totpSecret,
          verificationToken: params.issuedToken,
          backupJson: backupPayload,
        }),
        setDoc(doc(db, 'directory', finalAccount.id), dirPayload).catch(() => {}),
        phoneHash && phoneTailHash
          ? setDoc(doc(db, 'phone_index', phoneHash), {
              phoneHash,
              phoneTailHash,
              targetUid: finalAccount.id,
              username: finalAccount.username.slice(0, 40),
              name: finalAccount.name.slice(0, 80),
              avatarColor: finalAccount.avatarColor || '#10B981',
              identityFingerprint: localFingerprint || 'E2EE-VERIFIED',
              updatedAt: Date.now(),
            }).catch(() => {})
          : Promise.resolve(),
      ]),
      new Promise((resolve) => setTimeout(resolve, 650)),
    ]).catch(() => {});

    // Open Chats immediately
    onComplete(
      finalAccount,
      {
        appLockEnabled: settings.appLockEnabled,
        contactsPermissionGranted: true,
        notificationsPermissionGranted: true,
        backupMode: 'cloud_e2ee',
      },
      params.recoveredChats
    );
  };

  // Validate Step 1 and Proceed to Step 2 (Auto-dispatches OTP for chosen channel)
  const handleProceedToVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);
    setIncomingOtpBanner(null);

    if (identityMode === 'phone' && !rawPhoneValid) {
      setErrorBanner('Please enter a valid mobile phone number.');
      return;
    }
    if (identityMode === 'email' && !rawEmailValid) {
      setErrorBanner('Please enter a valid email address.');
      return;
    }
    if (identityMode === 'both' && (!rawPhoneValid || !rawEmailValid)) {
      setErrorBanner('Please enter both a valid phone number and email address.');
      return;
    }

    if (onboardingMode === 'register') {
      if (!name.trim() || name.trim().length < 2) {
        setErrorBanner('Please enter your name (at least 2 characters).');
        return;
      }
      if (!accountPassword || accountPassword.length < 6) {
        setErrorBanner('Please create a password (at least 6 characters).');
        return;
      }
      if (accountPassword !== confirmPassword) {
        setErrorBanner('Passwords do not match.');
        return;
      }
    } else {
      if (!accountPassword || accountPassword.length < 6) {
        setErrorBanner('Please enter your password to sign in.');
        return;
      }
    }

    setIsSendingOtp(true);
    try {
      const pwdHash = sha256HexSync(accountPassword.trim());

      // Check account status
      const checkData = await checkAccountInDatabase({
        phone: isPhoneValid ? normalizedPhoneDigits : undefined,
        email: isEmailValid ? cleanEmail : undefined,
        username: username.trim().replace(/^@/, ''),
        mode: onboardingMode,
        passwordHash: pwdHash,
      });

      if (onboardingMode === 'register' && checkData.exists) {
        setErrorBanner(
          `An account with this ${checkData.matchedBy || 'phone number or email'} already exists${
            checkData.accountSummary?.username
              ? ` (@${checkData.accountSummary.username})`
              : ''
          }. Please tap "Sign In" above.`
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && !checkData.exists) {
        setErrorBanner(
          'No account found with these details. Please check your number/email or tap "Create Account".'
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && checkData.exists) {
        if (checkData.passwordHash && checkData.passwordHash !== pwdHash) {
          setErrorBanner('Incorrect password. Please try again.');
          setIsSendingOtp(false);
          return;
        }
        setTotpSecret('');
        setTotpUri('');
      }

      // Prepare Authenticator secret in background for registration
      if (onboardingMode === 'register') {
        const cleanHandle =
          username
            .trim()
            .toLowerCase()
            .replace(/^@/, '')
            .replace(/[^a-z0-9._]/g, '') ||
          name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') ||
          `user.${normalizedPhoneDigits.slice(-4) || '1001'}`;

        const deterministicUid =
          isPhoneValid && normalizedPhoneDigits.length >= 7
            ? deriveUidFromPhone(normalizedPhoneDigits)
            : deriveUidFromEmail(cleanEmail);

        const activeSecret = checkData.totpSecret || totpSecret || generateBase32Secret(20);
        const label = (
          (isEmailValid ? cleanEmail : '') ||
          (isPhoneValid ? fullPhoneDisplay : '') ||
          cleanHandle ||
          'SimpleUser'
        ).replace(/[^a-zA-Z0-9@._+-]/g, '');
        const uri = `otpauth://totp/Simple:${encodeURIComponent(
          label
        )}?secret=${activeSecret}&issuer=Simple&algorithm=SHA1&digits=6&period=30`;

        setTotpSecret(activeSecret);
        setTotpUri(uri);

        createPendingFirestoreAuthenticatorChallenge({
          uid: deterministicUid,
          username: cleanHandle,
          name: name.trim(),
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          totpSecret: activeSecret,
        }).catch(() => {});
      }

      // Choose default verification channel and automatically send OTP
      const defaultChannel = isPhoneValid ? 'phone_otp' : 'email_otp';
      setVerifyChannel(defaultChannel);
      setOtpInput('');
      setStep(2);

      if (defaultChannel === 'phone_otp') {
        await dispatchMobileOtp(pwdHash);
      } else {
        await dispatchEmailOtp(pwdHash);
      }
    } catch {
      setErrorBanner('Please check your connection and try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Rotate Authenticator Key
  const handleGenerateTotpSecret = async () => {
    if (onboardingMode !== 'register') return;
    setErrorBanner(null);
    setIsGeneratingTotp(true);
    try {
      const cleanHandle =
        username
          .trim()
          .toLowerCase()
          .replace(/^@/, '')
          .replace(/[^a-z0-9._]/g, '') ||
        name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') ||
        `user.${normalizedPhoneDigits.slice(-4) || '1001'}`;
      const deterministicUid =
        isPhoneValid && normalizedPhoneDigits.length >= 7
          ? deriveUidFromPhone(normalizedPhoneDigits)
          : deriveUidFromEmail(cleanEmail);
      const pwdHash = sha256HexSync(accountPassword.trim());

      const secret = generateBase32Secret(20);
      const label = (
        (isEmailValid ? cleanEmail : '') ||
        (isPhoneValid ? fullPhoneDisplay : '') ||
        cleanHandle ||
        'SimpleUser'
      ).replace(/[^a-zA-Z0-9@._+-]/g, '');
      const uri = `otpauth://totp/Simple:${encodeURIComponent(
        label
      )}?secret=${secret}&issuer=Simple&algorithm=SHA1&digits=6&period=30`;

      setTotpSecret(secret);
      setTotpUri(uri);

      await createPendingFirestoreAuthenticatorChallenge({
        uid: deterministicUid,
        username: cleanHandle,
        name: name.trim(),
        phone: isPhoneValid ? normalizedPhoneDigits : undefined,
        email: isEmailValid ? cleanEmail : undefined,
        passwordHash: pwdHash,
        totpSecret: secret,
      });
    } finally {
      setIsGeneratingTotp(false);
    }
  };

  // Google Sign-In Verification
  const handleGoogleOAuthVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (isAndroidApkEnvironment()) {
      setVerifyChannel(isEmailValid ? 'email_otp' : 'phone_otp');
      if (isEmailValid) {
        await dispatchEmailOtp();
      } else {
        await dispatchMobileOtp();
      }
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const verifiedGmail = String(result.user.email || cleanEmail || '')
        .trim()
        .toLowerCase();

      if (isEmailValid && verifiedGmail && verifiedGmail !== cleanEmail) {
        setErrorBanner(
          `Signed in as "${verifiedGmail}", which does not match "${cleanEmail}".`
        );
        setIsVerifyingOtp(false);
        return;
      }

      const vToken = createVerificationToken(verifiedGmail || cleanEmail);
      const pwdHash = sha256HexSync(accountPassword.trim());

      let recoveredAccount: Partial<UserAccount> | null = null;
      let recoveredChats: ChatConversation[] | undefined;

      if (onboardingMode === 'login') {
        const recovered = await recoverCloudAccountBackup({
          email: verifiedGmail,
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          passwordHash: pwdHash,
          verificationToken: vToken,
        });

        if (!recovered) {
          setErrorBanner('Incorrect password for this account.');
          setIsVerifyingOtp(false);
          return;
        }
        recoveredAccount = recovered.account || null;
        recoveredChats = recovered.chats;
      } else if (!name.trim() && result.user.displayName) {
        setName(result.user.displayName);
      }

      setEmail(verifiedGmail);
      await finalizeAndOpenChats({
        issuedToken: vToken,
        recoveredAccount,
        recoveredChats,
      });
    } catch {
      setErrorBanner('Google Sign-In was cancelled. Please enter the 6-digit verification code below.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Verify 6-Digit Code & Immediately Open Chats
  const handleVerifyAndOpenChats = async (codeOverride?: string) => {
    setErrorBanner(null);
    const cleanCode = (codeOverride ?? otpInput).trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorBanner('Please enter the 6-digit verification code.');
      return;
    }

    const activeChannel: 'email' | 'phone' =
      verifyChannel === 'email_otp' || verifyChannel === 'google_oauth'
        ? 'email'
        : verifyChannel === 'phone_otp'
        ? 'phone'
        : isPhoneValid
        ? 'phone'
        : 'email';

    const identifier = activeChannel === 'email' ? cleanEmail : normalizedPhoneDigits;
    const deterministicUid =
      isPhoneValid && normalizedPhoneDigits.length >= 7
        ? deriveUidFromPhone(normalizedPhoneDigits)
        : deriveUidFromEmail(cleanEmail);

    setIsVerifyingOtp(true);
    try {
      const pwdHash = sha256HexSync(accountPassword.trim());

      // 1. If on Authenticator tab, verify TOTP code
      if (verifyChannel === 'totp') {
        const totpResult = await verifyFirestoreAuthenticatorChallenge({
          uid: deterministicUid,
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          code: cleanCode,
          mode: onboardingMode,
          expectedTotpSecret: onboardingMode === 'register' ? totpSecret : undefined,
        });

        if (!totpResult.ok || !totpResult.verificationToken) {
          setErrorBanner(
            totpResult.error ||
              'Invalid 6-digit code. Please check your Authenticator app and try again.'
          );
          setIsVerifyingOtp(false);
          return;
        }

        await finalizeAndOpenChats({
          issuedToken: totpResult.verificationToken,
          recoveredAccount: totpResult.recoveredBundle?.account || null,
          recoveredChats: totpResult.recoveredBundle?.chats,
          resolvedTotpSecret: totpResult.totpSecret,
        });
        return;
      }

      // 2. If Firebase Phone Auth ConfirmationResult is active, verify with Firebase Auth
      if (verifyChannel === 'phone_otp' && firebaseSmsConfirmation) {
        try {
          await firebaseSmsConfirmation.confirm(cleanCode);
          const vToken = createVerificationToken(identifier);
          let recoveredAccount: Partial<UserAccount> | null = null;
          let recoveredChats: ChatConversation[] | undefined;

          if (onboardingMode === 'login') {
            const recovered = await recoverCloudAccountBackup({
              phone: isPhoneValid ? normalizedPhoneDigits : undefined,
              email: isEmailValid ? cleanEmail : undefined,
              passwordHash: pwdHash,
              verificationToken: vToken,
            });
            recoveredAccount = recovered?.account || null;
            recoveredChats = recovered?.chats;
          }

          await finalizeAndOpenChats({
            issuedToken: vToken,
            recoveredAccount,
            recoveredChats,
          });
          return;
        } catch {
          // Fall through to check backend OTP challenge
        }
      }

      // 3. Verify Mobile OTP or Email OTP with OTP Verification Service
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          target: identifier,
          channel: activeChannel,
          code: cleanCode,
          mode: onboardingMode,
          passwordHash: pwdHash,
          totpSecret: onboardingMode === 'register' ? totpSecret : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorBanner(
          data.error || 'Invalid or expired verification code. Please check your code and try again.'
        );
        setIsVerifyingOtp(false);
        return;
      }

      const issuedToken = data.verificationToken || createVerificationToken(identifier);
      let recoveredAccount: Partial<UserAccount> | null = null;
      let recoveredChats: ChatConversation[] | undefined;

      if (onboardingMode === 'login') {
        const recovered = await recoverCloudAccountBackup({
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          verificationToken: issuedToken,
        });

        if (!recovered) {
          setErrorBanner('Incorrect password for this account.');
          setIsVerifyingOtp(false);
          return;
        }
        recoveredAccount = recovered.account || null;
        recoveredChats = recovered.chats;
      }

      await finalizeAndOpenChats({
        issuedToken,
        recoveredAccount,
        recoveredChats,
        resolvedTotpSecret: data.totpSecret || totpSecret,
      });
    } catch {
      setErrorBanner('Verification failed. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/95 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      {/* Invisible container for Firebase Phone Auth RecaptchaVerifier */}
      <div
        id="firebase-recaptcha-container"
        ref={recaptchaContainerRef}
        className="sr-only"
      />

      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[96dvh] flex flex-col">
        {/* Clean Header */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {onboardingMode === 'register' ? 'Create Account' : 'Sign In'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {step === 1
                  ? 'Enter your details to get started'
                  : 'Enter your 6-digit verification code'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  step === s
                    ? 'w-6 bg-emerald-400'
                    : step > s
                    ? 'w-3 bg-emerald-500/50'
                    : 'w-3 bg-slate-800'
                }`}
              />
            ))}
            {!isInitialSetup && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="ml-2 p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error Banner */}
          {errorBanner && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
              <div className="flex-1 leading-relaxed">{errorBanner}</div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-rose-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* STEP 1: ACCOUNT DETAILS */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Create Account vs Sign In Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('register');
                    setErrorBanner(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'register'
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('login');
                    setErrorBanner(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'login'
                      ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>

              {/* Phone / Email / Both Selector */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIdentityMode('phone');
                    setErrorBanner(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                    identityMode === 'phone'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Phone</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentityMode('email');
                    setErrorBanner(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                    identityMode === 'email'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentityMode('both');
                    setErrorBanner(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                    identityMode === 'both'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Phone + Email</span>
                </button>
              </div>

              {onboardingMode === 'register' && (
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={name || 'S'}
                      color={avatarColor}
                      avatarUrl={avatarUrl}
                      size="lg"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Your Name *
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Username (optional)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-mono">
                            @
                          </span>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) =>
                              setUsername(
                                e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')
                              )
                            }
                            placeholder={
                              name
                                ? name.toLowerCase().replace(/[^a-z0-9]/g, '')
                                : 'username'
                            }
                            className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Profile Photo Picker */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {PRESET_PROFILE_PHOTOS.slice(0, 8).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setAvatarUrl(preset.url)}
                        className={`p-1 rounded-xl border transition-all shrink-0 ${
                          avatarUrl === preset.url
                            ? 'border-emerald-400 bg-emerald-500/20 scale-105'
                            : 'border-slate-800 bg-slate-900/60 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone & Email Inputs */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                {usePhoneField && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Phone Number *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-36 px-2.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 shrink-0"
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
                        onChange={(e) =>
                          setLocalPhoneNumber(e.target.value.replace(/[^\d\s-]/g, ''))
                        }
                        placeholder="98765 43210"
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {useEmailField && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {onboardingMode === 'register' ? 'Create Password' : 'Password'}
                  </span>
                </div>

                <div
                  className={
                    onboardingMode === 'register'
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                      : 'space-y-2'
                  }
                >
                  <div>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Password (min 6 characters)"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {onboardingMode === 'register' && (
                    <div>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isSendingOtp}
                onClick={handleProceedToVerification}
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {isSendingOtp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sending verification code...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: OTP VERIFICATION & INSTANT START CHATTING */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-300 truncate">
                  Verifying{' '}
                  <strong className="text-white font-mono">
                    {isPhoneValid && isEmailValid
                      ? `${fullPhoneDisplay} / ${cleanEmail}`
                      : isPhoneValid
                      ? fullPhoneDisplay
                      : cleanEmail}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Incoming OTP Notification Banner (Mobile SMS / Email OTP Service) */}
              {incomingOtpBanner && verifyChannel !== 'totp' && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <Bell className="w-4 h-4 text-emerald-400 animate-bounce" />
                      <span>
                        {incomingOtpBanner.channel === 'phone'
                          ? `SMS Code for ${incomingOtpBanner.target}`
                          : `Email Code for ${incomingOtpBanner.target}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpInput(incomingOtpBanner.code);
                        handleVerifyAndOpenChats(incomingOtpBanner.code);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px]"
                    >
                      Verify Now
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="text-xs text-slate-200">
                      Your verification code is{' '}
                      <span className="font-mono font-bold text-sm text-emerald-300 tracking-widest px-2 py-0.5 rounded bg-slate-950 border border-emerald-500/40">
                        {incomingOtpBanner.code}
                      </span>
                    </div>
                    {incomingOtpBanner.emailPreviewUrl && (
                      <a
                        href={incomingOtpBanner.emailPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
                      >
                        <span>Open Email</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Verification Method Tabs */}
              <div className="flex gap-1.5">
                {isPhoneValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('phone_otp');
                      setErrorBanner(null);
                    }}
                    className={`flex-1 py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      verifyChannel === 'phone_otp'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Mobile OTP</span>
                  </button>
                )}

                {isEmailValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('email_otp');
                      setErrorBanner(null);
                    }}
                    className={`flex-1 py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      verifyChannel === 'email_otp'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email OTP</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setVerifyChannel('totp');
                    setErrorBanner(null);
                  }}
                  className={`flex-1 py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                    verifyChannel === 'totp'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Authenticator</span>
                </button>
              </div>

              {/* MOBILE OTP TAB */}
              {verifyChannel === 'phone_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Enter 6-Digit Mobile Code
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Sent to {fullPhoneDisplay}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSendingOtp}
                      onClick={() => dispatchMobileOtp()}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 shrink-0"
                    >
                      {isSendingOtp ? 'Sending...' : 'Resend Code'}
                    </button>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) =>
                      setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-base text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* EMAIL OTP TAB */}
              {verifyChannel === 'email_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Enter 6-Digit Email Code
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Sent to {cleanEmail}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isSendingOtp}
                        onClick={() => dispatchEmailOtp()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-cyan-300 shrink-0"
                      >
                        {isSendingOtp ? 'Sending...' : 'Resend Code'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGatewayConfig((v) => !v)}
                        className="px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400 hover:text-white"
                      >
                        SMTP
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) =>
                      setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-base text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-cyan-500"
                  />

                  {!isAndroidApkEnvironment() && (
                    <button
                      type="button"
                      disabled={isVerifyingOtp}
                      onClick={handleGoogleOAuthVerification}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                      <span>Continue with Google</span>
                    </button>
                  )}
                </div>
              )}

              {/* AUTHENTICATOR APP TAB */}
              {verifyChannel === 'totp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        {onboardingMode === 'register'
                          ? 'Link Google Authenticator'
                          : 'Enter Authenticator Code'}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {onboardingMode === 'register'
                          ? 'Add this key to your Authenticator app, then enter the 6-digit code.'
                          : 'Open Google Authenticator and enter the 6-digit code for Simple.'}
                      </p>
                    </div>
                    {onboardingMode === 'register' && (
                      <button
                        type="button"
                        disabled={isGeneratingTotp}
                        onClick={handleGenerateTotpSecret}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 shrink-0"
                      >
                        New Key
                      </button>
                    )}
                  </div>

                  {onboardingMode === 'register' && totpSecret && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                      {totpUri && (
                        <a
                          href={totpUri}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Open in Authenticator App</span>
                        </a>
                      )}

                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800">
                        <code className="text-xs font-mono font-bold text-emerald-300 break-all">
                          {totpSecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(totpSecret);
                            setCopiedTotpSecret(true);
                            setTimeout(() => setCopiedTotpSecret(false), 2000);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1 shrink-0"
                        >
                          {copiedTotpSecret ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) =>
                      setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-base text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Optional Custom SMTP Configuration */}
              {showGatewayConfig && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Custom SMTP Settings (Optional)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="465"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="Gmail address"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="App Password"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isSavingGateway}
                    onClick={handleSaveGatewayConfig}
                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    {isSavingGateway ? 'Saving...' : 'Save SMTP Settings'}
                  </button>
                </div>
              )}

              {gatewayFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
                  {gatewayFeedback}
                </div>
              )}

              {otpSentMessage && !incomingOtpBanner && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{otpSentMessage}</span>
                </div>
              )}

              {/* Primary Action: Verify & Start Chatting Immediately */}
              <button
                type="button"
                disabled={isVerifyingOtp || otpInput.length !== 6}
                onClick={() => handleVerifyAndOpenChats()}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {isVerifyingOtp ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Starting chats...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {onboardingMode === 'login'
                        ? 'Verify & Sign In'
                        : 'Verify & Start Chatting'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
