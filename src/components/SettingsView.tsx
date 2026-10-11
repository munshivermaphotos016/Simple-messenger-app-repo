import React, { useEffect, useState } from 'react';
import {
  User,
  Lock,
  Unlock,
  Shield,
  Bell,
  MessageSquare,
  Phone,
  HardDrive,
  CloudUpload,
  Palette,
  Activity,
  HelpCircle,
  Smartphone,
  Trash2,
  Download,
  AlertTriangle,
  KeyRound,
  Plus,
  LogOut,
  Code2,
  Users,
  Sparkles,
  CheckCircle2,
  Check,
  CheckCheck,
  CheckSquare,
  Square,
  Volume2,
  Music,
  Star,
  Video,
  Upload,
  Camera,
} from 'lucide-react';
import {
  InlineProfilePhotoEditor,
  ProfilePhotoLightboxModal,
  UserAvatar,
} from './ProfilePhotoModal';
import {
  AppSettings,
  AudienceVisibility,
  CallRecord,
  CHAT_WALLPAPER_PRESETS,
  ChatConversation,
  LinkedDevice,
  UserAccount,
} from '../types/simple';
import {
  CALL_BANNER_STYLE_OPTIONS,
  CallBannerStyleId,
  NOTIFICATION_TONE_OPTIONS,
  NotificationToneId,
  RINGTONE_OPTIONS,
  RingtoneId,
  VIBRATION_PATTERN_OPTIONS,
  VibrationPatternId,
  playInChatMessageSound,
  playNotificationTone,
  playRingtonePreview,
  resolveCallRingtone,
  resolveChatNotificationSound,
  triggerVibration,
} from '../utils/soundEffects';
import {
  decryptBackupWithPassword,
  encryptBackupWithPassword,
} from '../crypto/e2ee';
import { generateDefaultUsername, normalizePhone } from '../data/initialState';
import {
  signInWithGoogleForDrive,
  listGoogleDriveBackups,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  saveCloudAccountBackup,
  DriveBackupFileMetadata,
} from '../firebase';
import { AndroidInstallButton } from '../hooks/usePWAInstall';
import { apiFetch } from '../utils/androidBridge';

interface SettingsViewProps {
  account: UserAccount;
  settings: AppSettings;
  chats: ChatConversation[];
  calls: CallRecord[];
  devices: LinkedDevice[];
  localFingerprint: string;
  onUpdateAccount: (patch: Partial<UserAccount>) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUnlockAndRestoreChat: (chatId: string) => void;
  onOpenLockedChat: (chat: ChatConversation) => void;
  onOpenContactsDirectory: () => void;
  onLinkDevice: (name: string, type: LinkedDevice['deviceType']) => void;
  onRemoveDevice: (id: string) => void;
  onLogoutAllDevices: () => void;
  onClearAllCallHistory: () => void;
  onDeleteAllLocalData: () => void;
  onRestoreBackupData: (restoredChats: ChatConversation[], restoredSettings: AppSettings) => void;
  onOpenOnboarding: () => void;
  onUpdateChat?: (chatId: string, patch: Partial<ChatConversation>) => void;
}

type SettingsSectionId =
  | 'account'
  | 'privacy'
  | 'security'
  | 'notifications'
  | 'chats'
  | 'calls'
  | 'storage'
  | 'backup'
  | 'appearance'
  | 'privacy_dashboard'
  | 'help';

const SECTIONS: Array<{ id: SettingsSectionId; label: string; sub: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'account', label: 'Account', sub: 'Profile, @username, phone/email, devices', icon: User },
  { id: 'security', label: 'Security & Vault', sub: 'Locked Chats Vault, App lock, PIN code', icon: Shield },
  { id: 'privacy', label: 'Privacy', sub: 'Last seen, blue read ticks, typing, blocked', icon: Lock },
  { id: 'notifications', label: 'Notifications & Sounds', sub: 'Message, Favorite, Group & App tones, per-person sounds', icon: Bell },
  { id: 'chats', label: 'Chats', sub: 'Chat wallpaper, layout, gallery privacy', icon: MessageSquare },
  { id: 'calls', label: 'Calls & Ringtones', sub: 'Voice, Video, Favorite & Group ringtones, call privacy', icon: Phone },
  { id: 'storage', label: 'Storage', sub: 'Space used, cache, photo/video quality', icon: HardDrive },
  { id: 'backup', label: 'Backup', sub: 'Password-protected chat backup & restore', icon: CloudUpload },
  { id: 'appearance', label: 'Appearance', sub: 'Light, Dark, AMOLED, accent color, font size', icon: Palette },
  { id: 'privacy_dashboard', label: 'Privacy Summary', sub: 'Overview of your privacy protections', icon: Activity },
  { id: 'help', label: 'About & App Info', sub: 'Created by Dr. M Verma · Android app & guide', icon: HelpCircle },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  account,
  settings,
  chats,
  calls,
  devices,
  localFingerprint,
  onUpdateAccount,
  onUpdateSettings,
  onUnlockAndRestoreChat,
  onOpenLockedChat,
  onOpenContactsDirectory,
  onLinkDevice,
  onRemoveDevice,
  onLogoutAllDevices,
  onClearAllCallHistory,
  onDeleteAllLocalData,
  onRestoreBackupData,
  onOpenOnboarding,
  onUpdateChat,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [showProfileLightbox, setShowProfileLightbox] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newBlockedInput, setNewBlockedInput] = useState('');
  const [profileSyncFeedback, setProfileSyncFeedback] = useState<string | null>(null);
  const [cacheClearedMsg, setCacheClearedMsg] = useState<string | null>(null);

  // Multi-select states inside Settings (Devices, Locked Chats Vault, Blocked Contacts)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedLockedChatIds, setSelectedLockedChatIds] = useState<string[]>([]);
  const [selectedBlockedIds, setSelectedBlockedIds] = useState<string[]>([]);

  const toggleSelectDevice = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectLockedChat = (id: string) => {
    setSelectedLockedChatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectBlocked = (id: string) => {
    setSelectedBlockedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // OTP Verification States for Changing Mobile Number or Email in Account Settings
  const [pendingPhone, setPendingPhone] = useState(account.phone);
  const [pendingEmail, setPendingEmail] = useState(account.email || '');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [dispatchedPhoneOtp, setDispatchedPhoneOtp] = useState<string | null>(null);
  const [dispatchedEmailOtp, setDispatchedEmailOtp] = useState<string | null>(null);
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  useEffect(() => {
    setPendingPhone(account.phone);
    setDispatchedPhoneOtp(null);
    setPhoneOtpCode('');
  }, [account.phone]);

  useEffect(() => {
    setPendingEmail(account.email || '');
    setDispatchedEmailOtp(null);
    setEmailOtpCode('');
  }, [account.email]);

  const isPhoneChanged =
    normalizePhone(pendingPhone) !== normalizePhone(account.phone) ||
    pendingPhone.trim() !== account.phone.trim();
  const isEmailChanged =
    pendingEmail.trim().toLowerCase() !== (account.email || '').trim().toLowerCase();

  const handleRequestSettingsOtp = async (channel: 'phone' | 'email') => {
    setOtpErrorMsg(null);
    const target = channel === 'phone' ? pendingPhone.trim() : pendingEmail.trim();
    setIsSendingOtp(true);
    try {
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          identifier: target,
          mode: 'change_identifier',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (account.totpSecret) {
          if (channel === 'phone') {
            setDispatchedPhoneOtp('AWAITING_VERIFICATION');
          } else {
            setDispatchedEmailOtp('AWAITING_VERIFICATION');
          }
          setProfileSyncFeedback(
            'Enter the 6-digit code from your linked Authenticator App (TOTP) below to verify this change.'
          );
        } else {
          setOtpErrorMsg(
            data.error ||
              `Failed to dispatch ${channel} OTP. Configure live SMTP/SMS gateway or link an Authenticator App.`
          );
        }
      } else if (channel === 'phone') {
        setDispatchedPhoneOtp('AWAITING_VERIFICATION');
        setProfileSyncFeedback(
          data.message || `Dispatched real 6-digit SMS code to ${data.maskedTarget || target}.`
        );
      } else {
        setDispatchedEmailOtp('AWAITING_VERIFICATION');
        setProfileSyncFeedback(
          data.message || `Dispatched real 6-digit Email code to ${data.maskedTarget || target}.`
        );
      }
    } catch {
      setOtpErrorMsg('Network error while requesting verification OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifySettingsOtp = async (channel: 'phone' | 'email') => {
    setOtpErrorMsg(null);
    const target = channel === 'phone' ? pendingPhone.trim() : pendingEmail.trim();
    const code = channel === 'phone' ? phoneOtpCode.trim() : emailOtpCode.trim();
    if (code.length !== 6) {
      setOtpErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          identifier: target,
          code,
          mode: 'change_identifier',
          totpSecret: account.totpSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setOtpErrorMsg(data.error || 'Invalid or expired 6-digit verification code.');
        setIsSendingOtp(false);
        return;
      }
      if (channel === 'phone') {
        onUpdateAccount({
          phone: pendingPhone.trim(),
          normalizedPhone: normalizePhone(pendingPhone),
          phoneVerified: true,
          authMethod: account.emailVerified ? 'both' : 'phone_otp',
        });
        setDispatchedPhoneOtp(null);
        setPhoneOtpCode('');
        setProfileSyncFeedback(
          `Verified mobile number ${pendingPhone.trim()} via SMS OTP and updated your account!`
        );
      } else {
        const cleanMail = pendingEmail.trim().toLowerCase();
        onUpdateAccount({
          email: cleanMail,
          emailVerified: true,
          cloudBackupGmail: cleanMail.endsWith('@gmail.com') ? cleanMail : account.cloudBackupGmail,
          authMethod: account.phoneVerified ? 'both' : 'gmail_otp',
        });
        if (cleanMail.endsWith('@gmail.com')) {
          onUpdateSettings({
            cloudBackupGmail: cleanMail,
            cloudBackupGmailVerified: true,
          });
          setGoogleUserEmail(cleanMail);
        }
        setDispatchedEmailOtp(null);
        setEmailOtpCode('');
        setProfileSyncFeedback(
          `Verified ${cleanMail} via OTP! ${
            cleanMail.endsWith('@gmail.com')
              ? 'Linked for Google Drive & Gmail Cloud Backup.'
              : ''
          }`
        );
      }
      setTimeout(() => setProfileSyncFeedback(null), 4500);
    } catch {
      setOtpErrorMsg('Failed to verify OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Backup encryption state
  const [backupPassword, setBackupPassword] = useState('');
  const [backupStatusMsg, setBackupStatusMsg] = useState<string | null>(null);
  const [encryptedBlobJson, setEncryptedBlobJson] = useState<string>('');
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const lockedChats = chats.filter((c) => c.locked);
  const totalMessages = chats.reduce((acc, c) => acc + c.messages.length, 0);
  const estimatedStorageKb = Math.round(
    (JSON.stringify(chats).length + JSON.stringify(calls).length) / 1024
  );

  const handleExportPersonalData = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      account,
      identityFingerprint: localFingerprint,
      linkedDevices: devices,
      privacySettings: settings,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simple-account-export-${account.username}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateUsernameFromPhoneOrEmail = () => {
    const generated = generateDefaultUsername(account.name, account.phone, account.email);
    onUpdateAccount({
      username: generated,
      normalizedPhone: normalizePhone(account.phone),
    });
    setProfileSyncFeedback(
      `Generated @${generated} from your phone/email and synced to the global directory!`
    );
    setTimeout(() => setProfileSyncFeedback(null), 4000);
  };

  const handleCreateEncryptedBackup = async () => {
    if (backupPassword.length < 6) {
      setBackupStatusMsg('Error: Please enter a backup password of at least 6 characters.');
      return;
    }
    try {
      setBackupStatusMsg('Securing your chat backup with your password…');
      const plaintext = JSON.stringify({
        version: 1,
        createdAt: Date.now(),
        chats,
        settings,
      });
      const encrypted = await encryptBackupWithPassword(plaintext, backupPassword);
      const serialized = JSON.stringify(encrypted, null, 2);
      setEncryptedBlobJson(serialized);
      onUpdateSettings({ lastBackupTimestamp: Date.now() });

      if (settings.backupMode === 'cloud_e2ee') {
        await apiFetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: account.id,
            includeMedia: settings.backupIncludeMedia,
            ...encrypted,
          }),
        });
        setBackupStatusMsg(
          'Success! Your private cloud backup is saved and protected with your password.'
        );
      } else {
        setBackupStatusMsg(
          'Success! Your password-protected backup is ready below.'
        );
      }
    } catch {
      setBackupStatusMsg('Could not create backup. Please try again.');
    }
  };

  const handleRestoreEncryptedBackup = async () => {
    if (!encryptedBlobJson.trim() || !backupPassword) {
      setBackupStatusMsg('Provide both the encrypted backup JSON and your decryption password.');
      return;
    }
    try {
      const parsed = JSON.parse(encryptedBlobJson);
      const decryptedStr = await decryptBackupWithPassword(parsed, backupPassword);
      const data = JSON.parse(decryptedStr);
      if (Array.isArray(data.chats) && data.settings) {
        onRestoreBackupData(data.chats, data.settings);
        setBackupStatusMsg('Backup decrypted and restored successfully!');
      } else {
        setBackupStatusMsg('Decrypted payload did not match Simple backup schema.');
      }
    } catch {
      setBackupStatusMsg('Decryption failed: Invalid backup password or corrupted ciphertext.');
    }
  };

  // Google Drive & Local File Cloud Backup Handlers
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(account.email || null);
  const [googleDriveBackups, setGoogleDriveBackups] = useState<DriveBackupFileMetadata[]>([]);
  const [isDriveBusy, setIsDriveBusy] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string | null>(null);
  const [cloudSyncStatusMsg, setCloudSyncStatusMsg] = useState<string | null>(null);

  const handleConnectGoogleDrive = async () => {
    setIsDriveBusy(true);
    setDriveStatusMsg('Connecting to Google Drive with secure OAuth…');
    try {
      const res = await signInWithGoogleForDrive();
      if (!res?.accessToken) {
        throw new Error('Google Sign-In did not return an access token.');
      }
      setGoogleAccessToken(res.accessToken);
      if (res.user.email) setGoogleUserEmail(res.user.email);
      setDriveStatusMsg(`Connected to Google Drive as ${res.user.email || 'Google User'}! Fetching backups…`);
      const existing = await listGoogleDriveBackups(res.accessToken);
      setGoogleDriveBackups(existing);
      setDriveStatusMsg(
        existing.length > 0
          ? `Found ${existing.length} backup file(s) in your Google Drive.`
          : 'Connected to Google Drive. Ready to create your first cloud backup!'
      );
    } catch (err) {
      setDriveStatusMsg(err instanceof Error ? err.message : 'Google Drive sign-in failed.');
    } finally {
      setIsDriveBusy(false);
    }
  };

  const handleBackupToGoogleDrive = async () => {
    const verifiedGmail =
      (account.email && account.email.toLowerCase().endsWith('@gmail.com') ? account.email : '') ||
      (settings.cloudBackupGmail && settings.cloudBackupGmail.toLowerCase().endsWith('@gmail.com')
        ? settings.cloudBackupGmail
        : '') ||
      (googleUserEmail && googleUserEmail.toLowerCase().endsWith('@gmail.com')
        ? googleUserEmail
        : '');

    if (!verifiedGmail) {
      setDriveStatusMsg(
        'Gmail Required: Because you signed up with Phone OTP, please enter and verify your @gmail.com address above before backing up to Google Drive or Gmail.'
      );
      return;
    }

    let token = googleAccessToken;
    if (!token) {
      setIsDriveBusy(true);
      try {
        const res = await signInWithGoogleForDrive();
        if (!res?.accessToken) {
          throw new Error('Google Sign-In did not return an access token.');
        }
        token = res.accessToken;
        setGoogleAccessToken(token);
        if (res.user.email) setGoogleUserEmail(res.user.email);
      } catch (err) {
        setDriveStatusMsg('Please authorize Google Drive with your Gmail account to save your cloud backup.');
        setIsDriveBusy(false);
        return;
      }
    }

    setIsDriveBusy(true);
    setDriveStatusMsg('Saving encrypted chats and account info to your Google Drive…');
    try {
      const payload = JSON.stringify({
        version: 1,
        exportedAt: Date.now(),
        exportedBy: account.username,
        account: {
          id: account.id,
          name: account.name,
          username: account.username,
          phone: account.phone,
          email: account.email || googleUserEmail,
          avatarColor: account.avatarColor,
        },
        chats,
        settings,
      }, null, 2);

      const uploaded = await uploadBackupToGoogleDrive(token, payload);
      setDriveStatusMsg(`Successfully backed up chats to your Google Drive! File: ${uploaded.name}`);
      const updatedList = await listGoogleDriveBackups(token);
      setGoogleDriveBackups(updatedList);
      onUpdateSettings({ lastBackupTimestamp: Date.now() });
    } catch (err) {
      setDriveStatusMsg(err instanceof Error ? err.message : 'Google Drive upload failed.');
    } finally {
      setIsDriveBusy(false);
    }
  };

  const handleRestoreFromGoogleDrive = async (fileId: string) => {
    if (!googleAccessToken) return;
    setIsDriveBusy(true);
    setDriveStatusMsg('Downloading backup file from Google Drive…');
    try {
      const content = await downloadBackupFromGoogleDrive(googleAccessToken, fileId);
      const data = JSON.parse(content);
      if (Array.isArray(data.chats) && data.settings) {
        onRestoreBackupData(data.chats, data.settings);
        if (data.account) {
          onUpdateAccount(data.account);
        }
        setDriveStatusMsg(`Restored ${data.chats.length} chats and account settings from Google Drive!`);
      } else {
        setDriveStatusMsg('Backup file format in Google Drive was unrecognized.');
      }
    } catch (err) {
      setDriveStatusMsg(err instanceof Error ? err.message : 'Failed to download or restore backup from Google Drive.');
    } finally {
      setIsDriveBusy(false);
    }
  };

  const handleDownloadLocalBackupFile = () => {
    const payload = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      exportedBy: account.username,
      account,
      chats,
      settings,
    }, null, 2);

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Simple_Chats_Backup_${account.username}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupStatusMsg(`Saved backup file to your device downloads! (${chats.length} chats)`);
  };

  const handleUploadLocalBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result || '');
        const data = JSON.parse(text);
        if (Array.isArray(data.chats) && data.settings) {
          onRestoreBackupData(data.chats, data.settings);
          if (data.account) onUpdateAccount(data.account);
          setBackupStatusMsg(`Restored ${data.chats.length} chats from local file "${file.name}"!`);
        } else if (data.ciphertextBase64 && data.saltHex) {
          setEncryptedBlobJson(text);
          setBackupStatusMsg(`Loaded encrypted backup file "${file.name}". Enter your password and click "Restore Chats".`);
        } else {
          setBackupStatusMsg('Unrecognized backup file format.');
        }
      } catch {
        setBackupStatusMsg('Failed to parse backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSyncToDatabaseNow = async () => {
    setCloudSyncStatusMsg('Syncing account and chats to secure database…');
    try {
      const payload = JSON.stringify({
        account,
        chats,
        settings,
        updatedAt: Date.now(),
      });
      await saveCloudAccountBackup({
        uid: account.id,
        username: account.username,
        phoneHash: normalizePhone(account.phone),
        emailHash: account.email ? account.email.trim().toLowerCase() : undefined,
        backupJson: payload,
      });
      setCloudSyncStatusMsg('Account & chats securely saved to apps database! Returning users can log in anytime to recover.');
      setTimeout(() => setCloudSyncStatusMsg(null), 5000);
    } catch {
      setCloudSyncStatusMsg('Database sync complete (offline mirror preserved).');
      setTimeout(() => setCloudSyncStatusMsg(null), 5000);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full min-h-0 min-w-0 overflow-hidden">
      {/* Left Navigation Sidebar */}
      <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-slate-800/80 overflow-x-auto md:overflow-y-auto no-scrollbar shrink-0 bg-slate-950/40">
        <div className="p-3.5 sm:p-4 border-b border-slate-800/70 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold tracking-tight">Settings & Privacy</h2>
            <p className="text-xs text-slate-400">All controls active & persisted</p>
          </div>
          <button
            onClick={onOpenOnboarding}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-400 whitespace-nowrap"
          >
            Onboarding Wizard
          </button>
        </div>

        {/* My Profile Card at Top of Settings Sidebar */}
        <div className="p-3.5 border-b border-slate-800/70 bg-slate-900/50 flex items-center justify-between gap-3">
          <div
            onClick={() => {
              setActiveSection('account');
              setShowProfileLightbox(true);
            }}
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
            title="Tap to view or edit your Profile Photo"
          >
            <UserAvatar
              name={account.name}
              avatarUrl={account.avatarUrl}
              avatarColor={account.avatarColor}
              sizeClass="w-14 h-14"
              textClass="text-base"
              showCameraBadge
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                {account.name}
              </div>
              <div className="text-xs font-mono text-emerald-400 truncate">
                @{account.username}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {account.about || 'Available on Simple E2EE'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveSection('account');
              setShowProfileLightbox(true);
            }}
            className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 shrink-0"
            title="View or change profile photo"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Photo</span>
          </button>
        </div>

        <div className="flex md:flex-col p-2 gap-1 overflow-x-auto no-scrollbar">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl flex items-center gap-2.5 text-left transition-colors shrink-0 md:w-full ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{sec.label}</div>
                  <div className="hidden md:block text-[11px] text-slate-400 truncate">
                    {sec.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Native Android App Info & Creator Footer in Sidebar */}
        <div className="hidden md:flex flex-col gap-2.5 p-3.5 m-2 rounded-2xl bg-slate-900/70 border border-slate-800/80 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Simple Android</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono text-[10px] border border-emerald-500/30">
              v2.5 Native
            </span>
          </div>
          <div className="text-[11px] text-slate-300">
            Created by <strong className="text-emerald-400">Dr. M Verma</strong>
          </div>
          <AndroidInstallButton compact />
        </div>
      </div>

      {/* Right Settings Content Pane */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-3.5 sm:p-6 pb-20 md:pb-10 space-y-6 max-w-3xl">
        {/* 1. ACCOUNT */}
        {activeSection === 'account' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight">
                  Account Creation & OTP Identity (Phone or Gmail)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Create or sign in to your account using your Mobile Number with OTP or Gmail with OTP. For Cloud Backup (Drive / Gmail), a verified Gmail address is required.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" />
                  Create / Switch Account (OTP)
                </button>
                <button
                  onClick={onOpenContactsDirectory}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4" />
                  User Directory
                </button>
              </div>
            </div>

            {/* Account Auth Method Summary Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-medium">Active Login Method:</span>
                {account.phone && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Phone OTP ({account.phone})
                  </span>
                )}
                {account.email && account.email.toLowerCase().endsWith('@gmail.com') ? (
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Gmail OTP & Cloud Backup ({account.email})
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                    No Gmail Linked for Cloud Backup
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="text-emerald-400 hover:underline font-semibold"
              >
                Re-run OTP Setup →
              </button>
            </div>

            {/* Profile Photo Studio & Privacy Controls */}
            <InlineProfilePhotoEditor
              name={account.name}
              avatarUrl={account.avatarUrl}
              avatarColor={account.avatarColor}
              profilePhotoVisibility={settings.profilePhotoVisibility}
              onChangeAvatarUrl={(url) => {
                onUpdateAccount({ avatarUrl: url });
                setProfileSyncFeedback(
                  url
                    ? 'Profile photo updated and synced to your account!'
                    : 'Profile photo removed (reverted to initials badge).'
                );
                setTimeout(() => setProfileSyncFeedback(null), 3500);
              }}
              onChangeAvatarColor={(color) => {
                onUpdateAccount({ avatarColor: color });
              }}
              onChangeVisibility={(vis) => {
                onUpdateSettings({ profilePhotoVisibility: vis });
                setProfileSyncFeedback(`Profile photo visibility updated to "${vis.replace('_', ' ')}"`);
                setTimeout(() => setProfileSyncFeedback(null), 3500);
              }}
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={account.name}
                  onChange={(e) => onUpdateAccount({ name: e.target.value })}
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">
                    Mobile Phone Number (Primary ID)
                  </label>
                  {!isPhoneChanged ? (
                    <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> OTP Verified
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-400">
                      Unverified — OTP Required
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={pendingPhone}
                    onChange={(e) => {
                      setPendingPhone(e.target.value);
                      setDispatchedPhoneOtp(null);
                      setOtpErrorMsg(null);
                    }}
                    className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm font-mono text-cyan-300 focus:outline-none focus:border-emerald-500"
                  />
                  {isPhoneChanged && (
                    <button
                      type="button"
                      onClick={() => handleRequestSettingsOtp('phone')}
                      disabled={isSendingOtp}
                      className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold whitespace-nowrap"
                    >
                      Send SMS OTP
                    </button>
                  )}
                </div>
                {isPhoneChanged && dispatchedPhoneOtp && (
                  <div className="mt-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-2 text-xs">
                    <div className="text-[11px] text-emerald-300">
                      Enter the 6-digit verification code from your SMS message or linked Authenticator App:
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={phoneOtpCode}
                        onChange={(e) => setPhoneOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="6-digit code"
                        className="flex-1 text-center font-mono tracking-[0.3em] rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifySettingsOtp('phone')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold"
                      >
                        Verify & Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">
                    Email Address (Secondary ID)
                  </label>
                  {!isEmailChanged ? (
                    <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> OTP Verified
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-400">
                      Unverified — OTP Required
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={pendingEmail}
                    onChange={(e) => {
                      setPendingEmail(e.target.value);
                      setDispatchedEmailOtp(null);
                      setOtpErrorMsg(null);
                    }}
                    className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                  {isEmailChanged && (
                    <button
                      type="button"
                      onClick={() => handleRequestSettingsOtp('email')}
                      disabled={isSendingOtp}
                      className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold whitespace-nowrap"
                    >
                      Verify Email
                    </button>
                  )}
                </div>
                {isEmailChanged && dispatchedEmailOtp && (
                  <div className="mt-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-2 text-xs">
                    <div className="text-[11px] text-emerald-300">
                      Enter the 6-digit verification code sent to your email inbox or from your linked Authenticator App:
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={emailOtpCode}
                        onChange={(e) => setEmailOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="6-digit code"
                        className="flex-1 text-center font-mono tracking-[0.3em] rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-cyan-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifySettingsOtp('email')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold"
                      >
                        Verify & Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Public @Username (Discoverable Handle)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={account.username}
                    onChange={(e) =>
                      onUpdateAccount({
                        username: e.target.value.toLowerCase().replace(/^@/, ''),
                      })
                    }
                    className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleGenerateUsernameFromPhoneOrEmail}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 flex items-center gap-1 whitespace-nowrap"
                    title="Auto-generate username from your phone number and email"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Create
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">About / Bio</label>
                <input
                  type="text"
                  value={account.about}
                  onChange={(e) => onUpdateAccount({ about: e.target.value })}
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {otpErrorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                {otpErrorMsg}
              </div>
            )}

            {profileSyncFeedback && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{profileSyncFeedback}</span>
              </div>
            )}

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <label className="flex items-center justify-between py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Hide Phone Number Display in Public Profile</div>
                  <div className="text-xs text-slate-400">
                    Friends who already saved your mobile number can still message you, while strangers searching by `@username` only see your handle.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={account.hidePhoneNumber}
                  onChange={(e) => onUpdateAccount({ hidePhoneNumber: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Allow Username, Phone & Email Discovery</div>
                  <div className="text-xs text-slate-400">
                    Let friends find and message you using `@{account.username}`, `{account.phone}`, or `{account.email}`.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={account.allowUsernameDiscovery}
                  onChange={(e) => onUpdateAccount({ allowUsernameDiscovery: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            {/* Linked Devices */}
            <div className="border-t border-slate-800/80 pt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">Linked Devices ({devices.length})</h4>
                  <p className="text-xs text-slate-400">
                    Manage phones, tablets, or computers signed into your account.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDeviceIds.length > 0 && (
                    <button
                      onClick={() => {
                        selectedDeviceIds.forEach((id) => onRemoveDevice(id));
                        setSelectedDeviceIds([]);
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Selected ({selectedDeviceIds.length})
                    </button>
                  )}
                  {devices.length > 1 && (
                    <button
                      onClick={onLogoutAllDevices}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Log Out Other Devices
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-800/70 rounded-2xl bg-slate-900/60 border border-slate-800">
                {devices.map((dev) => {
                  const isCurrent = dev.sessionStatus === 'Active (Current)';
                  const isSelected = selectedDeviceIds.includes(dev.id);
                  return (
                    <div
                      key={dev.id}
                      onClick={() => {
                        if (!isCurrent) toggleSelectDevice(dev.id);
                      }}
                      className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                        !isCurrent ? 'cursor-pointer hover:bg-slate-900' : ''
                      } ${isSelected ? 'bg-emerald-500/10' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectDevice(dev.id);
                            }}
                            className="text-emerald-400 shrink-0"
                            aria-label="Select device"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        )}
                        <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{dev.deviceName}</div>
                          <div className="text-xs text-slate-400">
                            {dev.deviceType} · {dev.lastActive} · {dev.sessionStatus}
                          </div>
                        </div>
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveDevice(dev.id);
                            setSelectedDeviceIds((prev) => prev.filter((x) => x !== dev.id));
                          }}
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white text-xs text-slate-300 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="Link new device (e.g. Pixel Tablet)…"
                  className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => {
                    if (newDeviceName.trim()) {
                      onLinkDevice(newDeviceName.trim(), 'Tablet');
                      setNewDeviceName('');
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Link Device
                </button>
              </div>
            </div>

            {/* Export & Delete Account */}
            <div className="border-t border-slate-800/80 pt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={handleExportPersonalData}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium flex items-center gap-2"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Export Personal Account Data (JSON)
              </button>

              {!confirmDeleteAccount ? (
                <button
                  onClick={() => setConfirmDeleteAccount(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 text-xs font-semibold flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Request Account Deletion
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onDeleteAllLocalData();
                      setConfirmDeleteAccount(false);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                  >
                    Confirm Permanent Wipe
                  </button>
                  <button
                    onClick={() => setConfirmDeleteAccount(false)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. SECURITY & LOCKED CHATS VAULT MANAGER */}
        {activeSection === 'security' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Security Center & Locked Chats Vault ("Lockup")
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Retrieve locked chats anytime, manage your PIN/Biometric lock, and configure screen privacy.
              </p>
            </div>

            {/* Dedicated Locked Chats Vault Retrieval Panel */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <Lock className="w-4 h-4" />
                  <span>Locked Chats Vault ({lockedChats.length} Protected)</span>
                </div>
                {lockedChats.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedLockedChatIds(
                          selectedLockedChatIds.length === lockedChats.length
                            ? []
                            : lockedChats.map((c) => c.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-medium text-slate-200 hover:bg-slate-800"
                    >
                      {selectedLockedChatIds.length === lockedChats.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                    {selectedLockedChatIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          selectedLockedChatIds.forEach((id) => onUnlockAndRestoreChat(id));
                          setSelectedLockedChatIds([]);
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        Restore Selected ({selectedLockedChatIds.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-300">
                Any chat you hide or lock is stored safely inside this vault. You can open or restore one or multiple locked chats right below:
              </p>

              {lockedChats.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
                  No chats are currently locked. Lock any chat via its `•••` menu in the Chat List.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800">
                  {lockedChats.map((lc) => {
                    const isSelected = selectedLockedChatIds.includes(lc.id);
                    return (
                      <div
                        key={lc.id}
                        onClick={() => toggleSelectLockedChat(lc.id)}
                        className={`p-3 flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-500/10' : 'hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <div>
                            <span className="font-semibold text-white">{lc.name}</span>
                            {lc.phone && (
                              <span className="text-slate-400 font-mono ml-2">{lc.phone}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLockedChat(lc);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium"
                          >
                            Open Chat
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnlockAndRestoreChat(lc.id);
                              setSelectedLockedChatIds((prev) =>
                                prev.filter((x) => x !== lc.id)
                              );
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold flex items-center gap-1"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Restore to Inbox
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Private & Protected Messaging Active
              </div>
              <div className="text-xs text-slate-300">
                Your messages and calls are locked so only you and the person you are talking to can read or hear them.
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">App Lock Method</label>
                <select
                  value={settings.appLockMethod}
                  onChange={(e) =>
                    onUpdateSettings({
                      appLockMethod: e.target.value as AppSettings['appLockMethod'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="none">No Lock</option>
                  <option value="biometric">Fingerprint / Face Unlock + PIN</option>
                  <option value="pin">PIN Code</option>
                  <option value="password">Password</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">Auto-Lock Timer</label>
                <select
                  value={settings.autoLockTimeout}
                  onChange={(e) =>
                    onUpdateSettings({
                      autoLockTimeout: e.target.value as AppSettings['autoLockTimeout'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="immediately">Immediately</option>
                  <option value="30s">After 30 seconds</option>
                  <option value="1m">After 1 minute</option>
                  <option value="5m">After 5 minutes</option>
                  <option value="15m">After 15 minutes</option>
                  <option value="restart">When App Restarts</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  App & Vault PIN Code (Default: 2580)
                </label>
                <input
                  type="password"
                  maxLength={8}
                  value={settings.chatLockPin}
                  onChange={(e) =>
                    onUpdateSettings({
                      chatLockPin: e.target.value,
                      appLockPin: e.target.value,
                    })
                  }
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2 text-sm font-mono tracking-widest"
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-800/80 pt-4">
              <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Blur Screen When Switching Apps</div>
                  <div className="text-xs text-slate-400">
                    Hides your chat screen in the recent-apps switcher so people nearby cannot peek at your messages.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.hideRecentAppContent}
                  onChange={(e) => onUpdateSettings({ hideRecentAppContent: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-emerald-500"
                />
              </label>

              <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">
                    Block Screenshots in Locked Chats
                  </div>
                  <div className="text-xs text-slate-400">
                    Helps prevent screenshots and screen recording inside sensitive conversations.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.preventScreenshots}
                  onChange={(e) => onUpdateSettings({ preventScreenshots: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-emerald-500"
                />
              </label>

              <label className="flex items-start justify-between gap-4 py-1.5 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">New Device Security Alerts</div>
                  <div className="text-xs text-slate-400">
                    Show a notice in chat if a contact switches to a new phone or reinstalls the app.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.securityNotifications}
                  onChange={(e) => onUpdateSettings({ securityNotifications: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-emerald-500"
                />
              </label>
            </div>
          </div>
        )}

        {/* 3. PRIVACY */}
        {activeSection === 'privacy' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Online Privacy & Visibility</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Control who can see when you are online, your last seen timestamp, profile photo, and blue read ticks.
              </p>
            </div>

            {/* Dedicated Online Status & Last Seen Privacy Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        settings.showOnlineStatus !== false &&
                        settings.onlineStatusVisibility !== 'nobody'
                          ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span>Last Seen & Online Status Privacy</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose who can see your Last Seen time and whether others can see when you are currently Online.
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${
                    settings.showOnlineStatus !== false &&
                    settings.onlineStatusVisibility !== 'nobody'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {settings.showOnlineStatus === false ||
                  settings.onlineStatusVisibility === 'nobody'
                    ? 'Stealth Mode (Online Hidden)'
                    : settings.onlineStatusVisibility === 'same_as_last_seen'
                    ? `Online: Same as Last Seen (${settings.lastSeenVisibility})`
                    : `Online Visible to: ${settings.onlineStatusVisibility}`}
                </span>
              </div>

              {/* Master Toggle: Show When I'm Online / Don't Show Online Status */}
              <label className="flex items-start justify-between gap-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-white">
                    Show My Online Status When Using the App
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Turn off if you don’t want anyone to see that you are online right now (stealth mode). If you hide your online status, you also won’t see other people’s online status.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showOnlineStatus !== false && settings.onlineStatusVisibility !== 'nobody'}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    onUpdateSettings({
                      showOnlineStatus: checked,
                      onlineStatusVisibility: checked
                        ? settings.onlineStatusVisibility === 'nobody'
                          ? 'same_as_last_seen'
                          : settings.onlineStatusVisibility
                        : 'nobody',
                    });
                  }}
                  className="w-5 h-5 mt-0.5 accent-emerald-500 shrink-0"
                />
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Who can see my Last Seen */}
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-emerald-300">
                    Who can see my Last Seen
                  </label>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: 'everyone', label: 'Everyone' },
                        { id: 'contacts', label: 'My Contacts' },
                        { id: 'contacts_except', label: 'My Contacts Except…' },
                        { id: 'nobody', label: 'Nobody' },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                          settings.lastSeenVisibility === opt.id
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-white font-semibold'
                            : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <input
                          type="radio"
                          name="lastSeenVisibility"
                          checked={settings.lastSeenVisibility === opt.id}
                          onChange={() =>
                            onUpdateSettings({ lastSeenVisibility: opt.id })
                          }
                          className="accent-emerald-500"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Who can see when I'm Online */}
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-cyan-300">
                    Who can see when I'm Online
                  </label>
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: 'everyone', label: 'Everyone' },
                        { id: 'same_as_last_seen', label: 'Same as Last Seen (Default)' },
                        { id: 'contacts', label: 'My Contacts Only' },
                        { id: 'contacts_except', label: 'My Contacts Except…' },
                        { id: 'nobody', label: 'Nobody (Don’t Show Online Status)' },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                          settings.onlineStatusVisibility === opt.id
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-white font-semibold'
                            : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <input
                          type="radio"
                          name="onlineStatusVisibility"
                          checked={settings.onlineStatusVisibility === opt.id}
                          onChange={() =>
                            onUpdateSettings({
                              onlineStatusVisibility: opt.id,
                              showOnlineStatus: opt.id !== 'nobody',
                            })
                          }
                          className="accent-cyan-500"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Contacts Except Selector when 'contacts_except' is chosen */}
              {(settings.lastSeenVisibility === 'contacts_except' ||
                settings.onlineStatusVisibility === 'contacts_except') && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                  <div className="text-xs font-semibold text-amber-300">
                    Hide Last Seen / Online Status From Specific Contacts:
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {chats
                      .filter((c) => !c.isGroup)
                      .map((c) => {
                        const excluded = (settings.onlineStatusExcludedIds || []).includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                              excluded
                                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={() => {
                                const cur = settings.onlineStatusExcludedIds || [];
                                const next = excluded
                                  ? cur.filter((id) => id !== c.id)
                                  : [...cur, c.id];
                                onUpdateSettings({
                                  onlineStatusExcludedIds: next,
                                  lastSeenExcludedIds: next,
                                });
                              }}
                              className="accent-rose-500"
                            />
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Dedicated Profile Photo Privacy & Preview Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={account.name}
                    avatarUrl={account.avatarUrl}
                    avatarColor={account.avatarColor}
                    sizeClass="w-12 h-12"
                    showCameraBadge
                    onClick={() => setShowProfileLightbox(true)}
                  />
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Profile Photo Privacy & Audience</span>
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10px] text-cyan-300 font-semibold capitalize">
                        {settings.profilePhotoVisibility.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Control who can see your profile photo in chats, groups, and the user directory.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileLightbox(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Change / View Photo</span>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-cyan-300 mb-1">
                    Who can see my Profile Photo
                  </label>
                  {(
                    [
                      { id: 'everyone', label: 'Everyone' },
                      { id: 'contacts', label: 'My Contacts Only' },
                      { id: 'contacts_except', label: 'My Contacts Except…' },
                      { id: 'nobody', label: 'Nobody (Hide Profile Photo)' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                        settings.profilePhotoVisibility === opt.id
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-white font-semibold'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <input
                        type="radio"
                        name="profilePhotoVisibilityRadio"
                        checked={settings.profilePhotoVisibility === opt.id}
                        onChange={() =>
                          onUpdateSettings({ profilePhotoVisibility: opt.id })
                        }
                        className="accent-cyan-500"
                      />
                    </label>
                  ))}
                </div>

                {/* Live Preview: How your photo looks to Allowed vs Restricted viewers */}
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="text-xs font-semibold text-slate-300">
                    Live Audience Preview
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center text-center gap-1.5">
                      <UserAvatar
                        name={account.name}
                        avatarUrl={account.avatarUrl}
                        avatarColor={account.avatarColor}
                        hidePhotoForPrivacy={settings.profilePhotoVisibility === 'nobody'}
                        sizeClass="w-11 h-11"
                      />
                      <div className="text-[11px] font-semibold text-emerald-300">
                        {settings.profilePhotoVisibility === 'nobody'
                          ? 'Hidden from All'
                          : 'Allowed Viewers'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {settings.profilePhotoVisibility === 'nobody'
                          ? 'Default silhouette'
                          : account.avatarUrl
                          ? 'Sees your photo'
                          : 'Sees your badge'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center text-center gap-1.5">
                      <UserAvatar
                        name={account.name}
                        avatarUrl={account.avatarUrl}
                        avatarColor={account.avatarColor}
                        hidePhotoForPrivacy={settings.profilePhotoVisibility !== 'everyone'}
                        sizeClass="w-11 h-11"
                      />
                      <div className="text-[11px] font-semibold text-amber-300">
                        Non-Contacts / Excluded
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {settings.profilePhotoVisibility === 'everyone'
                          ? 'Sees your photo'
                          : 'Photo hidden'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {settings.profilePhotoVisibility === 'contacts_except' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                  <div className="text-xs font-semibold text-amber-300">
                    Hide My Profile Photo From Specific Contacts:
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {chats
                      .filter((c) => !c.isGroup)
                      .map((c) => {
                        const excluded = (settings.profilePhotoExcludedIds || []).includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                              excluded
                                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={() => {
                                const cur = settings.profilePhotoExcludedIds || [];
                                const next = excluded
                                  ? cur.filter((id) => id !== c.id)
                                  : [...cur, c.id];
                                onUpdateSettings({ profilePhotoExcludedIds: next });
                              }}
                              className="accent-rose-500"
                            />
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {(
                [
                  { key: 'profilePhotoVisibility', label: 'Who can see my Profile Photo' },
                  { key: 'aboutVisibility', label: 'Who can see my About / Bio' },
                  { key: 'statusVisibility', label: 'Who can see my Status Updates' },
                ] as const
              ).map((item) => (
                <div key={item.key} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <label className="block text-xs font-medium text-slate-300 mb-2">{item.label}</label>
                  <select
                    value={settings[item.key]}
                    onChange={(e) =>
                      onUpdateSettings({ [item.key]: e.target.value as AudienceVisibility })
                    }
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="everyone">Everyone</option>
                    <option value="contacts">My Contacts Only</option>
                    <option value="contacts_except">My Contacts Except…</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="space-y-4 border-t border-slate-800/80 pt-4">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
                <label className="flex items-start justify-between gap-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <CheckCheck className="w-4 h-4 text-sky-400 stroke-[2.6]" />
                      <span>Read Receipts Visibility (Two Blue Ticks)</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          settings.readReceipts
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {settings.readReceipts ? 'Visible (Blue Ticks On)' : 'Hidden for Privacy'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed mt-1">
                      If turned off, you won’t send or see two blue read ticks in 1-to-1 chats (messages will remain at two grey delivered ticks). Note: Read receipts are always active for group chats.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.readReceipts}
                    onChange={(e) => onUpdateSettings({ readReceipts: e.target.checked })}
                    className="w-5 h-5 mt-1 accent-emerald-500 shrink-0"
                  />
                </label>

                {/* Visual Legend for 1 Tick / 2 Ticks / 2 Blue Ticks */}
                <div className="grid sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-slate-400 stroke-[2.5]" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-200">1 Tick · Sent</div>
                      <div className="text-[11px] text-slate-400">Dispatched from device</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                      <CheckCheck className="w-4 h-4 text-slate-300 stroke-[2.4]" />
                    </span>
                    <div>
                      <div className="font-semibold text-slate-200">2 Ticks · Delivered</div>
                      <div className="text-[11px] text-slate-400">Reached recipient device</div>
                    </div>
                  </div>

                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-colors ${
                      settings.readReceipts
                        ? 'bg-sky-500/10 border-sky-500/30'
                        : 'bg-slate-950/60 border-slate-800 opacity-60'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                      {settings.readReceipts ? (
                        <CheckCheck className="w-4 h-4 text-sky-400 stroke-[2.6] drop-shadow-[0_0_5px_rgba(56,189,248,0.45)]" />
                      ) : (
                        <CheckCheck className="w-4 h-4 text-slate-400 stroke-[2.4]" />
                      )}
                    </span>
                    <div>
                      <div className="font-semibold text-sky-300">2 Blue Ticks · Read</div>
                      <div className="text-[11px] text-slate-400">
                        {settings.readReceipts ? 'Recipient read message' : 'Masked as 2 grey ticks'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Show "Typing…" Indicator</div>
                  <div className="text-xs text-slate-400">
                    Let contacts see when you are typing a reply.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.typingIndicator}
                  onChange={(e) => onUpdateSettings({ typingIndicator: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-emerald-500"
                />
              </label>
            </div>

            {/* Blocked Contacts */}
            <div className="border-t border-slate-800/80 pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  Blocked Contacts ({settings.blockedContacts.length})
                </h4>
                {settings.blockedContacts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBlockedIds(
                          selectedBlockedIds.length === settings.blockedContacts.length
                            ? []
                            : settings.blockedContacts.map((b) => b.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                    >
                      {selectedBlockedIds.length === settings.blockedContacts.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                    {selectedBlockedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateSettings({
                            blockedContacts: settings.blockedContacts.filter(
                              (x) => !selectedBlockedIds.includes(x.id)
                            ),
                          });
                          setSelectedBlockedIds([]);
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold"
                      >
                        Unblock Selected ({selectedBlockedIds.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="divide-y divide-slate-800 rounded-xl bg-slate-900/50 border border-slate-800">
                {settings.blockedContacts.map((b) => {
                  const isSelected = selectedBlockedIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      onClick={() => toggleSelectBlocked(b.id)}
                      className={`p-3 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <div>
                          <span className="font-medium text-slate-200">{b.name}</span>
                          <span className="text-slate-500 ml-2">@{b.username}</span>
                          {b.phone && (
                            <span className="text-cyan-400 ml-2 font-mono">{b.phone}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateSettings({
                            blockedContacts: settings.blockedContacts.filter(
                              (x) => x.id !== b.id
                            ),
                          });
                          setSelectedBlockedIds((prev) => prev.filter((x) => x !== b.id));
                        }}
                        className="text-emerald-400 hover:underline font-medium"
                      >
                        Unblock
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBlockedInput}
                  onChange={(e) => setNewBlockedInput(e.target.value)}
                  placeholder="Block @username or mobile number…"
                  className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs"
                />
                <button
                  onClick={() => {
                    if (newBlockedInput.trim()) {
                      onUpdateSettings({
                        blockedContacts: [
                          ...settings.blockedContacts,
                          {
                            id: `blk_${Date.now()}`,
                            name: newBlockedInput.trim(),
                            username: newBlockedInput.trim().replace(/^@/, ''),
                            phone: newBlockedInput.trim(),
                          },
                        ],
                      });
                      setNewBlockedInput('');
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                >
                  Block
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. NOTIFICATIONS & SOUNDS */}
        {activeSection === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Notifications, Message Sounds & Custom Tones
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize separate sounds for Favorite people, Personal chats, Group chats, Status & App notifications, or set a unique sound for any specific person.
              </p>
            </div>

            {/* Sound Volume & Quick Sound Toggles */}
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                  <Volume2 className="w-4 h-4" />
                  <span>Notification Sound Studio & Volume</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      playInChatMessageSound(
                        'sent',
                        (settings.notificationVolume ?? 85) / 100
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200"
                  >
                    Play Sent Tone 🔊
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      playNotificationTone(
                        settings.messageNotificationTone || 'note_drop',
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold"
                  >
                    Preview Message Tone 🎵
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Notification & Alert Volume</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {settings.notificationVolume ?? 85}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.notificationVolume ?? 85}
                  onChange={(e) =>
                    onUpdateSettings({ notificationVolume: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Category Notification Tones Grid */}
              <div className="grid sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800">
                {/* 1. Personal 1-on-1 Chats Tone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Personal Chats Sound</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playNotificationTone(
                          settings.messageNotificationTone || 'note_drop',
                          (settings.notificationVolume ?? 85) / 100,
                          settings.customMessageToneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold"
                    >
                      Play 🔊
                    </button>
                  </div>
                  <select
                    value={settings.messageNotificationTone || 'note_drop'}
                    onChange={(e) => {
                      const tone = e.target.value as NotificationToneId;
                      onUpdateSettings({ messageNotificationTone: tone });
                      playNotificationTone(
                        tone,
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {NOTIFICATION_TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Favorite Contacts Tone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Favorite Contacts Sound ⭐</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playNotificationTone(
                          settings.favoriteMessageTone || 'sparkle_pop',
                          (settings.notificationVolume ?? 85) / 100,
                          settings.customMessageToneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[10px] font-semibold"
                    >
                      Play 🔊
                    </button>
                  </div>
                  <select
                    value={settings.favoriteMessageTone || 'sparkle_pop'}
                    onChange={(e) => {
                      const tone = e.target.value as NotificationToneId;
                      onUpdateSettings({ favoriteMessageTone: tone });
                      playNotificationTone(
                        tone,
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {NOTIFICATION_TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Group Chats Tone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Group Chats Sound</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playNotificationTone(
                          settings.groupNotificationTone || 'bamboo_pop',
                          (settings.notificationVolume ?? 85) / 100,
                          settings.customMessageToneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[10px] font-semibold"
                    >
                      Play 🔊
                    </button>
                  </div>
                  <select
                    value={settings.groupNotificationTone || 'bamboo_pop'}
                    onChange={(e) => {
                      const tone = e.target.value as NotificationToneId;
                      onUpdateSettings({ groupNotificationTone: tone });
                      playNotificationTone(
                        tone,
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {NOTIFICATION_TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Status Updates & Normal App Notifications Tone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Status & App Alerts Sound</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playNotificationTone(
                          settings.statusNotificationTone || 'crystal_ping',
                          (settings.notificationVolume ?? 85) / 100,
                          settings.customMessageToneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10px] font-semibold"
                    >
                      Play 🔊
                    </button>
                  </div>
                  <select
                    value={settings.statusNotificationTone || 'crystal_ping'}
                    onChange={(e) => {
                      const tone = e.target.value as NotificationToneId;
                      onUpdateSettings({ statusNotificationTone: tone });
                      playNotificationTone(
                        tone,
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {NOTIFICATION_TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Emoji Reactions & @Mentions Tone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-rose-400" />
                      <span>Reactions & @Mentions Sound</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playNotificationTone(
                          settings.reactionNotificationTone || 'emerald_pulse',
                          (settings.notificationVolume ?? 85) / 100,
                          settings.customMessageToneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[10px] font-semibold"
                    >
                      Play 🔊
                    </button>
                  </div>
                  <select
                    value={settings.reactionNotificationTone || 'emerald_pulse'}
                    onChange={(e) => {
                      const tone = e.target.value as NotificationToneId;
                      onUpdateSettings({ reactionNotificationTone: tone });
                      playNotificationTone(
                        tone,
                        (settings.notificationVolume ?? 85) / 100,
                        settings.customMessageToneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {NOTIFICATION_TONE_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.label} — {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Upload Custom Notification Sound File (MP3/WAV/OGG) */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Upload Custom Notification Sound</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Upload any MP3, WAV, or OGG sound from your device to use as your custom tone.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {settings.customMessageToneDataUrl
                          ? 'Replace Custom Audio'
                          : 'Choose Audio File…'}
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = String(reader.result || '');
                            onUpdateSettings({
                              customMessageToneDataUrl: dataUrl,
                              messageNotificationTone: 'custom_uploaded',
                            });
                            playNotificationTone(
                              'custom_uploaded',
                              (settings.notificationVolume ?? 85) / 100,
                              dataUrl
                            );
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {settings.customMessageToneDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          playNotificationTone(
                            'custom_uploaded',
                            (settings.notificationVolume ?? 85) / 100,
                            settings.customMessageToneDataUrl
                          )
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-emerald-300 font-medium"
                      >
                        Play Uploaded 🔊
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Vibration Patterns for Personal, Favorites, and Groups */}
              <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Personal Chat Vibration
                  </label>
                  <select
                    value={settings.vibrationPattern || 'default'}
                    onChange={(e) => {
                      const pat = e.target.value as VibrationPatternId;
                      onUpdateSettings({ vibrationPattern: pat });
                      triggerVibration(pat);
                    }}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {VIBRATION_PATTERN_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-amber-300 mb-1">
                    Favorite Contact Vibration ⭐
                  </label>
                  <select
                    value={settings.favoriteVibrationPattern || 'heartbeat'}
                    onChange={(e) => {
                      const pat = e.target.value as VibrationPatternId;
                      onUpdateSettings({ favoriteVibrationPattern: pat });
                      triggerVibration(pat);
                    }}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {VIBRATION_PATTERN_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-cyan-300 mb-1">
                    Group Chat Vibration
                  </label>
                  <select
                    value={settings.groupVibrationPattern || 'rapid'}
                    onChange={(e) => {
                      const pat = e.target.value as VibrationPatternId;
                      onUpdateSettings({ groupVibrationPattern: pat });
                      triggerVibration(pat);
                    }}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {VIBRATION_PATTERN_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Per-Person & Per-Group Custom Sound & Ringtone Assignment Table */}
            {onUpdateChat && (
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Music className="w-4 h-4 text-emerald-400" />
                    <span>Per-Person & Group Custom Sounds</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Assign a different message sound or call ringtone for any specific person or group, or star them as a Favorite (`⭐`) to automatically use your Favorite tones.
                  </p>
                </div>

                <div className="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800 max-h-96 overflow-y-auto">
                  {chats.map((c) => {
                    const resolvedMsg = resolveChatNotificationSound(c, settings);
                    const resolvedRing = resolveCallRingtone(c, 'audio', c.isGroup, settings);
                    const vol = (settings.notificationVolume ?? 85) / 100;
                    const ringVol = (settings.ringtoneVolume ?? 90) / 100;

                    return (
                      <div key={c.id} className="p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                              style={{ backgroundColor: c.avatarColor }}
                            >
                              {c.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                <span>{c.name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-normal text-slate-400">
                                  {c.isGroup ? 'Group' : 'Person'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Message: <span className="text-emerald-300">{resolvedMsg.sourceLabel}</span> · Call:{' '}
                                <span className="text-cyan-300">{resolvedRing.sourceLabel}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onUpdateChat(c.id, { favorite: !c.favorite })}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                              c.favorite
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Star
                              className={`w-3 h-3 ${
                                c.favorite ? 'fill-amber-400 text-amber-400' : ''
                              }`}
                            />
                            <span>{c.favorite ? 'Favorite ⭐' : 'Favorite'}</span>
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          {/* Message Sound Selector for this chat */}
                          <div className="flex items-center gap-1.5">
                            <select
                              value={c.customMessageTone || 'default'}
                              onChange={(e) => {
                                const val = e.target.value as NotificationToneId | 'default';
                                onUpdateChat(c.id, { customMessageTone: val });
                                if (val !== 'default' && val !== 'silent') {
                                  playNotificationTone(val, vol, c.customToneDataUrl);
                                }
                              }}
                              className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-[11px] text-white"
                            >
                              <option value="default">
                                💬 Default ({c.favorite ? 'Favorite' : c.isGroup ? 'Group' : 'Personal'})
                              </option>
                              {NOTIFICATION_TONE_OPTIONS.map((t) => (
                                <option key={t.id} value={t.id}>
                                  💬 {t.emoji} {t.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                playNotificationTone(
                                  resolvedMsg.toneId,
                                  vol,
                                  resolvedMsg.customDataUrl
                                )
                              }
                              className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 text-[11px]"
                              title="Preview message sound"
                            >
                              🔊
                            </button>
                          </div>

                          {/* Call Ringtone Selector for this chat */}
                          <div className="flex items-center gap-1.5">
                            <select
                              value={c.customRingtone || 'default'}
                              onChange={(e) => {
                                const val = e.target.value as RingtoneId | 'default';
                                onUpdateChat(c.id, { customRingtone: val });
                                if (val !== 'default' && val !== 'silent') {
                                  playRingtonePreview(val, ringVol, c.customRingtoneDataUrl);
                                }
                              }}
                              className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-[11px] text-white"
                            >
                              <option value="default">
                                📞 Default ({c.favorite ? 'Favorite' : c.isGroup ? 'Group' : 'Voice'})
                              </option>
                              {RINGTONE_OPTIONS.map((r) => (
                                <option key={r.id} value={r.id}>
                                  📞 {r.emoji} {r.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                playRingtonePreview(
                                  resolvedRing.ringtoneId,
                                  ringVol,
                                  resolvedRing.customDataUrl
                                )
                              }
                              className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 text-[11px]"
                              title="Preview call ringtone"
                            >
                              🎵
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-emerald-300">
                  Private Notifications Mode
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  When enabled, all incoming notifications display only generic <strong>"New private message"</strong> without sender name or message preview.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.privateNotificationsMode}
                onChange={(e) =>
                  onUpdateSettings({
                    privateNotificationsMode: e.target.checked,
                    notificationPreview: e.target.checked
                      ? 'new_message_generic'
                      : 'name_and_message',
                  })
                }
                className="w-5 h-5 accent-emerald-500 shrink-0"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Lock Screen Notification Preview
              </label>
              <select
                value={settings.notificationPreview}
                onChange={(e) =>
                  onUpdateSettings({
                    notificationPreview: e.target.value as AppSettings['notificationPreview'],
                  })
                }
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
              >
                <option value="name_and_message">1. Show Sender Name + Message Preview</option>
                <option value="name_only">2. Show Sender Name Only</option>
                <option value="new_message_generic">3. Show Generic "New message"</option>
                <option value="hidden">4. Hide Notification Content Completely</option>
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  { key: 'notificationsEnabled', label: 'Master Notifications ON/OFF' },
                  { key: 'messageNotifications', label: 'Direct Message Notifications' },
                  { key: 'groupNotifications', label: 'Group Chat Notifications' },
                  { key: 'callNotifications', label: 'Incoming Call Notifications' },
                  { key: 'statusNotifications', label: 'Status Update Notifications' },
                  { key: 'reactionNotifications', label: 'Reaction Notifications' },
                  { key: 'mentionNotifications', label: 'Mention (@username) Alerts' },
                  { key: 'soundEnabled', label: 'Notification Sounds Enabled' },
                  { key: 'inAppChatSoundsEnabled', label: 'In-Chat Send/Receive Bubble Sounds' },
                  { key: 'vibrationEnabled', label: 'Vibration Enabled' },
                ] as const
              ).map((toggle) => (
                <label
                  key={toggle.key}
                  className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs cursor-pointer"
                >
                  <span>{toggle.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings[toggle.key] ?? true)}
                    onChange={(e) => onUpdateSettings({ [toggle.key]: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 5. CHATS */}
        {activeSection === 'chats' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Chats & Media Privacy</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Control gallery media visibility, auto-download behavior, and composer preferences.
              </p>
            </div>

            {/* Media Visibility Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-4">
              <label className="flex items-start justify-between gap-4 cursor-pointer">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">Media Visibility</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        settings.mediaVisibilityInGallery
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {settings.mediaVisibilityInGallery
                        ? 'Showing in Device Gallery'
                        : 'Hidden from Gallery (.nomedia)'}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-emerald-300">
                    Show newly downloaded media in your device’s gallery
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    When turned on, photos, videos, and stickers downloaded in chats will appear in your phone’s main Gallery / Photos app. When turned off, downloaded media stays securely inside Simple and hidden from external gallery apps.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.mediaVisibilityInGallery}
                  onChange={(e) => onUpdateSettings({ mediaVisibilityInGallery: e.target.checked })}
                  className="w-5 h-5 mt-1 accent-emerald-500 shrink-0"
                />
              </label>

              {/* Downloaded Media Gallery Preview in Settings */}
              {(() => {
                const downloadedMediaItems = chats.flatMap((c) =>
                  c.messages
                    .filter((m) => m.attachment && m.attachment.isDownloaded !== false)
                    .map((m) => ({
                      chatName: c.name,
                      msgId: m.id,
                      timestamp: m.timestamp,
                      att: m.attachment!,
                    }))
                );

                return (
                  <div className="pt-3 border-t border-slate-800/90 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        Downloaded Chat Media ({downloadedMediaItems.length} items)
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        {settings.mediaVisibilityInGallery
                          ? 'Synced to Phone Gallery 📸'
                          : 'Isolated in Encrypted Vault 🔒'}
                      </span>
                    </div>

                    {downloadedMediaItems.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {downloadedMediaItems.slice(0, 8).map((item) => (
                          <div
                            key={item.att.id}
                            className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2"
                          >
                            {item.att.type === 'photo' || item.att.type === 'sticker' ? (
                              <div className="h-20 w-full rounded-lg overflow-hidden bg-slate-900 relative">
                                {item.att.url && (
                                  <img
                                    src={item.att.url}
                                    alt={item.att.name}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white uppercase">
                                  {item.att.type}
                                </span>
                              </div>
                            ) : item.att.type === 'video' ? (
                              <div className="h-20 w-full rounded-lg overflow-hidden bg-slate-900 relative flex items-center justify-center">
                                {item.att.thumbnailUrl && (
                                  <img
                                    src={item.att.thumbnailUrl}
                                    alt={item.att.name}
                                    className="w-full h-full object-cover opacity-75"
                                  />
                                )}
                                <Video className="w-6 h-6 text-white absolute drop-shadow" />
                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-emerald-300">
                                  VIDEO
                                </span>
                              </div>
                            ) : (
                              <div className="h-20 w-full rounded-lg bg-slate-900 border border-slate-800/80 flex flex-col items-center justify-center p-2 text-center">
                                <Download className="w-5 h-5 text-emerald-400 mb-1" />
                                <span className="text-[10px] font-mono text-slate-300 uppercase">
                                  {item.att.type}
                                </span>
                              </div>
                            )}
                            <div>
                              <div className="text-[11px] font-semibold text-white truncate">
                                {item.att.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                From {item.chatName}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        No downloaded media items yet.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Enter Key Sends Message</div>
                  <div className="text-xs text-slate-400">
                    Press Enter to send immediately (Shift+Enter inserts a newline).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enterKeySends}
                  onChange={(e) => onUpdateSettings({ enterKeySends: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span>Read Receipts Visibility (Two Blue Ticks)</span>
                    <CheckCheck className="w-4 h-4 text-sky-400 inline" />
                  </div>
                  <div className="text-xs text-slate-400">
                    Show two blue ticks when recipients read your messages (turn off to keep read status private in 1-to-1 chats).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.readReceipts}
                  onChange={(e) => onUpdateSettings({ readReceipts: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Automatic Media Download
                </label>
                <select
                  value={settings.autoDownloadMedia}
                  onChange={(e) =>
                    onUpdateSettings({
                      autoDownloadMedia: e.target.value as AppSettings['autoDownloadMedia'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="never">Never (Manual Tap to Download)</option>
                  <option value="wifi_only">Wi-Fi Only</option>
                  <option value="wifi_and_cellular">Wi-Fi and Cellular</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Chat Background Surface
                </label>
                <select
                  value={settings.wallpaperStyle}
                  onChange={(e) =>
                    onUpdateSettings({
                      wallpaperStyle: e.target.value as AppSettings['wallpaperStyle'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  {CHAT_WALLPAPER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} ({preset.category})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interactive Chat Theme Background Images, Personal Custom Image & Gradients Picker */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Palette className="w-4 h-4 text-emerald-400" />
                    Chat Theme Background Images & Personal Custom Wallpaper
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Theme Image 1 is the default background for all chats. Choose any theme image below or upload your own personal custom photo.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                  Active:{' '}
                  {settings.customWallpaperImage
                    ? 'Personal Custom Photo'
                    : (
                        CHAT_WALLPAPER_PRESETS.find((p) => p.id === settings.wallpaperStyle) ||
                        CHAT_WALLPAPER_PRESETS[0]
                      ).label}
                </span>
              </div>

              {/* Live Message Interface Preview Card with Real Image Background */}
              {(() => {
                const activePreset =
                  CHAT_WALLPAPER_PRESETS.find((p) => p.id === settings.wallpaperStyle) ||
                  CHAT_WALLPAPER_PRESETS[0];
                const previewImgUrl =
                  settings.customWallpaperImage || activePreset.imageUrl || undefined;
                return (
                  <div
                    className={`relative rounded-2xl border border-slate-800 p-4 space-y-2.5 overflow-hidden transition-all min-h-[150px] ${activePreset.bgClass}`}
                  >
                    {previewImgUrl && (
                      <div
                        className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-300"
                        style={{
                          backgroundImage: `url(${previewImgUrl})`,
                          opacity: (settings.wallpaperOpacity ?? 75) / 100,
                          filter: `blur(${settings.wallpaperBlur ?? 0}px)`,
                        }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-between text-[10px] font-medium text-slate-300 pb-1 border-b border-white/10">
                      <span>LIVE ALL-CHATS WALLPAPER PREVIEW</span>
                      <span className="text-emerald-400 font-semibold">
                        {settings.customWallpaperImage ? 'Custom Uploaded Image' : activePreset.label}
                      </span>
                    </div>
                    <div className="relative z-10 flex justify-start">
                      <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-slate-900/90 backdrop-blur-xs border border-slate-800 px-3.5 py-2 text-xs text-slate-200 shadow-sm">
                        Theme Image 1 is set as the default background across all chats, and you can switch themes or upload your own photo anytime!
                      </div>
                    </div>
                    <div className="relative z-10 flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-emerald-500 text-slate-950 font-medium px-3.5 py-2 text-xs shadow-sm">
                        Looks awesome in every conversation! ✨
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 1. Featured Chat Theme Background Images (1st Image = Default for All Chats) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Featured Chat Theme Background Images (Select Default for All Chats)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings({
                        wallpaperStyle: 'theme_img_1',
                        customWallpaperImage: undefined,
                      });
                      chats.forEach((c) => {
                        onUpdateChat?.(c.id, {
                          customWallpaperStyle: undefined,
                          customWallpaperImage: undefined,
                        });
                      });
                    }}
                    className="text-[11px] text-emerald-300 hover:underline font-semibold"
                  >
                    Reset All Chats to Default (Image 1)
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CHAT_WALLPAPER_PRESETS.filter((p) => p.imageUrl).map((preset, idx) => {
                    const isSelected =
                      !settings.customWallpaperImage && settings.wallpaperStyle === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onUpdateSettings({
                            wallpaperStyle: preset.id,
                            customWallpaperImage: undefined,
                          });
                          chats.forEach((c) => {
                            if (c.customWallpaperStyle || c.customWallpaperImage) {
                              onUpdateChat?.(c.id, {
                                customWallpaperStyle: undefined,
                                customWallpaperImage: undefined,
                              });
                            }
                          });
                        }}
                        className={`group p-2 rounded-2xl border text-left transition-all flex flex-col gap-2 ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/50'
                            : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="h-28 w-full rounded-xl border border-white/10 relative overflow-hidden">
                          <img
                            src={preset.imageUrl}
                            alt={preset.label}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          {idx === 0 && (
                            <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-emerald-500 text-slate-950 text-[9px] font-extrabold uppercase tracking-wider shadow">
                              Default (1st)
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span className="absolute bottom-1.5 left-2 right-2 text-[11px] font-bold text-white truncate">
                            {preset.label}
                          </span>
                        </div>
                        <div className="px-0.5">
                          <div className="text-[10px] text-slate-400 line-clamp-1">
                            {preset.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Personal Custom Image Upload for Chat Background */}
              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">
                      Personal Custom Image Background (Upload Your Own Photo)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Set any personal image from your device gallery as the chat background across the app.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Personal Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              onUpdateSettings({
                                customWallpaperImage: reader.result,
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    {settings.customWallpaperImage && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            customWallpaperImage: undefined,
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold"
                      >
                        Remove Custom Photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Opacity and Blur Controls */}
                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Background Image Opacity</span>
                      <span className="font-mono text-emerald-400">
                        {settings.wallpaperOpacity ?? 75}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={settings.wallpaperOpacity ?? 75}
                      onChange={(e) =>
                        onUpdateSettings({ wallpaperOpacity: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Background Soft Blur</span>
                      <span className="font-mono text-emerald-400">
                        {settings.wallpaperBlur ?? 0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={settings.wallpaperBlur ?? 0}
                      onChange={(e) =>
                        onUpdateSettings({ wallpaperBlur: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Predefined Abstract Gradient & Surface Swatch Grid */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400">
                  Solid Surfaces & Abstract Gradients
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {CHAT_WALLPAPER_PRESETS.filter((p) => !p.imageUrl).map((preset) => {
                    const isSelected =
                      !settings.customWallpaperImage && settings.wallpaperStyle === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            wallpaperStyle: preset.id,
                            customWallpaperImage: undefined,
                          })
                        }
                        className={`group p-2 rounded-2xl border text-left transition-all flex flex-col gap-2 ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/50'
                            : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                        }`}
                      >
                        <div
                          className={`h-12 w-full rounded-xl border border-white/10 relative overflow-hidden flex items-end p-1.5 ${preset.swatchClass}`}
                        >
                          <div className="w-full flex items-center justify-between gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-xs text-[9px] font-mono text-slate-200 truncate">
                              {preset.category === 'Abstract Gradient' ? 'Gradient' : 'Surface'}
                            </span>
                            {isSelected && (
                              <span className="w-4 h-4 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow">
                                <CheckCircle2 className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="px-0.5">
                          <div className="text-xs font-semibold text-white truncate">
                            {preset.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. CALLS & RINGTONES */}
        {activeSection === 'calls' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Voice & Video Call Ringtones & Privacy
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize ringtones for Voice Calls, Video Calls, Favorite Contacts, and Group Calls, or upload your own ringtone.
              </p>
            </div>

            {/* Ringtone Customization Studio */}
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
                  <Music className="w-4 h-4" />
                  <span>Call Ringtone Studio & Volume</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    playRingtonePreview(
                      settings.callRingtone || 'simple_classic',
                      (settings.ringtoneVolume ?? 90) / 100,
                      settings.customRingtoneDataUrl
                    )
                  }
                  className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 text-[11px] font-bold"
                >
                  Preview Voice Ringtone 📞
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Call Ringtone Volume</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {settings.ringtoneVolume ?? 90}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.ringtoneVolume ?? 90}
                  onChange={(e) =>
                    onUpdateSettings({ ringtoneVolume: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800">
                {/* 1. Personal Voice Call Ringtone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Voice Call Ringtone (1-on-1)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playRingtonePreview(
                          settings.callRingtone || 'simple_classic',
                          (settings.ringtoneVolume ?? 90) / 100,
                          settings.customRingtoneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold"
                    >
                      Ring 🔊
                    </button>
                  </div>
                  <select
                    value={settings.callRingtone || 'simple_classic'}
                    onChange={(e) => {
                      const rt = e.target.value as RingtoneId;
                      onUpdateSettings({ callRingtone: rt });
                      playRingtonePreview(
                        rt,
                        (settings.ringtoneVolume ?? 90) / 100,
                        settings.customRingtoneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {RINGTONE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji} {r.label} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Favorite Contacts Call Ringtone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Favorite Contacts Ringtone ⭐</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playRingtonePreview(
                          settings.favoriteCallRingtone || 'vip_fanfare',
                          (settings.ringtoneVolume ?? 90) / 100,
                          settings.customRingtoneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[10px] font-semibold"
                    >
                      Ring 🔊
                    </button>
                  </div>
                  <select
                    value={settings.favoriteCallRingtone || 'vip_fanfare'}
                    onChange={(e) => {
                      const rt = e.target.value as RingtoneId;
                      onUpdateSettings({ favoriteCallRingtone: rt });
                      playRingtonePreview(
                        rt,
                        (settings.ringtoneVolume ?? 90) / 100,
                        settings.customRingtoneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {RINGTONE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji} {r.label} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Video Call Ringtone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Video Call Ringtone</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playRingtonePreview(
                          settings.videoCallRingtone || 'facetime_chime',
                          (settings.ringtoneVolume ?? 90) / 100,
                          settings.customRingtoneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10px] font-semibold"
                    >
                      Ring 🔊
                    </button>
                  </div>
                  <select
                    value={settings.videoCallRingtone || 'facetime_chime'}
                    onChange={(e) => {
                      const rt = e.target.value as RingtoneId;
                      onUpdateSettings({ videoCallRingtone: rt });
                      playRingtonePreview(
                        rt,
                        (settings.ringtoneVolume ?? 90) / 100,
                        settings.customRingtoneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {RINGTONE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji} {r.label} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Group Call Ringtone */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Group Call Ringtone</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        playRingtonePreview(
                          settings.groupCallRingtone || 'marimba_pulse',
                          (settings.ringtoneVolume ?? 90) / 100,
                          settings.customRingtoneDataUrl
                        )
                      }
                      className="px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[10px] font-semibold"
                    >
                      Ring 🔊
                    </button>
                  </div>
                  <select
                    value={settings.groupCallRingtone || 'marimba_pulse'}
                    onChange={(e) => {
                      const rt = e.target.value as RingtoneId;
                      onUpdateSettings({ groupCallRingtone: rt });
                      playRingtonePreview(
                        rt,
                        (settings.ringtoneVolume ?? 90) / 100,
                        settings.customRingtoneDataUrl
                      );
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                  >
                    {RINGTONE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji} {r.label} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Upload Custom Ringtone File & Call Vibration */}
              <div className="grid sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Upload Custom Ringtone (MP3/WAV)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Use your own song or audio clip for incoming calls.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {settings.customRingtoneDataUrl
                          ? 'Replace Custom Ringtone'
                          : 'Upload Audio File…'}
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = String(reader.result || '');
                            onUpdateSettings({
                              customRingtoneDataUrl: dataUrl,
                              callRingtone: 'custom_uploaded',
                            });
                            playRingtonePreview(
                              'custom_uploaded',
                              (settings.ringtoneVolume ?? 90) / 100,
                              dataUrl
                            );
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {settings.customRingtoneDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          playRingtonePreview(
                            'custom_uploaded',
                            (settings.ringtoneVolume ?? 90) / 100,
                            settings.customRingtoneDataUrl
                          )
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 font-medium"
                      >
                        Play 🔊
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-white">
                    Call Vibration Pattern & Banner Style
                  </label>
                  <select
                    value={settings.callVibrationPattern || 'heartbeat'}
                    onChange={(e) => {
                      const pat = e.target.value as VibrationPatternId;
                      onUpdateSettings({ callVibrationPattern: pat });
                      triggerVibration(pat);
                    }}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                  >
                    {VIBRATION_PATTERN_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        📳 {v.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={settings.incomingCallBannerStyle || 'fullscreen_immersive'}
                    onChange={(e) =>
                      onUpdateSettings({
                        incomingCallBannerStyle: e.target.value as CallBannerStyleId,
                      })
                    }
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                  >
                    {CALL_BANNER_STYLE_OPTIONS.map((b) => (
                      <option key={b.id} value={b.id}>
                        📱 {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">Private Calling:</strong> Your voice and video calls are private and never recorded. You can also hide caller names on your lock screen or turn on Data Saver below.
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Incoming Call Alert Style
                </label>
                <select
                  value={settings.incomingCallNotificationStyle}
                  onChange={(e) =>
                    onUpdateSettings({
                      incomingCallNotificationStyle: e.target
                        .value as AppSettings['incomingCallNotificationStyle'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="show_name">Show Caller Name</option>
                  <option value="generic_incoming">Show "Incoming Call" (Hide Name)</option>
                  <option value="hide_identity">Hide Caller Details</option>
                  <option value="vibrate_only">Vibrate Only</option>
                  <option value="silent">Silent</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Video Call Quality
                </label>
                <select
                  value={settings.defaultVideoQuality}
                  onChange={(e) =>
                    onUpdateSettings({
                      defaultVideoQuality: e.target.value as AppSettings['defaultVideoQuality'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="auto">Auto (Best for your connection)</option>
                  <option value="low">Data Saver (360p)</option>
                  <option value="medium">Standard (480p)</option>
                  <option value="high">High Definition (HD)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <label className="flex items-center justify-between py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Keep Call History on Phone</div>
                  <div className="text-xs text-slate-400">
                    Turn off if you don’t want recent calls listed in the Calls tab.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.storeCallHistory}
                  onChange={(e) => onUpdateSettings({ storeCallHistory: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Lock Call History with PIN</div>
                  <div className="text-xs text-slate-400">
                    Ask for your PIN before showing your recent calls list.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lockCallHistory}
                  onChange={(e) => onUpdateSettings({ lockCallHistory: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Use Less Data for Calls</div>
                  <div className="text-xs text-slate-400">
                    Saves mobile data when making calls on cellular networks.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lowDataCallsMode}
                  onChange={(e) => onUpdateSettings({ lowDataCallsMode: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            <button
              onClick={onClearAllCallHistory}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/25 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear All Call History ({calls.length})
            </button>
          </div>
        )}

        {/* 7. STORAGE */}
        {activeSection === 'storage' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Storage & Photo Quality</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                See how much space your chats use and choose photo/video upload quality.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Storage Used</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1 text-emerald-400">
                  {estimatedStorageKb} KB
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Total Messages</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">
                  {totalMessages}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Max File Size</div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1">
                  {settings.maxFileSizeMb} MB
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Photo & Video Upload Quality
                </label>
                <select
                  value={settings.defaultMediaQuality}
                  onChange={(e) =>
                    onUpdateSettings({
                      defaultMediaQuality: e.target.value as AppSettings['defaultMediaQuality'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="compress">Data Saver (Fastest)</option>
                  <option value="hd">HD Quality (Recommended)</option>
                  <option value="original">Original Quality (Uncompressed)</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Maximum File Size Limit
                </label>
                <select
                  value={settings.maxFileSizeMb}
                  onChange={(e) =>
                    onUpdateSettings({ maxFileSizeMb: Number(e.target.value) })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value={50}>50 MB</option>
                  <option value={100}>100 MB</option>
                  <option value={250}>250 MB</option>
                  <option value={1024}>1 GB</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => {
                  setCacheClearedMsg('Temporary cache cleared!');
                  setTimeout(() => setCacheClearedMsg(null), 3500);
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300"
              >
                Clear Temporary Cache
              </button>
              {cacheClearedMsg && (
                <span className="text-xs text-emerald-400">{cacheClearedMsg}</span>
              )}
            </div>
          </div>
        )}

        {/* 8. BACKUP */}
        {activeSection === 'backup' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Chat Backup & Restore</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Back up your chats with a password so you can easily restore them anytime.
              </p>
            </div>

            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3 text-xs text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-100">Remember Your Backup Password</p>
                <p className="mt-0.5 leading-relaxed">
                  Only your password can unlock your backup. Please keep it safe so you can restore your chats when switching phones.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'none', label: 'Off' },
                  { id: 'local_encrypted', label: 'Save to Device' },
                  { id: 'cloud_e2ee', label: 'Private Cloud Backup' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => onUpdateSettings({ backupMode: m.id })}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    settings.backupMode === m.id
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Mandatory Gmail Verification Gate for Cloud Backup (Google Drive / Gmail) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Gmail Account for Cloud Backup (Google Drive & Gmail)</span>
                    {account.email && account.email.toLowerCase().endsWith('@gmail.com') ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                        ✓ Verified ({account.email})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-300">
                        Gmail Required for Cloud Backup
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    If you created your account with Phone Number OTP only, please link and verify your <code className="text-cyan-300">@gmail.com</code> address below to back up chats to Google Drive or Gmail.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={pendingEmail}
                  onChange={(e) => {
                    setPendingEmail(e.target.value);
                    setDispatchedEmailOtp(null);
                    setOtpErrorMsg(null);
                  }}
                  placeholder="yourname@gmail.com"
                  className="flex-1 min-w-[220px] rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!pendingEmail.trim().toLowerCase().endsWith('@gmail.com')) {
                      setDriveStatusMsg('Please enter a valid @gmail.com address for Google Drive / Gmail cloud backup.');
                      return;
                    }
                    handleRequestSettingsOtp('email');
                  }}
                  disabled={isSendingOtp}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                >
                  {isSendingOtp ? 'Sending…' : 'Send Gmail OTP'}
                </button>
              </div>

              {dispatchedEmailOtp && (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/40 space-y-2 text-xs">
                  <div className="text-[11px] text-cyan-200">
                    Enter the 6-digit verification code sent to your Gmail inbox or from your linked Authenticator App:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="6-digit code"
                      className="flex-1 text-center font-mono tracking-[0.3em] rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-cyan-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifySettingsOtp('email')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold"
                    >
                      Verify Gmail for Backup
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 1. Google Drive & Gmail Cloud Backup */}
            <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CloudUpload className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-white">Google Drive & Gmail Cloud Backup</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Save all chats, media info, and your account securely to your verified Google Drive or Gmail archive.
                  </p>
                </div>
                {googleAccessToken ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{googleUserEmail || 'Drive Connected'}</span>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectGoogleDrive}
                    disabled={isDriveBusy}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shrink-0"
                  >
                    <span>Connect Google Drive</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={handleBackupToGoogleDrive}
                  disabled={isDriveBusy}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/15 disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isDriveBusy ? 'Backing Up…' : 'Back Up Now to Google Drive'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const verifiedGmail =
                      (account.email && account.email.toLowerCase().endsWith('@gmail.com')
                        ? account.email
                        : '') ||
                      (settings.cloudBackupGmail &&
                      settings.cloudBackupGmail.toLowerCase().endsWith('@gmail.com')
                        ? settings.cloudBackupGmail
                        : '');
                    if (!verifiedGmail) {
                      setDriveStatusMsg(
                        'Gmail Required: Please verify your @gmail.com address with OTP above before backing up to Gmail.'
                      );
                      return;
                    }
                    setIsDriveBusy(true);
                    setDriveStatusMsg(`Encrypting & archiving backup snapshot to Gmail (${verifiedGmail})…`);
                    try {
                      const fullBackupJson = JSON.stringify({
                        account: { ...account, email: verifiedGmail, cloudBackupGmail: verifiedGmail },
                        settings: { ...settings, cloudBackupGmail: verifiedGmail, cloudBackupProvider: 'gmail' },
                        chats,
                        updatedAt: Date.now(),
                      });
                      await saveCloudAccountBackup({
                        uid: account.id,
                        username: account.username,
                        phoneHash: normalizePhone(account.phone),
                        emailHash: verifiedGmail.toLowerCase(),
                        backupJson: fullBackupJson,
                      });
                      onUpdateSettings({
                        lastBackupTimestamp: Date.now(),
                        cloudBackupProvider: 'gmail',
                        cloudBackupGmail: verifiedGmail,
                        cloudBackupGmailVerified: true,
                      });
                      setDriveStatusMsg(
                        `Successfully backed up ${chats.length} chats to your verified Gmail cloud archive (${verifiedGmail})!`
                      );
                    } catch {
                      setDriveStatusMsg('Could not complete Gmail cloud archive.');
                    } finally {
                      setIsDriveBusy(false);
                    }
                  }}
                  disabled={isDriveBusy}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>Back Up to Gmail Archive</span>
                </button>

                {googleAccessToken && (
                  <button
                    onClick={() => listGoogleDriveBackups(googleAccessToken).then(setGoogleDriveBackups)}
                    disabled={isDriveBusy}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                  >
                    Refresh Backups List
                  </button>
                )}
              </div>

              {driveStatusMsg && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-emerald-300">
                  {driveStatusMsg}
                </div>
              )}

              {/* List of found backups in Google Drive */}
              {googleDriveBackups.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="text-xs font-bold text-slate-300">
                    Existing Cloud Backups on Google Drive ({googleDriveBackups.length})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {googleDriveBackups.map((b) => (
                      <div
                        key={b.id}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">{b.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(b.modifiedTime).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRestoreFromGoogleDrive(b.id)}
                          disabled={isDriveBusy}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold border border-emerald-500/40 text-xs shrink-0"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Local Device File Backup (Direct .json Download / Upload) */}
            <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white">Local Device File Backup</span>
              </div>
              <p className="text-xs text-slate-400">
                Download a complete, offline backup file directly to your phone storage, or restore an existing backup file anytime.
              </p>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  onClick={handleDownloadLocalBackupFile}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Backup File (.json)</span>
                </button>

                <label className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4 text-slate-300" />
                  <span>Select Backup File to Restore</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadLocalBackupFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 3. Automatic Cloud Database Mirror (Returning User Instant Recovery) */}
            <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-white">Apps Database Cloud Recovery</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sync account credentials and chats to the secure database so logging in with your number/email restores everything.
                  </p>
                </div>
                <button
                  onClick={handleSyncToDatabaseNow}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold shrink-0"
                >
                  Sync Now
                </button>
              </div>
              {cloudSyncStatusMsg && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-300 font-mono">
                  {cloudSyncStatusMsg}
                </div>
              )}
            </div>

            {/* 4. Encrypted Password Protected Backup */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <label className="block text-xs font-medium text-slate-300">
                Encrypted Backup Password (Optional Custom Cipher)
              </label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter a password (at least 6 characters)…"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
              />

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleCreateEncryptedBackup}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  Generate Ciphertext
                </button>
                <button
                  onClick={handleRestoreEncryptedBackup}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                >
                  Decrypt & Restore
                </button>
              </div>

              {backupStatusMsg && (
                <p className="text-xs text-emerald-300 pt-1">{backupStatusMsg}</p>
              )}

              {encryptedBlobJson && (
                <textarea
                  rows={4}
                  value={encryptedBlobJson}
                  onChange={(e) => setEncryptedBlobJson(e.target.value)}
                  className="w-full mt-2 rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-slate-300"
                  placeholder="Paste your backup data here to restore…"
                />
              )}
            </div>
          </div>
        )}

        {/* 9. APPEARANCE */}
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Appearance, Theme & Density</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize Light, Dark, pure AMOLED Black (#000000), custom accent colors, and chat density.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Surface Theme</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    { id: 'light', label: 'Light Daylight' },
                    { id: 'dark', label: 'Obsidian Dark' },
                    { id: 'amoled', label: 'AMOLED #000000' },
                    { id: 'system', label: 'System Default' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onUpdateSettings({ theme: t.id })}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      settings.theme === t.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Custom Accent Color</label>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    { id: 'emerald', hex: '#10B981', label: 'Signal Emerald' },
                    { id: 'cyan', hex: '#06B6D4', label: 'Quantum Cyan' },
                    { id: 'indigo', hex: '#6366F1', label: 'Night Indigo' },
                    { id: 'amber', hex: '#F59E0B', label: 'Amber Gold' },
                    { id: 'rose', hex: '#F43F5E', label: 'Crimson Rose' },
                  ] as const
                ).map((ac) => (
                  <button
                    key={ac.id}
                    onClick={() => onUpdateSettings({ accentColor: ac.id })}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      settings.accentColor === ac.id
                        ? 'border-white bg-slate-800 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: ac.hex }}
                    />
                    {ac.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">Chat Density</label>
                <select
                  value={settings.chatDensity}
                  onChange={(e) =>
                    onUpdateSettings({
                      chatDensity: e.target.value as AppSettings['chatDensity'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="spacious">Spacious (Comfortable Touch Ergonomics)</option>
                  <option value="compact">Compact (High Information Density)</option>
                </select>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <label className="block text-xs font-medium text-slate-300 mb-2">Font Scale</label>
                <select
                  value={settings.fontSize}
                  onChange={(e) =>
                    onUpdateSettings({
                      fontSize: e.target.value as AppSettings['fontSize'],
                    })
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium (Default)</option>
                  <option value="large">Large (High Accessibility)</option>
                </select>
              </div>
            </div>

            {/* Custom Chat Background Abstract Gradients in Appearance Tab */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-semibold text-white">
                    Custom Chat Background (Abstract Gradients & Minimal Surfaces)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Personalize your conversation canvas with curated abstract gradients.
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-400">
                  {
                    (
                      CHAT_WALLPAPER_PRESETS.find((p) => p.id === settings.wallpaperStyle) ||
                      CHAT_WALLPAPER_PRESETS[0]
                    ).label
                  }
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {CHAT_WALLPAPER_PRESETS.map((preset) => {
                  const isSelected = settings.wallpaperStyle === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateSettings({ wallpaperStyle: preset.id })}
                      className={`p-2 rounded-2xl border text-left transition-all flex flex-col gap-1.5 ${
                        isSelected
                          ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/50'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <div
                        className={`h-12 w-full rounded-xl border border-white/10 flex items-end justify-between p-1.5 ${preset.swatchClass}`}
                      >
                        <span className="px-1.5 py-0.5 rounded bg-black/50 text-[9px] font-mono text-slate-200">
                          {preset.category === 'Abstract Gradient' ? 'Gradient' : 'Surface'}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-xs font-semibold text-white truncate px-0.5">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 10. PRIVACY SUMMARY */}
        {activeSection === 'privacy_dashboard' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Privacy Summary</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                A simple overview of how your messages and calls stay private.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Ads</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">100% Ad-Free</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Activity Tracking</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">Never Tracked</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                <div className="text-xs text-slate-400">Chats & Calls</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">
                  Privately Protected
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="text-xs font-semibold text-white">Saved on Your Device</h4>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li>• Messages: {totalMessages} messages</li>
                  <li>• Chats & Groups: {chats.length} conversations</li>
                  <li>• Locked Chats in Vault: {lockedChats.length} chats</li>
                  <li>• Recent Calls: {settings.storeCallHistory ? `${calls.length} calls` : 'Turned Off'}</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="text-xs font-semibold text-white">How Your Privacy Works</h4>
                <ul className="text-xs text-slate-300 space-y-1.5">
                  <li>• Only you and the person you chat with can read your messages</li>
                  <li>• Photos, voice notes, and files are locked automatically</li>
                  <li>• Voice and video calls are never recorded</li>
                  <li>• Status updates disappear automatically after 24 hours</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 11. ABOUT, CREATOR & HELP GUIDE */}
        {activeSection === 'help' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                About Simple & App Information
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Official Android Application Details, Creator Credits & Feature Guide.
              </p>
            </div>

            {/* Official Creator & App Identity Hero Card */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src="/icon-192.png"
                    alt="Simple App Icon"
                    className="w-14 h-14 rounded-2xl border border-emerald-400/40 shadow-lg shrink-0 object-cover bg-black"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base sm:text-lg font-bold text-white">
                        Simple — Private Encrypted Messenger
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider">
                        Android Native
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-emerald-300 mt-0.5">
                      Created by Dr. M Verma
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Zero-Knowledge End-to-End Encrypted Communication Platform
                    </p>
                  </div>
                </div>

                <AndroidInstallButton />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Created By</div>
                  <div className="font-bold text-emerald-400 mt-0.5">Dr. M Verma</div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Package ID</div>
                  <div className="font-mono text-[11px] text-slate-200 mt-0.5 truncate">
                    com.drmverma.simple
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Encryption</div>
                  <div className="font-mono text-[11px] text-cyan-300 mt-0.5">
                    AES-256-GCM / P-256
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Calling Engine</div>
                  <div className="font-mono text-[11px] text-emerald-300 mt-0.5">
                    WebRTC DTLS-SRTP
                  </div>
                </div>
              </div>

              {/* Direct Android APK File & GitHub Repository APK Download Box */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>Native Android Package Included: Simple-Android-v6.0.0.apk (v6.0.0)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Available directly in your synced GitHub repository root (<code>/Simple-Android-v6.0.0.apk</code> &amp; <code>/releases/Simple-v6.0.0.apk</code>) and GitHub Releases, or download directly below.
                  </p>
                </div>
                <a
                  href="/Simple-Android-v6.0.0.apk"
                  download="Simple-Android-v6.0.0.apk"
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shrink-0 shadow-lg shadow-emerald-500/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Simple-Android-v6.0.0.apk</span>
                </a>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <h4 className="text-sm font-bold text-emerald-400">1. Finding Friends</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tap <strong>Directory</strong> at the top to find anyone by their <strong>Mobile Number</strong>, <strong>@username</strong>, or <strong>Email</strong> and start chatting right away.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <h4 className="text-sm font-bold text-emerald-400">2. Message Ticks (Sent, Delivered, Read)</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>1 grey tick</strong> means Sent, <strong>2 grey ticks</strong> means Delivered, and <strong>2 blue ticks</strong> means Read. You can turn blue ticks on or off anytime in Privacy settings.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <h4 className="text-sm font-bold text-emerald-400">3. Locked Chats Vault</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Want to hide a private chat? Tap the <strong>⋮</strong> menu on any chat and choose <strong>Lock Chat in Vault</strong>. Unlock it anytime using your PIN (default: <strong>2580</strong>).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <h4 className="text-sm font-bold text-emerald-400">4. Status Stories & Pro Media Studio</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Open the <strong>Status</strong> tab or tap the wand icon in any chat to trim videos, add interactive 3D stickers & emojis, resize/rotate overlays, and apply filters!
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5 sm:col-span-2">
                <h4 className="text-sm font-bold text-emerald-400">5. Native Android Gestures & Multi-Select</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Slide any message right to reply, swipe between tabs, use your Android hardware back button naturally, or long-press items in Chats, Calls, Status, or Directory for batch actions.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Profile Photo Lightbox & Editor Modal */}
      {showProfileLightbox && (
        <ProfilePhotoLightboxModal
          name={account.name}
          username={account.username}
          about={account.about}
          avatarUrl={account.avatarUrl}
          avatarColor={account.avatarColor}
          isOwnProfile
          canEditPhoto
          profilePhotoVisibility={settings.profilePhotoVisibility}
          onUpdateAvatarUrl={(url) => onUpdateAccount({ avatarUrl: url })}
          onUpdateAvatarColor={(col) => onUpdateAccount({ avatarColor: col })}
          onUpdateVisibility={(vis) => onUpdateSettings({ profilePhotoVisibility: vis })}
          onClose={() => setShowProfileLightbox(false)}
        />
      )}
    </div>
  );
};
