import React, { useEffect, useRef, useState } from 'react';
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [onboardingMode, setOnboardingMode] = useState<'register' | 'login'>('register');

  // Account Identity Mode: 'phone' (Phone Only), 'email' (Gmail/Google Only), or 'both' (Phone + Gmail)
  const [identityMode, setIdentityMode] = useState<'phone' | 'email' | 'both'>(() => {
    if (account.phone && account.email) return 'both';
    if (account.email && !account.phone) return 'email';
    return 'phone';
  });

  // Primary Verification Channel is Google Authenticator (RFC 6238 TOTP backed by Firebase Firestore)
  const [verifyChannel, setVerifyChannel] = useState<
    'totp' | 'phone_otp' | 'email_otp' | 'google_oauth'
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
  const [about, setAbout] = useState(
    account.about || 'Hey there! I am using Simple Messenger.'
  );
  const [avatarColor, setAvatarColor] = useState(account.avatarColor || '#10B981');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    account.avatarUrl || PRESET_PROFILE_PHOTOS[0].url
  );

  // Verification State (Zero dummy OTPs, zero 2-step PIN loophole)
  const [otpInput, setOtpInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string>('');
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [verifiedIdentifier, setVerifiedIdentifier] = useState<string>('');

  // Google Authenticator TOTP State (RFC 6238 + Firebase Firestore Database)
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [totpUri, setTotpUri] = useState<string>('');
  const [isGeneratingTotp, setIsGeneratingTotp] = useState(false);
  const [copiedTotpSecret, setCopiedTotpSecret] = useState(false);

  // Real Firebase Phone Auth Confirmation Result
  const [firebaseSmsConfirmation, setFirebaseSmsConfirmation] =
    useState<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

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

  const isVerifiedForProceeding = Boolean(
    verificationToken && (phoneVerified || emailVerified)
  );

  // Check Gateway Status on Mount
  useEffect(() => {
    apiFetch('/api/auth/gateway-status')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ok) {
          setGatewayStatus({
            smtpConfigured: Boolean(data.smtpConfigured),
            smtpUserMasked: data.smtpUserMasked || null,
            smsGatewayConfigured: Boolean(
              data.smsGatewayConfigured || data.smsConfigured
            ),
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
      const res = await apiFetch('/api/auth/configure-gateway', {
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
          'Live SMTP / SMS Gateway verified and active! You can now dispatch real OTP codes.'
        );
        setShowGatewayConfig(false);
      }
    } catch {
      setErrorBanner('Could not reach backend server to configure gateway.');
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Validate Step 1 and Store/Check Challenge in Firebase Firestore Database
  const handleProceedToVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);
    setVerificationToken('');
    setPhoneVerified(false);
    setEmailVerified(false);

    if (identityMode === 'phone' && !rawPhoneValid) {
      setErrorBanner('Please enter a valid mobile phone number to continue.');
      return;
    }
    if (identityMode === 'email' && !rawEmailValid) {
      setErrorBanner('Please enter a valid Gmail or email address to continue.');
      return;
    }
    if (identityMode === 'both' && (!rawPhoneValid || !rawEmailValid)) {
      setErrorBanner(
        'Please enter both a valid mobile phone number and a valid Gmail/email address (or select "Phone Only" / "Gmail Only" above).'
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
          'Please create an Account Password (at least 6 characters) to protect your account.'
        );
        return;
      }
      if (accountPassword !== confirmPassword) {
        setErrorBanner('Account Password and Confirm Password do not match.');
        return;
      }
    } else {
      if (!accountPassword || accountPassword.length < 6) {
        setErrorBanner('Please enter your Account Password to sign in.');
        return;
      }
    }

    setIsSendingOtp(true);
    try {
      const pwdHash = sha256HexSync(accountPassword.trim());

      // 1. Check account existence and credentials in Firebase Firestore Database
      const checkData = await checkAccountInDatabase({
        phone: isPhoneValid ? normalizedPhoneDigits : undefined,
        email: isEmailValid ? cleanEmail : undefined,
        username: username.trim().replace(/^@/, ''),
        mode: onboardingMode,
        passwordHash: pwdHash,
      });

      if (onboardingMode === 'register' && checkData.exists) {
        setErrorBanner(
          `This ${checkData.matchedBy || 'account'} is already registered in the Simple Firebase Database${
            checkData.accountSummary?.username
              ? ` (@${checkData.accountSummary.username})`
              : ''
          }. Nobody can create a new account using someone else's registered ${
            checkData.matchedBy || 'details'
          }. Please tap "Sign In (Existing)" above.`
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && !checkData.exists) {
        setErrorBanner(
          'No registered Simple account was found with this mobile number or Gmail address in the Firebase Database. Please check your details or tap "Create New Account".'
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && checkData.exists) {
        if (checkData.passwordHash && checkData.passwordHash !== pwdHash) {
          setErrorBanner(
            'Incorrect Account Password for this Simple account. Please enter the exact password registered to this account.'
          );
          setIsSendingOtp(false);
          return;
        }
        // Never expose totpSecret on the client UI during login!
        setTotpSecret('');
        setTotpUri('');
      }

      // 2. If creating a new account, generate RFC 6238 Google Authenticator Secret and save pending challenge to Firebase Firestore Database
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
        const uri = `otpauth://totp/SimpleMessenger:${encodeURIComponent(
          label
        )}?secret=${activeSecret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;

        setTotpSecret(activeSecret);
        setTotpUri(uri);

        // Save pending challenge to Firebase Firestore Database (`account_backups`)
        await createPendingFirestoreAuthenticatorChallenge({
          uid: deterministicUid,
          username: cleanHandle,
          name: name.trim(),
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          totpSecret: activeSecret,
        });
      }

      setVerifyChannel('totp');
      setOtpInput('');
      setStep(2);
    } catch {
      setErrorBanner(
        'Could not reach Firebase Database to verify account status. Please check your internet connection.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Regenerate Google Authenticator Secret during Registration & Update Firebase Firestore Challenge
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
      const uri = `otpauth://totp/SimpleMessenger:${encodeURIComponent(
        label
      )}?secret=${secret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;

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

  // Dispatch Real Firebase Phone Auth SMS (`signInWithPhoneNumber`) or Carrier SMS Gateway OTP
  const handleSendPhoneSmsOtp = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (!isPhoneValid || !e164Phone) {
      setErrorBanner('Please enter a valid mobile phone number in Step 1 first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      // 1. First attempt official Firebase Phone Authentication SMS (`signInWithPhoneNumber`) if supported in current environment
      if (!isAndroidApkEnvironment() && recaptchaContainerRef.current) {
        try {
          if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(
              auth,
              recaptchaContainerRef.current,
              { size: 'invisible' }
            );
          }
          const confirmation = await signInWithPhoneNumber(
            auth,
            e164Phone,
            recaptchaVerifierRef.current
          );
          setFirebaseSmsConfirmation(confirmation);
          setOtpSentMessage(
            `Firebase Authentication has dispatched a real 6-digit SMS verification code to ${fullPhoneDisplay}.`
          );
          setIsSendingOtp(false);
          return;
        } catch {
          // Fall through to backend Carrier SMS Gateway if Firebase Phone Auth SMS is not enabled on this Firebase project
        }
      }

      // 2. Attempt Backend Carrier SMS Gateway (`/api/auth/request-otp`)
      const pwdHash = sha256HexSync(accountPassword.trim());
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: normalizedPhoneDigits,
          target: normalizedPhoneDigits,
          channel: 'phone',
          mode: onboardingMode,
          passwordHash: pwdHash,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorBanner(
          'External Carrier SMS billing (Firebase Blaze / Twilio / Fast2SMS) is not enabled on this project. Please use the primary "Google Authenticator (OTP)" tab on the left to verify your account with our Firebase Database immediately!'
        );
        return;
      }

      setOtpSentMessage(
        data.message ||
          `A real 6-digit SMS OTP has been dispatched to ${fullPhoneDisplay}.`
      );
    } catch {
      setErrorBanner(
        'SMS gateway unavailable. Please use the primary "Google Authenticator (OTP)" tab to verify with our Firebase Database.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Dispatch Real SMTP Email OTP
  const handleSendEmailOtp = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (!isEmailValid) {
      setErrorBanner('Please enter a valid Gmail/email address in Step 1 first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const pwdHash = sha256HexSync(accountPassword.trim());
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
        if (data.requiresGatewayConfig) {
          setShowGatewayConfig(true);
        }
        setErrorBanner(
          data.error ||
            'SMTP Email Gateway is not configured yet. Configure your Gmail App Password below, or use the primary "Google Authenticator (OTP)" tab to verify your account immediately!'
        );
        return;
      }

      setOtpSentMessage(
        data.message || `A real 6-digit verification code has been sent to ${cleanEmail}.`
      );
    } catch {
      setErrorBanner(
        'Failed to contact Email OTP gateway. Please use the primary "Google Authenticator (OTP)" tab.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Real Google OAuth Sign-In Verification
  const handleGoogleOAuthVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (isAndroidApkEnvironment()) {
      setErrorBanner(
        'Android WebView restricts browser OAuth popups on file:// origins. Please use the primary "Google Authenticator (OTP)" tab to verify your account with our Firebase Database!'
      );
      setVerifyChannel('totp');
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
          `Google Sign-In verified "${verifiedGmail}", which does not match "${cleanEmail}".`
        );
        setIsVerifyingOtp(false);
        return;
      }

      const vToken = createVerificationToken(verifiedGmail || cleanEmail);
      const pwdHash = sha256HexSync(accountPassword.trim());

      if (onboardingMode === 'login') {
        const recovered = await recoverCloudAccountBackup({
          email: verifiedGmail,
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          passwordHash: pwdHash,
          verificationToken: vToken,
        });

        if (!recovered) {
          setErrorBanner(
            'Google identity verified, but your Account Password did not match the existing account in the Firebase Database.'
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
          `Verified ${verifiedGmail} via Google OAuth & restored your encrypted account from Firebase Database!`
        );
      } else {
        if (!name.trim() && result.user.displayName) {
          setName(result.user.displayName);
        }
      }

      setEmail(verifiedGmail);
      setEmailVerified(true);
      if (isPhoneValid) setPhoneVerified(true);
      setVerificationToken(vToken);
      setVerifiedIdentifier(verifiedGmail);
      setOtpSentMessage(`Google Account (${verifiedGmail}) cryptographically verified!`);
    } catch {
      setErrorBanner(
        'Google OAuth popup was blocked or closed. Please use the primary "Google Authenticator (OTP)" tab to verify with our Firebase Database.'
      );
      setVerifyChannel('totp');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Verify 6-Digit OTP Code (Primary: Google Authenticator via Firebase Firestore Database; Secondary: Firebase SMS / SMTP OTP)
  const handleVerifyCode = async () => {
    setErrorBanner(null);
    const cleanCode = otpInput.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorBanner('Please enter the 6-digit verification code.');
      return;
    }

    const activeChannel: 'email' | 'phone' =
      identityMode === 'email'
        ? 'email'
        : identityMode === 'phone'
        ? 'phone'
        : verifyChannel === 'email_otp' || verifyChannel === 'google_oauth'
        ? 'email'
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

      // 1. PRIMARY: Google Authenticator (RFC 6238 TOTP) verified directly against Firebase Firestore Database
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
              'Invalid 6-digit Google Authenticator OTP code. Please open Google Authenticator and enter the current 6-digit code for SimpleMessenger.'
          );
          setIsVerifyingOtp(false);
          return;
        }

        if (totpResult.totpSecret) {
          setTotpSecret(totpResult.totpSecret);
        }

        if (onboardingMode === 'login' && totpResult.recoveredBundle) {
          const recovered = totpResult.recoveredBundle;
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
            `Verified Google Authenticator OTP & Password against Firebase Database! Restored account @${
              recovered.account?.username || username || 'user'
            }.`
          );
        }

        setVerificationToken(totpResult.verificationToken);
        setVerifiedIdentifier(identifier);
        if (isPhoneValid) setPhoneVerified(true);
        if (isEmailValid) setEmailVerified(true);
        setOtpSentMessage(
          'Google Authenticator 6-digit OTP verified with Firebase Firestore Database!'
        );
        setIsVerifyingOtp(false);
        return;
      }

      // 2. SECONDARY: Firebase Phone Auth SMS ConfirmationResult (`signInWithPhoneNumber`)
      if (verifyChannel === 'phone_otp' && firebaseSmsConfirmation) {
        try {
          await firebaseSmsConfirmation.confirm(cleanCode);
          const vToken = createVerificationToken(identifier);
          setVerificationToken(vToken);
          setVerifiedIdentifier(identifier);
          setPhoneVerified(true);
          if (isEmailValid) setEmailVerified(true);
          setOtpSentMessage(
            `Phone number ${fullPhoneDisplay} verified via Firebase SMS Authentication!`
          );
          setIsVerifyingOtp(false);
          return;
        } catch {
          setErrorBanner('Invalid Firebase SMS verification code. Please check your SMS and try again.');
          setIsVerifyingOtp(false);
          return;
        }
      }

      // 3. SECONDARY: Backend Carrier SMS / Live SMTP Email OTP (`/api/auth/verify-otp`)
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
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorBanner(
          data.error ||
            'Invalid or expired 6-digit OTP code. Please check your code or use the primary Google Authenticator (OTP) tab.'
        );
        setIsVerifyingOtp(false);
        return;
      }

      const issuedToken = data.verificationToken || createVerificationToken(identifier);

      if (onboardingMode === 'login') {
        const recovered = await recoverCloudAccountBackup({
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          verificationToken: issuedToken,
        });

        if (!recovered) {
          setErrorBanner(
            'OTP verified, but your Account Password did not match the existing account in the Firebase Database.'
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
          `Verified & restored your existing Simple account (@${
            recovered.account?.username || username || 'user'
          }) from the Firebase Database!`
        );
      }

      setVerificationToken(issuedToken);
      setVerifiedIdentifier(identifier);
      if (isPhoneValid) setPhoneVerified(true);
      if (isEmailValid) setEmailVerified(true);
      setOtpSentMessage('6-digit OTP verified with Firebase Database!');
    } catch {
      setErrorBanner('Verification encountered an error. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Finalize Account Creation or Sign-In & Save Directly to Firebase Firestore Database
  const handleFinish = async () => {
    if (!isVerifiedForProceeding || !verificationToken) {
      setErrorBanner('You must complete OTP verification before continuing.');
      return;
    }

    setIsSavingAccount(true);
    try {
      const cleanName = (recoveredAccountData?.name || name).trim() || 'Simple User';
      const fallbackSuffix =
        normalizedPhoneDigits.slice(-4) ||
        cleanEmail.slice(0, 4).replace(/[^a-z0-9]/g, '') ||
        '1001';
      const cleanHandle =
        (recoveredAccountData?.username || username)
          .trim()
          .toLowerCase()
          .replace(/^@/, '')
          .replace(/[^a-z0-9._]/g, '') ||
        cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') ||
        `user.${fallbackSuffix}`;

      const deterministicUid =
        recoveredAccountData?.id ||
        (isPhoneValid && normalizedPhoneDigits.length >= 7
          ? deriveUidFromPhone(normalizedPhoneDigits)
          : deriveUidFromEmail(cleanEmail));

      const pwdHash = accountPassword
        ? sha256HexSync(accountPassword.trim())
        : recoveredAccountData?.passwordHash;

      const finalPhone = isPhoneValid
        ? fullPhoneDisplay
        : recoveredAccountData?.phone || '';
      const finalNormPhone = isPhoneValid
        ? normalizedPhoneDigits
        : recoveredAccountData?.normalizedPhone || '';
      const finalEmail = isEmailValid
        ? cleanEmail
        : recoveredAccountData?.email || '';

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
        phoneVerified: Boolean(isPhoneValid || recoveredAccountData?.phoneVerified),
        emailVerified: Boolean(isEmailValid || recoveredAccountData?.emailVerified),
        passwordHash: pwdHash,
        totpSecret: totpSecret || recoveredAccountData?.totpSecret,
        verificationToken,
        about: about.trim() || 'Available on Simple E2EE',
        avatarColor,
        avatarUrl,
        allowUsernameDiscovery,
        hidePhoneNumber,
        onboardingCompleted: true,
        cloudBackupGmail: finalEmail || undefined,
      };

      // 1. Immediately persist verified account credentials & backup to Firebase Firestore Database
      const backupPayload = JSON.stringify({
        version: '5.0.0',
        totpVerified: true,
        onboardingCompleted: true,
        exportedAt: Date.now(),
        account: finalAccount,
        passwordHash: pwdHash,
        totpSecret: finalAccount.totpSecret,
        chats: restoredChats || [],
      });

      await saveCloudAccountBackup({
        uid: finalAccount.id,
        username: finalAccount.username,
        phone: finalNormPhone || undefined,
        email: finalEmail || undefined,
        phoneHash: finalNormPhone ? computePhoneHash(finalNormPhone) : undefined,
        emailHash: finalEmail ? computeEmailHash(finalEmail) : undefined,
        passwordHash: pwdHash,
        totpSecret: finalAccount.totpSecret,
        verificationToken,
        backupJson: backupPayload,
      });

      // 2. Register user in Firebase Firestore `directory` and `phone_index` for real contact discovery
      try {
        const phoneHash = finalNormPhone ? computePhoneHash(finalNormPhone) : '';
        const phoneTailHash = finalNormPhone ? computePhoneTailHash(finalNormPhone) : '';
        const emailHash = finalEmail ? computeEmailHash(finalEmail) : '';
        const dirPayload: Record<string, any> = {
          uid: finalAccount.id,
          name: finalAccount.name.slice(0, 80),
          username: finalAccount.username.slice(0, 40),
          phone: finalPhone ? maskPhoneForFirestore(finalPhone) : 'Gmail Account',
          normalizedPhone: finalNormPhone
            ? finalNormPhone.slice(-2).padStart(finalNormPhone.length, '0')
            : '0000000000',
          about: (finalAccount.about || 'Available on Simple').slice(0, 160),
          avatarColor: finalAccount.avatarColor || '#10B981',
          identityFingerprint: localFingerprint || 'E2EE-VERIFIED',
          allowUsernameDiscovery: Boolean(finalAccount.allowUsernameDiscovery),
          hidePhoneNumber: Boolean(finalAccount.hidePhoneNumber),
          isOnline: true,
          lastSeen: Date.now(),
          updatedAt: Date.now(),
        };
        if (phoneHash) dirPayload.phoneHash = phoneHash;
        if (phoneTailHash) dirPayload.phoneTailHash = phoneTailHash;
        if (emailHash) dirPayload.emailHash = emailHash;

        await setDoc(doc(db, 'directory', finalAccount.id), dirPayload);
        if (phoneHash && phoneTailHash) {
          await setDoc(doc(db, 'phone_index', phoneHash), {
            phoneHash,
            phoneTailHash,
            targetUid: finalAccount.id,
            username: finalAccount.username.slice(0, 40),
            name: finalAccount.name.slice(0, 80),
            avatarColor: finalAccount.avatarColor || '#10B981',
            identityFingerprint: localFingerprint || 'E2EE-VERIFIED',
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Offline fallback handled
      }

      onComplete(
        finalAccount,
        {
          appLockEnabled,
          contactsPermissionGranted: contactsPermission,
          notificationsPermissionGranted: notificationsPermission,
          backupMode,
        },
        restoredChats
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-950/95 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div ref={recaptchaContainerRef} className="hidden" />
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[96dvh] flex flex-col">
        {/* Top Header */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {onboardingMode === 'register'
                  ? 'Create Verified Simple Account'
                  : 'Sign In to Simple Account'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Google Authenticator &amp; Firebase Database OTP Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {[1, 2, 3].map((s) => (
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

        {/* Main Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error Banner */}
          {errorBanner && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
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

          {/* STEP 1: ACCOUNT CREDENTIALS & IDENTITY */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Mode Switcher: Register New vs Login Existing */}
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
                      ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Sign In (Existing)</span>
                </button>
              </div>

              {/* Account Identity Option Selector: Phone Only | Gmail Only | Both */}
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {onboardingMode === 'register'
                    ? 'Choose Account Creation Method'
                    : 'Choose Sign-In Method'}
                </label>
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
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Phone Only</span>
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
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Gmail Only</span>
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
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Phone + Gmail</span>
                  </button>
                </div>
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
                          Full Display Name *
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Dr. M Verma"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Unique @username Handle
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

                  {/* Quick Avatar Picker */}
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

              {/* Phone & Email Inputs (Conditionally shown based on identityMode) */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                {usePhoneField && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Mobile Phone Number *
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
                      Gmail / Email Address *
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

              {/* Account Password (SHA-256 Protected in Firebase Database) */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {onboardingMode === 'register'
                        ? 'Create Account Password'
                        : 'Enter Your Account Password'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/80">
                    SHA-256 + TOTP Protected
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
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Account Password *
                    </label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {onboardingMode === 'register' && (
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">
                        Confirm Password *
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-400">
                  {onboardingMode === 'register'
                    ? 'Next step: Link Google Authenticator (RFC 6238 OTP) with our Firebase Database so nobody can ever misuse or access your account.'
                    : 'Next step: Enter the live 6-digit OTP from your linked Google Authenticator app to verify ownership with our Firebase Database.'}
                </p>
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
                    <span>Verifying with Firebase Database...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Continue to Google Authenticator / OTP Verification →</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: PRIMARY GOOGLE AUTHENTICATOR & FIREBASE DATABASE OTP VERIFICATION */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Step 2 · Firebase Database OTP Verification
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-[11px] text-slate-400 hover:text-white underline"
                  >
                    ← Edit Details
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Verifying ownership for{' '}
                  <strong className="text-white font-mono">
                    {isPhoneValid && isEmailValid
                      ? `${fullPhoneDisplay} & ${cleanEmail}`
                      : isPhoneValid
                      ? fullPhoneDisplay
                      : cleanEmail}
                  </strong>
                  .
                </p>
              </div>

              {/* Verification Method Selector Tabs (Google Authenticator Primary; no 2-step PIN loophole) */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setVerifyChannel('totp');
                    setErrorBanner(null);
                  }}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                    verifyChannel === 'totp'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Google Authenticator</span>
                </button>

                {isPhoneValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('phone_otp');
                      setErrorBanner(null);
                    }}
                    className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'phone_otp'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>Firebase SMS OTP</span>
                  </button>
                )}

                {isEmailValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('email_otp');
                      setErrorBanner(null);
                    }}
                    className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'email_otp'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Gmail / SMTP OTP</span>
                  </button>
                )}
              </div>

              {/* PRIMARY CHANNEL: GOOGLE AUTHENTICATOR (RFC 6238 TOTP + FIREBASE FIRESTORE DATABASE) */}
              {verifyChannel === 'totp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/40 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                        Primary · Firebase Database Bound
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4 text-emerald-400" />
                        <span>
                          {onboardingMode === 'register'
                            ? 'Link Google Authenticator & Verify 6-Digit OTP'
                            : 'Enter 6-Digit OTP from Your Google Authenticator'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {onboardingMode === 'register'
                          ? 'Your unique cryptographic key has been registered in our Firebase Database. Add it to Google Authenticator below, then enter the live 6-digit OTP code generated by Google Authenticator.'
                          : 'For security, your authenticator setup key is hidden during sign-in. Open your Google Authenticator app and enter the current 6-digit rolling OTP code for SimpleMessenger.'}
                      </p>
                    </div>
                    {onboardingMode === 'register' && (
                      <button
                        type="button"
                        disabled={isGeneratingTotp}
                        onClick={handleGenerateTotpSecret}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 shrink-0"
                      >
                        Rotate Key
                      </button>
                    )}
                  </div>

                  {/* Setup Key & 1-Tap Launch Link ONLY shown during new account creation */}
                  {onboardingMode === 'register' && totpSecret && (
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                      {totpUri && (
                        <a
                          href={totpUri}
                          className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Step A: 1-Tap Add to Google Authenticator App</span>
                        </a>
                      )}

                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Or Copy Base32 Setup Key into Google Authenticator:
                        </div>
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
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
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1 shrink-0"
                          >
                            {copiedTotpSecret ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Key</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      {onboardingMode === 'register'
                        ? 'Step B: Enter 6-Digit Rolling OTP from Google Authenticator:'
                        : 'Enter Current 6-Digit Rolling OTP from Google Authenticator:'}
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
                        placeholder="000000"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.35em] text-center focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={isVerifyingOtp || otpInput.length !== 6}
                        onClick={handleVerifyCode}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                      >
                        {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECONDARY CHANNEL: FIREBASE / CARRIER PHONE SMS OTP */}
              {verifyChannel === 'phone_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Phone className="w-4 h-4 text-amber-400" />
                        <span>Firebase / Carrier SMS OTP ({fullPhoneDisplay})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dispatches a 6-digit SMS code via Firebase Phone Auth or Carrier SMS Gateway.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig((v) => !v)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-amber-300 shrink-0"
                    >
                      {gatewayStatus.smsGatewayConfigured
                        ? 'SMS Active'
                        : 'Configure SMS API'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isSendingOtp || !isPhoneValid}
                    onClick={handleSendPhoneSmsOtp}
                    className="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>
                      {isSendingOtp
                        ? 'Dispatching SMS OTP...'
                        : `Send 6-Digit SMS OTP to ${fullPhoneDisplay}`}
                    </span>
                  </button>

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) =>
                        setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="6-digit SMS OTP"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.3em] text-center focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={isVerifyingOtp || otpInput.length !== 6}
                      onClick={handleVerifyCode}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                    >
                      Verify SMS
                    </button>
                  </div>
                </div>
              )}

              {/* SECONDARY CHANNEL: LIVE SMTP EMAIL OTP / GOOGLE SIGN-IN */}
              {verifyChannel === 'email_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-cyan-400" />
                        <span>Real Gmail / SMTP Email OTP ({cleanEmail})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dispatches a real 6-digit verification code to your email inbox via SMTP.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig((v) => !v)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-cyan-300 shrink-0"
                    >
                      {gatewayStatus.smtpConfigured ? 'SMTP Active' : 'Configure SMTP'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isSendingOtp || !isEmailValid}
                    onClick={handleSendEmailOtp}
                    className="w-full py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>
                      {isSendingOtp
                        ? 'Dispatching Email via SMTP...'
                        : `Send Real 6-Digit OTP to ${cleanEmail}`}
                    </span>
                  </button>

                  {!isAndroidApkEnvironment() && (
                    <button
                      type="button"
                      disabled={isVerifyingOtp}
                      onClick={handleGoogleOAuthVerification}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                      <span>Or Verify Instantly via Official Google Sign-In</span>
                    </button>
                  )}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) =>
                        setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="6-digit Email OTP"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.3em] text-center focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      disabled={isVerifyingOtp || otpInput.length !== 6}
                      onClick={handleVerifyCode}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                    >
                      Verify Email
                    </button>
                  </div>
                </div>
              )}

              {/* Expandable Live SMTP / SMS Gateway Configuration Panel */}
              {showGatewayConfig && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      Configure Live SMTP Email / Carrier SMS Gateway
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Enter a Gmail App Password (16-character Google App Password) for real SMTP email delivery, or a Carrier SMS Webhook URL.
                  </p>
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
                      placeholder="SMTP Gmail (you@gmail.com)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="16-char Gmail App Password"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="url"
                      value={smsWebhookUrl}
                      onChange={(e) => setSmsWebhookUrl(e.target.value)}
                      placeholder="SMS Gateway Webhook URL (optional)"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="password"
                      value={smsWebhookApiKey}
                      onChange={(e) => setSmsWebhookApiKey(e.target.value)}
                      placeholder="SMS API Key / Bearer Token"
                      className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isSavingGateway}
                    onClick={handleSaveGatewayConfig}
                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    {isSavingGateway ? 'Verifying Gateway...' : 'Save & Activate Live Gateway'}
                  </button>
                </div>
              )}

              {gatewayFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
                  {gatewayFeedback}
                </div>
              )}

              {/* Verification Status Banner */}
              {otpSentMessage && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-start gap-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">{otpSentMessage}</div>
                </div>
              )}

              {recoveryNotice && (
                <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-start gap-2.5 text-xs text-cyan-200">
                  <CloudUpload className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex-1">{recoveryNotice}</div>
                </div>
              )}

              {/* Continue to Step 3 Button (Enabled ONLY when cryptographically verified) */}
              <button
                type="button"
                disabled={!isVerifiedForProceeding}
                onClick={() => setStep(3)}
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isVerifiedForProceeding
                    ? `OTP Verified (${verifiedIdentifier || 'OK'}) · Continue →`
                    : 'Complete Google Authenticator / OTP Verification Above'}
                </span>
              </button>
            </div>
          )}

          {/* STEP 3: PRIVACY, PERMISSIONS & FINALIZE */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-100">
                  <div className="font-bold">
                    Account Ownership Verified via Firebase Database OTP
                  </div>
                  <div className="text-[11px] text-emerald-300/80 font-mono mt-0.5">
                    Token: {verificationToken.slice(0, 18)}…
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Sync Contacts for Messenger Discovery
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Find saved phone contacts who already use Simple
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={contactsPermission}
                    onChange={(e) => setContactsPermission(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Allow @username Directory Search
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Let contacts find you by @{username || 'username'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowUsernameDiscovery}
                    onChange={(e) => setAllowUsernameDiscovery(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Encrypted Cloud Account Backup
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Automatically back up account &amp; chats protected by your Password &amp; Google Authenticator OTP
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={backupMode === 'cloud_e2ee'}
                    onChange={(e) =>
                      setBackupMode(e.target.checked ? 'cloud_e2ee' : 'local_device')
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={isSavingAccount}
                  onClick={handleFinish}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {isSavingAccount ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Account to Firebase Database...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {onboardingMode === 'login'
                          ? 'Complete Sign-In & Open Chats'
                          : 'Save Account to Database & Open Chats'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
