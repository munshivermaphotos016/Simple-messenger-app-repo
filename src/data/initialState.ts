import {
  AppSettings,
  CallRecord,
  ChatConversation,
  DirectoryUser,
  LinkedDevice,
  SavedContact,
  StatusPost,
  UserAccount,
} from '../types/simple';
import {
  AVATAR_3D_BY_ID,
  CARTOON_3D_STICKERS,
  STYLED_3D_SCENES,
} from '../utils/cartoonAvatars';

const now = Date.now();
const min = 60 * 1000;
const hour = 60 * min;

export function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

/**
 * Standard FIPS 180-4 SHA-256 digest (synchronous, 64-char lowercase hex)
 * Used for deterministic privacy-preserving phone number & email index hashing
 * so raw phone numbers never need to be stored or exposed in plaintext in Firestore.
 */
export function sha256HexSync(asciiInput: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(asciiInput);
  const bitLen = bytes.length * 8;
  const totalBytes = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalBytes);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalBytes - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalBytes; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export function computePhoneHash(phone: string): string {
  const norm = normalizePhone(phone);
  if (!norm) return '';
  return sha256HexSync(`simple-phone-discovery-v1:${norm}`);
}

export function computePhoneTailHash(phone: string): string {
  const norm = normalizePhone(phone);
  if (norm.length < 7) return computePhoneHash(phone);
  const tail = norm.slice(-10);
  return sha256HexSync(`simple-phone-tail-v1:${tail}`);
}

export function computeEmailHash(email?: string): string {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return '';
  return sha256HexSync(`simple-email-discovery-v1:${clean}`);
}

export function deriveUidFromPhone(phone: string): string {
  const hash = computePhoneHash(phone);
  return hash ? `usr_${hash.slice(0, 16)}` : `usr_${Date.now()}`;
}

export function maskPhoneForFirestore(phone: string): string {
  const norm = normalizePhone(phone);
  if (norm.length <= 2) return '+•• ••• ••••';
  return `+•• •••• ••${norm.slice(-2)}`;
}

export function generateDefaultUsername(name: string, phone: string, email?: string): string {
  const digits = normalizePhone(phone);
  const last4 = digits.slice(-4) || '0101';
  if (email && email.includes('@')) {
    const emailPrefix = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, '');
    if (emailPrefix.length >= 3) {
      return `${emailPrefix}.${last4}`;
    }
  }
  const cleanName = (name || 'user')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '');
  return `${cleanName || 'simple'}.${last4}`;
}

export const INITIAL_USER_ACCOUNT: UserAccount = {
  id: '',
  name: '',
  username: '',
  phone: '',
  normalizedPhone: '',
  email: '',
  authMethod: 'phone_otp',
  phoneVerified: false,
  emailVerified: false,
  about: 'Hey there! I am using Simple.',
  avatarColor: '#10B981',
  avatarUrl: undefined,
  allowUsernameDiscovery: true,
  hidePhoneNumber: false,
  onboardingCompleted: false,
};

export const INITIAL_DIRECTORY_USERS: DirectoryUser[] = [];

export const INITIAL_SAVED_CONTACTS: SavedContact[] = [];

export const INITIAL_SETTINGS: AppSettings = {
  lastSeenVisibility: 'contacts',
  onlineStatusVisibility: 'same_as_last_seen',
  showOnlineStatus: true,
  lastSeenExcludedIds: [],
  onlineStatusExcludedIds: [],
  profilePhotoVisibility: 'contacts',
  profilePhotoExcludedIds: [],
  aboutVisibility: 'contacts',
  statusVisibility: 'contacts',
  readReceipts: true,
  typingIndicator: true,
  blockedContacts: [],

  appLockMethod: 'none',
  appLockPin: '2580',
  autoLockTimeout: '1m',
  chatLockEnabled: true,
  chatLockPin: '2580',
  biometricsEnabled: true,
  hideRecentAppContent: false,
  preventScreenshots: true,
  securityNotifications: true,
  loginAlerts: true,

  notificationsEnabled: true,
  messageNotifications: true,
  groupNotifications: true,
  callNotifications: true,
  statusNotifications: true,
  reactionNotifications: true,
  mentionNotifications: true,
  mediaNotifications: true,
  notificationPreview: 'name_and_message',
  privateNotificationsMode: false,
  soundEnabled: true,
  inAppChatSoundsEnabled: true,
  vibrationEnabled: true,
  ledIndicatorColor: '#10B981',
  messageNotificationTone: 'note_drop',
  favoriteMessageTone: 'sparkle_pop',
  groupNotificationTone: 'bamboo_pop',
  statusNotificationTone: 'crystal_ping',
  reactionNotificationTone: 'emerald_pulse',
  vibrationPattern: 'default',
  favoriteVibrationPattern: 'heartbeat',
  groupVibrationPattern: 'rapid',
  notificationVolume: 85,

  incomingCallNotificationStyle: 'show_name',
  callRingtone: 'simple_classic',
  favoriteCallRingtone: 'vip_fanfare',
  videoCallRingtone: 'facetime_chime',
  groupCallRingtone: 'marimba_pulse',
  callVibrationPattern: 'heartbeat',
  ringtoneVolume: 90,
  incomingCallBannerStyle: 'fullscreen_immersive',
  flashScreenOnCall: true,
  announceCallerName: false,
  storeCallHistory: true,
  hideCallHistoryFromUI: false,
  lockCallHistory: false,
  lowDataCallsMode: false,
  defaultVideoQuality: 'auto',

  theme: 'dark',
  accentColor: 'emerald',
  chatDensity: 'spacious',
  fontSize: 'medium',
  wallpaperStyle: 'theme_img_1',
  wallpaperBlur: 0,
  wallpaperOpacity: 75,
  wallpaperThemeMigratedV3: true,
  enterKeySends: true,
  mediaVisibilityInGallery: false,
  autoDownloadMedia: 'wifi_only',
  defaultMediaQuality: 'hd',
  maxFileSizeMb: 250,
  keepChatsArchived: true,

  statusFeatureEnabled: true,

  backupMode: 'local_encrypted',
  cloudBackupProvider: 'google_drive',
  cloudBackupGmail: '',
  cloudBackupGmailVerified: false,
  backupFrequency: 'weekly',
  backupWifiOnly: true,
  backupIncludeMedia: true,
  lastBackupTimestamp: 0,

  contactsPermissionGranted: true,
  notificationsPermissionGranted: true,
  microphonePermissionGranted: true,
  cameraPermissionGranted: true,
  optionalDiagnosticsEnabled: false,
};

export const INITIAL_CHATS: ChatConversation[] = [];

export const INITIAL_CALL_HISTORY: CallRecord[] = [];

export const INITIAL_STATUS_POSTS: StatusPost[] = [];

export const INITIAL_LINKED_DEVICES: LinkedDevice[] = [
  {
    id: 'dev_current_android',
    deviceName: 'This Device (Simple Messenger)',
    deviceType: 'Android',
    lastActive: 'Active now',
    loginDate: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }),
    sessionStatus: 'Active (Current)',
    fingerprint: 'A91C:4F82:D03E:71B4',
  },
];
