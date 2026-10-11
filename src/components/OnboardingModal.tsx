import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
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
  const [about] = useState(account.about || 'Hey there! I am using Simple.');
  const [avatarColor] = useState(account.avatarColor || '#10B981');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    account.avatarUrl || PRESET_PROFILE_PHOTOS[0].url
  );

  // Step 2: Strict Out-of-Band OTP / Authenticator Verification (NEVER shows OTP inside app!)
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [externalGatewayDelivered, setExternalGatewayDelivered] = useState<boolean>(false);

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

  // Optional SMS / Email Gateway Configuration
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [twoFactorApiKey, setTwoFactorApiKey] = useState(() => localStorage.getItem('cfg_twofactor') || '');
  const [fast2smsApiKey, setFast2smsApiKey] = useState(() => localStorage.getItem('cfg_fast2sms') || '');
  const [twilioAccountSid, setTwilioAccountSid] = useState(() => localStorage.getItem('cfg_tw_sid') || '');
  const [twilioAuthToken, setTwilioAuthToken] = useState(() => localStorage.getItem('cfg_tw_token') || '');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState(() => localStorage.getItem('cfg_tw_phone') || '');
  const [firebaseApiKeyInput, setFirebaseApiKeyInput] = useState(() => localStorage.getItem('cfg_firebase_key') || '');
  const [textbeltApiKey, setTextbeltApiKey] = useState(() => localStorage.getItem('cfg_textbelt') || '');
  const [resendApiKey, setResendApiKey] = useState(() => localStorage.getItem('cfg_resend') || '');
  const [smtpHost, setSmtpHost] = useState(() => localStorage.getItem('cfg_smtp_host') || 'smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(() => localStorage.getItem('cfg_smtp_port') || '465');
  const [smtpUser, setSmtpUser] = useState(() => localStorage.getItem('cfg_smtp_user') || '');
  const [smtpPass, setSmtpPass] = useState(() => localStorage.getItem('cfg_smtp_pass') || '');
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
      localStorage.setItem('cfg_twofactor', twoFactorApiKey.trim());
      localStorage.setItem('cfg_fast2sms', fast2smsApiKey.trim());
      localStorage.setItem('cfg_tw_sid', twilioAccountSid.trim());
      localStorage.setItem('cfg_tw_token', twilioAuthToken.trim());
      localStorage.setItem('cfg_tw_phone', twilioPhoneNumber.trim());
      localStorage.setItem('cfg_firebase_key', firebaseApiKeyInput.trim());
      localStorage.setItem('cfg_textbelt', textbeltApiKey.trim());
      localStorage.setItem('cfg_resend', resendApiKey.trim());
      localStorage.setItem('cfg_smtp_host', smtpHost.trim());
      localStorage.setItem('cfg_smtp_port', smtpPort.trim());
      localStorage.setItem('cfg_smtp_user', smtpUser.trim());
      localStorage.setItem('cfg_smtp_pass', smtpPass.trim());

      const res = await apiFetch('/api/auth/configure-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twoFactorApiKey: twoFactorApiKey.trim() || undefined,
          fast2smsApiKey: fast2smsApiKey.trim() || undefined,
          twilioAccountSid: twilioAccountSid.trim() || undefined,
          twilioAuthToken: twilioAuthToken.trim() || undefined,
          twilioPhoneNumber: twilioPhoneNumber.trim() || undefined,
          firebaseApiKey: firebaseApiKeyInput.trim() || undefined,
          textbeltApiKey: textbeltApiKey.trim() || undefined,
          resendApiKey: resendApiKey.trim() || undefined,
          smtpHost: smtpHost.trim() || 'smtp.gmail.com',
          smtpPort: Number(smtpPort) || 465,
          smtpUser: smtpUser.trim() || undefined,
          smtpPass: smtpPass.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorBanner(data.error || 'Could not save gateway settings.');
      } else {
        setGatewayFeedback('SMS & Email delivery settings saved! Tap "Resend SMS" to send.');
        setShowGatewayConfig(false);
      }
    } catch {
      setErrorBanner('Could not reach server to update gateway settings.');
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Dispatch Mobile OTP strictly via external SMS (Firebase Phone Auth / Carrier SMS Gateway)
  const dispatchMobileOtp = async (pwdHashOverride?: string) => {
    setErrorBanner(null);
    setOtpSentMessage(null);
    setExternalGatewayDelivered(false);

    if (!isPhoneValid || !e164Phone) {
      setErrorBanner('Please enter a valid mobile number first.');
      return;
    }

    setIsSendingOtp(true);
    let firebaseErrorMessage: string | null = null;

    // 1. Try Firebase Phone Auth (signInWithPhoneNumber) on authorized web domain
    if (!isAndroidApkEnvironment() && recaptchaContainerRef.current) {
      try {
        if (!recaptchaVerifierRef.current) {
          recaptchaVerifierRef.current = new RecaptchaVerifier(
            auth,
            recaptchaContainerRef.current,
            {
              size: 'invisible',
              callback: () => {},
            }
          );
        }

        const confirmation = await signInWithPhoneNumber(
          auth,
          e164Phone,
          recaptchaVerifierRef.current
        );

        if (confirmation) {
          setFirebaseSmsConfirmation(confirmation);
          setExternalGatewayDelivered(true);
          setOtpSentMessage(`SMS verification code sent to ${fullPhoneDisplay} via Firebase Phone Service.`);
          setIsSendingOtp(false);
          return;
        }
      } catch (fbErr: any) {
        console.warn('Firebase Phone Auth attempt:', fbErr?.code || fbErr?.message);
        const code = String(fbErr?.code || '');
        if (code === 'auth/operation-not-allowed') {
          firebaseErrorMessage =
            'Firebase Phone Auth is disabled on this project. Requesting carrier SMS...';
        } else if (code === 'auth/invalid-phone-number') {
          setErrorBanner('Invalid mobile phone number format for SMS delivery.');
          setIsSendingOtp(false);
          return;
        } else if (code === 'auth/quota-exceeded') {
          firebaseErrorMessage =
            'Firebase SMS quota reached. Requesting carrier SMS...';
        } else {
          firebaseErrorMessage = fbErr?.message || 'Firebase SMS request failed.';
        }
        try {
          recaptchaVerifierRef.current?.clear();
          recaptchaVerifierRef.current = null;
        } catch {
          // ignore
        }
      }
    }

    // 2. Dispatch via Backend Carrier SMS Gateway (2Factor.in / Fast2SMS / Twilio / Textbelt)
    try {
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
        setErrorBanner(
          data.error ||
            firebaseErrorMessage ||
            'Could not send verification code. Please check your number or configure SMS gateway.'
        );
        return;
      }

      const delivered = Boolean(data.externalDelivered);
      setExternalGatewayDelivered(delivered);
      if (delivered) {
        setOtpSentMessage(
          `6-digit SMS code sent to ${fullPhoneDisplay} via ${data.deliveryProvider || 'Carrier SMS'}. Check your text messages.`
        );
      } else {
        setOtpSentMessage(
          `Enter the 6-digit SMS code sent to ${fullPhoneDisplay}, tap "SMS Setup" to configure gateway, or use Google Authenticator.`
        );
      }
    } catch {
      setErrorBanner('Could not request verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Dispatch Email OTP strictly via external Email (SMTP / Resend)
  const dispatchEmailOtp = async (pwdHashOverride?: string) => {
    setErrorBanner(null);
    setOtpSentMessage(null);
    setExternalGatewayDelivered(false);

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

      const delivered = Boolean(data.externalDelivered);
      setExternalGatewayDelivered(delivered);
      if (delivered) {
        setOtpSentMessage(
          `6-digit verification code sent to ${cleanEmail}. Please check your email inbox (and Spam folder).`
        );
      } else {
        setOtpSentMessage(
          `Enter the 6-digit code sent to ${cleanEmail}, tap "Continue with Google", or use Google Authenticator.`
        );
      }
    } catch {
      setErrorBanner('Could not request verification code. Please try again.');
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
      version: '8.0.0',
      totpVerified: true,
      onboardingCompleted: true,
      exportedAt: Date.now(),
      account: finalAccount,
      passwordHash: pwdHash,
      totpSecret: finalAccount.totpSecret,
      chats: params.recoveredChats || [],
    });

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

    // Trigger directory & account backup writes with fast 650ms ceiling so Chats open immediately
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
        chatLockEnabled: settings.chatLockEnabled,
        contactsPermissionGranted: true,
        notificationsPermissionGranted: true,
        backupMode: 'cloud_e2ee',
      },
      params.recoveredChats
    );
  };

  // Validate Step 1 and Proceed to Step 2
  const handleProceedToVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

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

      // Check account existence & ownership in database
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
          setErrorBanner('Incorrect password for this account. Access denied.');
          setIsSendingOtp(false);
          return;
        }
        setTotpSecret('');
        setTotpUri('');
      }

      // Prepare Authenticator challenge in background for registration
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

      // Choose default verification channel and request out-of-band OTP
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

  // Google Sign-In Verification (Real Google OAuth verification)
  const handleGoogleOAuthVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (isAndroidApkEnvironment()) {
      setVerifyChannel(isEmailValid ? 'email_otp' : 'totp');
      if (isEmailValid) {
        await dispatchEmailOtp();
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
      setErrorBanner(
        'Google Sign-In was cancelled. Please enter your 6-digit verification code below.'
      );
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
        : 'phone';

    const identifier = activeChannel === 'email' ? cleanEmail : normalizedPhoneDigits;
    const deterministicUid =
      isPhoneValid && normalizedPhoneDigits.length >= 7
        ? deriveUidFromPhone(normalizedPhoneDigits)
        : deriveUidFromEmail(cleanEmail);

    setIsVerifyingOtp(true);
    try {
      const pwdHash = sha256HexSync(accountPassword.trim());

      // 1. If verifying via Google Authenticator (TOTP tab), verify with backend / TOTP verification
      if (verifyChannel === 'totp') {
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
          const fallbackCheck = await verifyFirestoreAuthenticatorChallenge({
            uid: deterministicUid,
            phone: isPhoneValid ? normalizedPhoneDigits : undefined,
            email: isEmailValid ? cleanEmail : undefined,
            passwordHash: pwdHash,
            code: cleanCode,
            mode: onboardingMode,
            expectedTotpSecret: onboardingMode === 'register' ? totpSecret : undefined,
          });

          if (fallbackCheck.ok && fallbackCheck.verificationToken) {
            await finalizeAndOpenChats({
              issuedToken: fallbackCheck.verificationToken,
              recoveredAccount: fallbackCheck.recoveredBundle?.account || null,
              recoveredChats: fallbackCheck.recoveredBundle?.chats,
              resolvedTotpSecret: fallbackCheck.totpSecret,
            });
            return;
          }

          setErrorBanner(
            data.error ||
              'Invalid 6-digit Authenticator code. Please open Google Authenticator and try again.'
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
        return;
      }

      // 2. If Firebase Phone Auth ConfirmationResult is active, verify with Firebase Auth
      if (verifyChannel === 'phone_otp' && firebaseSmsConfirmation) {
        try {
          const userCredential = await firebaseSmsConfirmation.confirm(cleanCode);
          const idToken = await userCredential.user.getIdToken();

          // Cryptographically verify ID token with server to confirm genuine phone ownership
          const vRes = await apiFetch('/api/auth/verify-firebase-phone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              phone: e164Phone,
              target: normalizedPhoneDigits,
            }),
          });
          const vData = await vRes.json();

          const vToken =
            vData.ok && vData.verificationToken
              ? vData.verificationToken
              : createVerificationToken(identifier);

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
        } catch (fbErr: any) {
          console.warn('Firebase SMS verification error:', fbErr);
          if (fbErr?.code === 'auth/invalid-verification-code') {
            setErrorBanner('Incorrect SMS verification code. Please check the code sent to your phone.');
            setIsVerifyingOtp(false);
            return;
          }
          // Fall through to backend verification
        }
      }

      // 3. Verify Mobile SMS OTP or Email OTP with Backend Service
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
          data.error ||
            'Invalid or expired 6-digit verification code. Please check your SMS or email.'
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
        className="fixed bottom-0 right-0 z-0 pointer-events-none opacity-0"
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
                  : 'Verify your identity to continue'}
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
                      avatarColor={avatarColor}
                      avatarUrl={avatarUrl}
                      sizeClass="w-14 h-14"
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
                    {onboardingMode === 'register'
                      ? 'Account Password'
                      : 'Account Password'}
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
                    <span>Checking account...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: STRICT OUT-OF-BAND OTP / PIN / AUTHENTICATOR VERIFICATION */}
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

              {/* Verification Method Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {isPhoneValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('phone_otp');
                      setErrorBanner(null);
                    }}
                    className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      verifyChannel === 'phone_otp'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>SMS OTP</span>
                  </button>
                )}

                {isEmailValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('email_otp');
                      setErrorBanner(null);
                    }}
                    className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
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
                  className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                    verifyChannel === 'totp'
                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Authenticator</span>
                </button>
              </div>

              {/* MOBILE SMS OTP TAB */}
              {verifyChannel === 'phone_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white">
                        Enter 6-Digit SMS Code
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Check your text messages on {fullPhoneDisplay}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isSendingOtp}
                        onClick={() => dispatchMobileOtp()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 shrink-0"
                      >
                        {isSendingOtp ? 'Sending...' : 'Resend SMS'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGatewayConfig((v) => !v)}
                        className="px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400 hover:text-white"
                      >
                        SMS Setup
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
                    className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-base text-white font-mono tracking-[0.4em] text-center focus:outline-none focus:border-emerald-500"
                  />

                  {!externalGatewayDelivered && (
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-300">
                      <span>Didn&apos;t get the SMS?</span>
                      <button
                        type="button"
                        onClick={() => setVerifyChannel('totp')}
                        className="text-emerald-300 hover:text-emerald-200 font-bold underline shrink-0"
                      >
                        Use Google Authenticator →
                      </button>
                    </div>
                  )}
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
                        Check your email inbox at {cleanEmail}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isSendingOtp}
                        onClick={() => dispatchEmailOtp()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-cyan-300 shrink-0"
                      >
                        {isSendingOtp ? 'Sending...' : 'Resend Email'}
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
                      <span>Verify Instantly with Google</span>
                    </button>
                  )}
                </div>
              )}

              {/* AUTHENTICATOR APP TAB (Google Authenticator / RFC 6238 TOTP) */}
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
                          ? 'Add this key to Google Authenticator, then enter the 6-digit code.'
                          : 'Open Google Authenticator and enter the current 6-digit code for Simple.'}
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
                        <code className="text-xs font-mono font-bold text-emerald-300 break-all select-all">
                          {totpSecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(totpSecret).catch(() => {});
                            }
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

              {/* Optional SMS / Email Gateway Configuration */}
              {showGatewayConfig && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      SMS &amp; Email Gateway Settings
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={twoFactorApiKey}
                      onChange={(e) => setTwoFactorApiKey(e.target.value)}
                      placeholder="2Factor.in API Key (Instant OTP)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={fast2smsApiKey}
                      onChange={(e) => setFast2smsApiKey(e.target.value)}
                      placeholder="Fast2SMS API Key (India SMS)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={textbeltApiKey}
                      onChange={(e) => setTextbeltApiKey(e.target.value)}
                      placeholder="Textbelt SMS Key (Global SMS)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={firebaseApiKeyInput}
                      onChange={(e) => setFirebaseApiKeyInput(e.target.value)}
                      placeholder="Firebase Web API Key (Custom Project)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      placeholder="Twilio Account SID"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      placeholder="Twilio Auth Token"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={twilioPhoneNumber}
                      onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                      placeholder="Twilio Phone (+1...)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <input
                    type="password"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="Resend API Key (re_... for Email OTP)"
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                  />
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
                      placeholder="SMTP Email (e.g. Gmail)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="SMTP App Password"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isSavingGateway}
                    onClick={handleSaveGatewayConfig}
                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    {isSavingGateway ? 'Saving...' : 'Save Gateway Settings'}
                  </button>
                </div>
              )}

              {gatewayFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
                  {gatewayFeedback}
                </div>
              )}

              {otpSentMessage && (
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
                    <span>Opening chats...</span>
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
