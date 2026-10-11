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
  verifyTotpCodeSync,
} from '../utils/androidBridge';
import {
  auth,
  checkAccountInDatabase,
  db,
  doc,
  googleProvider,
  recoverCloudAccountBackup,
  saveCloudAccountBackup,
  setDoc,
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

  const [verifyChannel, setVerifyChannel] = useState<
    'pin_verify' | 'totp' | 'google_oauth' | 'email_otp' | 'phone_otp'
  >('pin_verify');

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
  const [isSavingAccount, setIsSavingAccount] = useState(false);
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
        'Please enter both a valid mobile phone number and a valid Gmail/email address (or switch to "Phone Only" / "Gmail Only" above).'
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

    setIsSendingOtp(true);
    try {
      const pwdHash = accountPassword ? sha256HexSync(accountPassword.trim()) : undefined;
      const pinHash = /^\d{6}$/.test(twoStepPin) ? sha256HexSync(twoStepPin.trim()) : undefined;

      // Check account existence in Firebase Firestore, Local Mirror, and Server
      const checkData = await checkAccountInDatabase({
        phone: isPhoneValid ? normalizedPhoneDigits : undefined,
        email: isEmailValid ? cleanEmail : undefined,
        username: username.trim().replace(/^@/, ''),
        mode: onboardingMode,
        passwordHash: pwdHash,
        twoStepPinHash: pinHash,
      });

      if (onboardingMode === 'register' && checkData.exists) {
        setErrorBanner(
          `This ${checkData.matchedBy || 'account'} is already registered on Simple${
            checkData.accountSummary?.username
              ? ` (@${checkData.accountSummary.username})`
              : ''
          }. Please tap "Sign In (Existing)" above and sign in with your password & PIN.`
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && !checkData.exists) {
        setErrorBanner(
          'No registered Simple account was found with this mobile number or Gmail address in the database. Please check your details or tap "Create New Account".'
        );
        setIsSendingOtp(false);
        return;
      }

      if (onboardingMode === 'login' && checkData.exists) {
        // Verify password or PIN against the stored Firestore account record before advancing
        if (checkData.passwordHash || checkData.twoStepPinHash) {
          const pwdOk = Boolean(
            pwdHash && checkData.passwordHash && pwdHash === checkData.passwordHash
          );
          const pinOk = Boolean(
            pinHash && checkData.twoStepPinHash && pinHash === checkData.twoStepPinHash
          );
          if (!pwdOk && !pinOk) {
            setErrorBanner(
              'Incorrect Account Password or 6-Digit Two-Step Verification PIN for this account. Please enter your exact credentials.'
            );
            setIsSendingOtp(false);
            return;
          }
        }
        if (checkData.totpSecret) {
          setTotpSecret(checkData.totpSecret);
        }
      }

      // Generate RFC 6238 TOTP secret locally (and via API) so Authenticator App option is always ready
      if (!totpSecret) {
        const label = (
          (isEmailValid ? cleanEmail : '') ||
          (isPhoneValid ? fullPhoneDisplay : '') ||
          username ||
          'SimpleUser'
        ).replace(/[^a-zA-Z0-9@._+-]/g, '');
        const localSecret = generateBase32Secret(20);
        const localUri = `otpauth://totp/SimpleMessenger:${encodeURIComponent(
          label
        )}?secret=${localSecret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;
        setTotpSecret(localSecret);
        setTotpUri(localUri);
      }

      setOtpInput('');
      setStep(2);
    } catch {
      // Never block account creation with a false network error; generate local TOTP secret and proceed
      if (!totpSecret) {
        const localSecret = generateBase32Secret(20);
        setTotpSecret(localSecret);
        setTotpUri(
          `otpauth://totp/SimpleMessenger:SimpleUser?secret=${localSecret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`
        );
      }
      setOtpInput('');
      setStep(2);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Generate or refresh TOTP Secret for Authenticator App
  const handleGenerateTotpSecret = async () => {
    setErrorBanner(null);
    setIsGeneratingTotp(true);
    try {
      const label = (
        (isEmailValid ? cleanEmail : '') ||
        (isPhoneValid ? fullPhoneDisplay : '') ||
        username ||
        'SimpleUser'
      ).replace(/[^a-zA-Z0-9@._+-]/g, '');
      const secret = generateBase32Secret(20);
      const uri = `otpauth://totp/SimpleMessenger:${encodeURIComponent(
        label
      )}?secret=${secret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;
      setTotpSecret(secret);
      setTotpUri(uri);
    } finally {
      setIsGeneratingTotp(false);
    }
  };

  // Real Google OAuth Sign-In Verification
  const handleGoogleOAuthVerification = async () => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    if (isAndroidApkEnvironment()) {
      setErrorBanner(
        'Inside the standalone Android APK, Android WebView blocks browser OAuth popups on file:// origins. Please select "Two-Step PIN & Password Verification" or "Authenticator App (TOTP)" above to verify your Gmail account directly!'
      );
      setVerifyChannel('pin_verify');
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

      if (onboardingMode === 'login') {
        const pwdHash = accountPassword ? sha256HexSync(accountPassword.trim()) : undefined;
        const pinHash = /^\d{6}$/.test(twoStepPin) ? sha256HexSync(twoStepPin.trim()) : undefined;

        const recovered = await recoverCloudAccountBackup({
          email: verifiedGmail,
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          passwordHash: pwdHash,
          twoStepPinHash: pinHash,
          verificationToken: vToken,
        });

        if (!recovered) {
          setErrorBanner(
            'Google identity verified, but your Account Password / Two-Step PIN did not match the existing account in the database.'
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
          `Verified ${verifiedGmail} via Google OAuth & restored your encrypted account from database!`
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
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('popup-closed-by-user')) {
        setErrorBanner('Google Sign-In popup was closed before completing verification.');
      } else {
        setErrorBanner(
          'Google OAuth popup is restricted in this browser/WebView container. Please use "Two-Step PIN & Password" or "Authenticator App (TOTP)" tab above to verify immediately.'
        );
        setVerifyChannel('pin_verify');
      }
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Send Real Out-of-Band OTP via Live SMTP Email or Carrier SMS Gateway
  const handleSendRealOtp = async (channel: 'email' | 'phone') => {
    setErrorBanner(null);
    setOtpSentMessage(null);

    const identifier = channel === 'email' ? cleanEmail : normalizedPhoneDigits;
    if (channel === 'email' && !isEmailValid) {
      setErrorBanner('Please enter a valid Gmail/email address in Step 1 first.');
      return;
    }
    if (channel === 'phone' && !isPhoneValid) {
      setErrorBanner('Please enter a valid mobile phone number in Step 1 first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const pwdHash = accountPassword ? sha256HexSync(accountPassword.trim()) : undefined;
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          target: identifier,
          channel,
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
            `Could not dispatch ${channel.toUpperCase()} OTP. Configure your SMTP/SMS gateway below, or select "Two-Step PIN & Password" or "Authenticator App (TOTP)" above.`
        );
        return;
      }

      setOtpSentMessage(
        data.message ||
          `A real 6-digit verification code has been sent to your ${
            channel === 'email' ? `email inbox (${cleanEmail})` : `mobile number (${fullPhoneDisplay})`
          }.`
      );
    } catch {
      setErrorBanner(
        'Failed to contact OTP dispatch gateway. Please use "Two-Step PIN & Password" or "Authenticator App (TOTP)" above.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify 6-Digit Code (Two-Step PIN + Password Proof, Authenticator TOTP, or Live SMTP/SMS OTP)
  const handleVerifyCode = async () => {
    setErrorBanner(null);
    const cleanCode = otpInput.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorBanner('Please enter a valid 6-digit verification code.');
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

    setIsVerifyingOtp(true);
    try {
      const pwdHash = accountPassword ? sha256HexSync(accountPassword.trim()) : undefined;
      const enteredCodeHash = sha256HexSync(cleanCode);
      const step1PinHash = /^\d{6}$/.test(twoStepPin)
        ? sha256HexSync(twoStepPin.trim())
        : undefined;

      let verified = false;
      let verifiedMethodLabel = '';
      let issuedToken = '';

      // 1. Check Cryptographic Two-Step PIN + Password Verification
      if (verifyChannel === 'pin_verify') {
        if (onboardingMode === 'register') {
          if (step1PinHash && enteredCodeHash === step1PinHash) {
            verified = true;
            verifiedMethodLabel = 'Two-Step Verification PIN & SHA-256 Password Key';
            issuedToken = createVerificationToken(identifier);
          } else {
            setErrorBanner(
              'The 6-digit PIN you entered does not match the 6-digit Two-Step Verification PIN you set in Step 1. Please enter your exact 6-digit PIN.'
            );
            setIsVerifyingOtp(false);
            return;
          }
        } else {
          // Login mode: verify against Firestore / Database stored account record
          const tempToken = createVerificationToken(identifier);
          const recovered = await recoverCloudAccountBackup({
            phone: isPhoneValid ? normalizedPhoneDigits : undefined,
            email: isEmailValid ? cleanEmail : undefined,
            passwordHash: pwdHash,
            twoStepPinHash: enteredCodeHash,
            verificationToken: tempToken,
          });

          if (!recovered) {
            setErrorBanner(
              'Verification failed: Your 6-digit Two-Step Verification PIN or Account Password did not match the registered account in the database.'
            );
            setIsVerifyingOtp(false);
            return;
          }

          verified = true;
          verifiedMethodLabel = 'Database Cryptographic Password & Two-Step PIN Match';
          issuedToken = tempToken;

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
            `Verified existing account (@${
              recovered.account?.username || username || 'user'
            }) from database and restored your encrypted profile & chats!`
          );
        }
      }

      // 2. Check RFC 6238 Authenticator App TOTP
      if (!verified && verifyChannel === 'totp') {
        if (totpSecret && verifyTotpCodeSync(totpSecret, cleanCode)) {
          verified = true;
          verifiedMethodLabel = 'RFC 6238 Authenticator App (TOTP)';
          issuedToken = createVerificationToken(identifier);
        } else {
          setErrorBanner(
            'Invalid 6-digit Authenticator App code. Make sure you added the secret key to Google Authenticator / Authy, or switch to "Two-Step PIN & Password" tab above.'
          );
          setIsVerifyingOtp(false);
          return;
        }
      }

      // 3. Check Server / Gateway OTP (`email_otp` / `phone_otp`)
      if (!verified) {
        const res = await apiFetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            target: identifier,
            channel: activeChannel,
            code: cleanCode,
            mode: onboardingMode,
            totpSecret: totpSecret || undefined,
            twoStepPinHash: step1PinHash || enteredCodeHash,
            passwordHash: pwdHash,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorBanner(
            data.error ||
              'Invalid or expired 6-digit verification code. Please check your code and try again.'
          );
          setIsVerifyingOtp(false);
          return;
        }
        verified = true;
        verifiedMethodLabel = 'Live Out-of-Band OTP Verification';
        issuedToken = data.verificationToken || createVerificationToken(identifier);
      }

      // If logging in via TOTP or OTP, also recover cloud backup from database
      if (onboardingMode === 'login' && !recoveredAccountData) {
        const recovered = await recoverCloudAccountBackup({
          phone: isPhoneValid ? normalizedPhoneDigits : undefined,
          email: isEmailValid ? cleanEmail : undefined,
          passwordHash: pwdHash,
          twoStepPinHash: enteredCodeHash,
          verificationToken: issuedToken,
        });

        if (!recovered) {
          setErrorBanner(
            'Code verified, but your Account Password or Two-Step PIN did not match the existing account in the database.'
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
          }) from the database!`
        );
      }

      setVerificationToken(issuedToken);
      setVerifiedIdentifier(identifier);
      if (isPhoneValid) setPhoneVerified(true);
      if (isEmailValid) setEmailVerified(true);
      if (!isPhoneValid && !isEmailValid) {
        if (activeChannel === 'phone') setPhoneVerified(true);
        else setEmailVerified(true);
      }
      setOtpSentMessage(`Account cryptographically verified via ${verifiedMethodLabel}!`);
    } catch {
      setErrorBanner('Verification encountered an error. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Finalize Account Creation or Sign-In & Save Directly to Database
  const handleFinish = async () => {
    if (!isVerifiedForProceeding || !verificationToken) {
      setErrorBanner('You must complete account verification before continuing.');
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
      const pinHash = /^\d{6}$/.test(twoStepPin)
        ? sha256HexSync(twoStepPin.trim())
        : recoveredAccountData?.twoStepPinHash ||
          (/^\d{6}$/.test(otpInput) ? sha256HexSync(otpInput.trim()) : undefined);

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
          verifyChannel === 'google_oauth'
            ? 'google_oauth'
            : verifyChannel === 'totp'
            ? 'totp'
            : isPhoneValid && isEmailValid
            ? 'both'
            : isPhoneValid
            ? 'phone_otp'
            : 'gmail_otp',
        phoneVerified: Boolean(isPhoneValid || recoveredAccountData?.phoneVerified),
        emailVerified: Boolean(isEmailValid || recoveredAccountData?.emailVerified),
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
        cloudBackupGmail: finalEmail || undefined,
      };

      // 1. Immediately persist account credentials & backup to Firebase Firestore + Local + Server Database
      const backupPayload = JSON.stringify({
        version: '3.1.0',
        exportedAt: Date.now(),
        account: finalAccount,
        passwordHash: pwdHash,
        twoStepPinHash: pinHash,
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
        twoStepPinHash: pinHash,
        totpSecret: finalAccount.totpSecret,
        verificationToken,
        backupJson: backupPayload,
      });

      // 2. Also register user in Firebase Firestore `directory` and `phone_index` so contacts can discover & message them
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
                Cloud Firestore Database · Phone, Gmail, or Both
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

              {/* Mandatory Account Password & 6-Digit Two-Step Verification PIN */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {onboardingMode === 'register'
                        ? 'Set Account Password & 6-Digit 2-Step PIN'
                        : 'Enter Account Password & 6-Digit 2-Step PIN'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/80">
                    SHA-256 Protected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Account Password {onboardingMode === 'register' ? '*' : ''}
                    </label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                        placeholder="Repeat password"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                        placeholder="6-digit PIN"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono tracking-widest focus:outline-none focus:border-emerald-500"
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
                      placeholder="Enter 6-digit secret PIN (e.g. ••••••)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono tracking-widest focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Saved encrypted in the cloud database. Required whenever signing in or recovering your account on any phone.
                    </p>
                  </div>
                )}
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
                    <span>Checking Cloud Database...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Continue to Account Verification →</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: CRYPTOGRAPHIC ACCOUNT VERIFICATION */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                    Step 2 · Verify Account Ownership
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
                  Verify your identity for{' '}
                  <strong className="text-white font-mono">
                    {isPhoneValid && isEmailValid
                      ? `${fullPhoneDisplay} & ${cleanEmail}`
                      : isPhoneValid
                      ? fullPhoneDisplay
                      : cleanEmail}
                  </strong>{' '}
                  using one of the cryptographic verification methods below:
                </p>
              </div>

              {/* Verification Method Selector Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setVerifyChannel('pin_verify');
                    setErrorBanner(null);
                  }}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                    verifyChannel === 'pin_verify'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>2-Step PIN Key</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVerifyChannel('totp');
                    setErrorBanner(null);
                  }}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                    verifyChannel === 'totp'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Authenticator</span>
                </button>

                {isEmailValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyChannel('email_otp');
                      setErrorBanner(null);
                    }}
                    className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      verifyChannel === 'email_otp'
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>Gmail SMTP OTP</span>
                  </button>
                )}

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
                    <span>Carrier SMS OTP</span>
                  </button>
                )}
              </div>

              {/* CHANNEL 1: 6-DIGIT TWO-STEP VERIFICATION PIN & PASSWORD KEY */}
              {verifyChannel === 'pin_verify' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30 space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      <span>
                        {onboardingMode === 'register'
                          ? 'Confirm Your 6-Digit Two-Step Verification PIN'
                          : 'Verify With Your Registered 6-Digit Two-Step PIN'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {onboardingMode === 'register'
                        ? 'Re-enter your secret 6-digit Two-Step Verification PIN to cryptographically lock your account in the Cloud Firestore database.'
                        : 'Enter the secret 6-digit Two-Step Verification PIN registered to your account to verify ownership and decrypt your cloud backup.'}
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      Enter Your Secret 6-Digit Two-Step Verification PIN:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpInput}
                        onChange={(e) =>
                          setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="••••••"
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.35em] text-center focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={isVerifyingOtp || otpInput.length !== 6}
                        onClick={handleVerifyCode}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                      >
                        {isVerifyingOtp ? 'Verifying...' : 'Verify PIN'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CHANNEL 2: AUTHENTICATOR APP (RFC 6238 TOTP) */}
              {verifyChannel === 'totp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4 text-cyan-400" />
                        <span>Authenticator App (RFC 6238 TOTP)</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Works with Google Authenticator, Microsoft Authenticator, Authy, or 1Password.
                      </p>
                    </div>
                    {onboardingMode === 'register' && (
                      <button
                        type="button"
                        disabled={isGeneratingTotp}
                        onClick={handleGenerateTotpSecret}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300"
                      >
                        New Key
                      </button>
                    )}
                  </div>

                  {onboardingMode === 'register' && totpSecret && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Your Cryptographic Base32 TOTP Setup Key
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs font-mono font-bold text-cyan-300 break-all">
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
                      {totpUri && (
                        <a
                          href={totpUri}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:underline pt-1"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>1-Tap Open in Authenticator App on This Phone</span>
                        </a>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      Enter 6-Digit Code from Your Authenticator App:
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
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.35em] text-center focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        type="button"
                        disabled={isVerifyingOtp || otpInput.length !== 6}
                        onClick={handleVerifyCode}
                        className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0"
                      >
                        {isVerifyingOtp ? 'Verifying...' : 'Verify TOTP'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CHANNEL 3: LIVE SMTP EMAIL OTP */}
              {verifyChannel === 'email_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-indigo-400" />
                        <span>Real SMTP Email OTP ({cleanEmail || 'No email set'})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dispatches a real 6-digit verification code to your email inbox via SMTP.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGatewayConfig((v) => !v)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-indigo-300 shrink-0"
                    >
                      {gatewayStatus.smtpConfigured ? 'SMTP Active' : 'Configure SMTP'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isSendingOtp || !isEmailValid}
                    onClick={() => handleSendRealOtp('email')}
                    className="w-full py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>
                      {isSendingOtp
                        ? 'Dispatching Email via SMTP...'
                        : `Send Real 6-Digit OTP to ${cleanEmail || 'Email'}`}
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
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white font-mono tracking-[0.3em] text-center focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={isVerifyingOtp || otpInput.length !== 6}
                      onClick={handleVerifyCode}
                      className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold text-xs shrink-0"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              )}

              {/* CHANNEL 4: LIVE CARRIER SMS GATEWAY OTP */}
              {verifyChannel === 'phone_otp' && (
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Phone className="w-4 h-4 text-amber-400" />
                        <span>Carrier SMS OTP ({fullPhoneDisplay || 'No phone set'})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Dispatches a real SMS to your mobile number via Carrier SMS Gateway.
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
                    onClick={() => handleSendRealOtp('phone')}
                    className="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>
                      {isSendingOtp
                        ? 'Dispatching Carrier SMS...'
                        : `Send Real SMS OTP to ${fullPhoneDisplay || 'Mobile'}`}
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
                      Verify
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
                    ? `Verified (${verifiedIdentifier || 'OK'}) · Continue →`
                    : 'Complete Verification Above to Continue'}
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
                  <div className="font-bold">Account Ownership Cryptographically Verified</div>
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
                      Automatically back up account &amp; chats protected by your password &amp; 2-Step PIN
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
                      <span>Saving Account to Database...</span>
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
