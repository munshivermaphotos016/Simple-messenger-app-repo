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
  id: 'usr_self_01',
  name: 'Alex Rivera',
  username: 'alex.rivera',
  phone: '+1 (415) 890-4319',
  normalizedPhone: '14158904319',
  email: 'alex.rivera@gmail.com',
  authMethod: 'both',
  phoneVerified: true,
  emailVerified: true,
  about: 'Signal-grade encryption · Zero telemetry',
  avatarColor: '#10B981',
  avatarUrl: AVATAR_3D_BY_ID.alex_3d,
  allowUsernameDiscovery: true,
  hidePhoneNumber: false,
  onboardingCompleted: true,
};

export const INITIAL_DIRECTORY_USERS: DirectoryUser[] = [
  {
    uid: 'usr_self_01',
    name: 'Alex Rivera',
    username: 'alex.rivera',
    phone: '+1 (415) 890-4319',
    normalizedPhone: '14158904319',
    phoneHash: computePhoneHash('14158904319'),
    phoneTailHash: computePhoneTailHash('14158904319'),
    email: 'alex@simple.privacy',
    emailHash: computeEmailHash('alex@simple.privacy'),
    about: 'Signal-grade encryption · Zero telemetry',
    avatarColor: '#10B981',
    avatarUrl: AVATAR_3D_BY_ID.alex_3d,
    identityFingerprint: 'A91C4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: now,
  },
  {
    uid: 'chat_elena',
    name: 'Dr. Elena Rostova',
    username: 'elena.sec',
    phone: '+41 44 580 12 90',
    normalizedPhone: '41445801290',
    phoneHash: computePhoneHash('41445801290'),
    phoneTailHash: computePhoneTailHash('41445801290'),
    email: 'elena@eth.ch',
    emailHash: computeEmailHash('elena@eth.ch'),
    about: 'Cryptography Researcher · ETH Zürich',
    avatarColor: '#10B981',
    avatarUrl: AVATAR_3D_BY_ID.elena_3d,
    identityFingerprint: '8F4A2C91E0B73D55A19C4820F7D631E8B45A920C11E3D84076A5C291B0E4D73A',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: now,
  },
  {
    uid: 'chat_marcus',
    name: 'Marcus Vance',
    username: 'mvance.webrtc',
    phone: '+1 (415) 890-2211',
    normalizedPhone: '14158902211',
    phoneHash: computePhoneHash('14158902211'),
    phoneTailHash: computePhoneTailHash('14158902211'),
    email: 'marcus@simple.privacy',
    emailHash: computeEmailHash('marcus@simple.privacy'),
    about: 'Real-time audio/video infrastructure',
    avatarColor: '#6366F1',
    avatarUrl: AVATAR_3D_BY_ID.marcus_3d,
    identityFingerprint: '3B7E92A4C108D65F29E3B10487C5A2D9E0F143B876C2D591A4E0B38271C6D94F',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: now,
  },
  {
    uid: 'usr_sora',
    name: 'Sora Takahashi',
    username: 'sora.compose',
    phone: '+81 3-5555-0192',
    normalizedPhone: '81355550192',
    phoneHash: computePhoneHash('81355550192'),
    phoneTailHash: computePhoneTailHash('81355550192'),
    email: 'sora@android.jp',
    emailHash: computeEmailHash('sora@android.jp'),
    about: 'Jetpack Compose & Material 3 Lead',
    avatarColor: '#F59E0B',
    avatarUrl: AVATAR_3D_BY_ID.sora_3d,
    identityFingerprint: '9D4E2A17B6C83F512A9D04E7B3C618290F4E1D2C3B4A5908F4A2C91E0B73D55A',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: now,
  },
  {
    uid: 'usr_priya',
    name: 'Priya Sharma',
    username: 'priya.k',
    phone: '+91 98765 43210',
    normalizedPhone: '919876543210',
    phoneHash: computePhoneHash('919876543210'),
    phoneTailHash: computePhoneTailHash('919876543210'),
    email: 'priya@security.in',
    emailHash: computeEmailHash('priya@security.in'),
    about: 'Zero-Knowledge Systems Architect',
    avatarColor: '#EC4899',
    avatarUrl: AVATAR_3D_BY_ID.priya_3d,
    identityFingerprint: '4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3A91C',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: now,
  },
  {
    uid: 'usr_david',
    name: 'David Miller',
    username: 'david.m',
    phone: '+44 7700 900077',
    normalizedPhone: '447700900077',
    phoneHash: computePhoneHash('447700900077'),
    phoneTailHash: computePhoneTailHash('447700900077'),
    email: 'david@london.uk',
    emailHash: computeEmailHash('david@london.uk'),
    about: 'Available on Simple E2EE',
    avatarColor: '#06B6D4',
    avatarUrl: AVATAR_3D_BY_ID.david_3d,
    identityFingerprint: '71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3A91C4F82D03E',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: false,
    lastSeen: 'Last seen 12m ago',
    updatedAt: now,
  },
];

export const INITIAL_SAVED_CONTACTS: SavedContact[] = [
  {
    id: 'cnt_1',
    savedName: 'Dr. Elena Rostova',
    phone: '+41 44 580 12 90',
    normalizedPhone: '41445801290',
    phoneHash: computePhoneHash('41445801290'),
    phoneTailHash: computePhoneTailHash('41445801290'),
    username: 'elena.sec',
    email: 'elena@eth.ch',
    matchedUserUid: 'chat_elena',
    addedAt: now - 48 * hour,
  },
  {
    id: 'cnt_2',
    savedName: 'Marcus Vance',
    phone: '+1 (415) 890-2211',
    normalizedPhone: '14158902211',
    phoneHash: computePhoneHash('14158902211'),
    phoneTailHash: computePhoneTailHash('14158902211'),
    username: 'mvance.webrtc',
    email: 'marcus@simple.privacy',
    matchedUserUid: 'chat_marcus',
    addedAt: now - 36 * hour,
  },
  {
    id: 'cnt_3',
    savedName: 'Priya Sharma (Mobile)',
    phone: '+91 98765 43210',
    normalizedPhone: '919876543210',
    phoneHash: computePhoneHash('919876543210'),
    phoneTailHash: computePhoneTailHash('919876543210'),
    username: 'priya.k',
    email: 'priya@security.in',
    matchedUserUid: 'usr_priya',
    addedAt: now - 12 * hour,
  },
];

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
  blockedContacts: [
    { id: 'blk_1', name: 'Unknown Telemarketer', username: 'promo.spam.99', phone: '+1 (800) 555-0199' },
  ],

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
  cloudBackupGmail: 'alex.rivera@gmail.com',
  cloudBackupGmailVerified: true,
  backupFrequency: 'weekly',
  backupWifiOnly: true,
  backupIncludeMedia: true,
  lastBackupTimestamp: now - 14 * hour,

  contactsPermissionGranted: true,
  notificationsPermissionGranted: true,
  microphonePermissionGranted: true,
  cameraPermissionGranted: true,
  optionalDiagnosticsEnabled: false,
};

export const INITIAL_CHATS: ChatConversation[] = [
  {
    id: 'chat_elena',
    peerUid: 'chat_elena',
    name: 'Dr. Elena Rostova',
    username: 'elena.sec',
    phone: '+41 44 580 12 90',
    normalizedPhone: '41445801290',
    email: 'elena@eth.ch',
    about: 'Cryptography Researcher · ETH Zürich',
    avatarColor: '#10B981',
    avatarUrl: AVATAR_3D_BY_ID.elena_3d,
    isGroup: false,
    isOnline: true,
    lastSeen: 'Online',
    pinned: true,
    archived: false,
    locked: false,
    muted: false,
    favorite: true,
    hasShortcut: true,
    unreadCount: 2,
    hasMention: false,
    draftText: '',
    disappearing: '7d',
    notificationMode: 'priority',
    identityFingerprint: '8F4A2C91E0B73D55A19C4820F7D631E8B45A920C11E3D84076A5C291B0E4D73A',
    isVerified: true,
    messages: [
      {
        id: 'msg_101',
        chatId: 'chat_elena',
        senderId: 'chat_elena',
        senderName: 'Dr. Elena Rostova',
        senderPhone: '+41 44 580 12 90',
        senderUsername: 'elena.sec',
        text: 'Hey Alex, I reviewed the **ECDH P-256 + HKDF-SHA256** key ratchet implementation for Simple on Android.',
        timestamp: now - 45 * min,
        status: 'read',
        reactions: [{ emoji: '🔒', userIds: ['usr_self_01'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDE=',
          ivHex: '8a4f02c19e3b771204d5a811',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '8F4A2C91E0B73D55',
          ratchetStep: 1,
        },
      },
      {
        id: 'msg_102',
        chatId: 'chat_elena',
        senderId: 'usr_self_01',
        senderName: 'Alex Rivera',
        senderPhone: '+1 (415) 890-4319',
        senderUsername: 'alex.rivera',
        text: 'Awesome! Did you check the `AndroidKeyStore` hardware-backed key wrapping and zero-plaintext backup export?',
        timestamp: now - 41 * min,
        status: 'read',
        deliveredAt: now - 41 * min + 1200,
        readAt: now - 40 * min,
        pinned: true,
        reactions: [{ emoji: '👍', userIds: ['chat_elena'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDI=',
          ivHex: '3b19c4d82a70f1e56309b422',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: 'A91C4F82D03E71B4',
          ratchetStep: 2,
        },
      },
      {
        id: 'msg_103',
        chatId: 'chat_elena',
        senderId: 'chat_elena',
        senderName: 'Dr. Elena Rostova',
        senderPhone: '+41 44 580 12 90',
        senderUsername: 'elena.sec',
        text: 'Voice note summary of the security audit findings:',
        timestamp: now - 18 * min,
        status: 'delivered',
        voiceNote: {
          durationSec: 14,
          waveform: [22, 45, 78, 60, 35, 88, 94, 52, 40, 72, 85, 64, 30, 58, 90, 76, 48, 62, 80, 44, 28, 50, 70, 36],
        },
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDM=',
          ivHex: '7c2e91f04b83a6d19204e755',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '8F4A2C91E0B73D55',
          ratchetStep: 3,
        },
      },
      {
        id: 'msg_103_photo',
        chatId: 'chat_elena',
        senderId: 'chat_elena',
        senderName: 'Dr. Elena Rostova',
        senderPhone: '+41 44 580 12 90',
        senderUsername: 'elena.sec',
        text: 'Zurich Cryptography Lab hardware benchmark capture 🔬',
        timestamp: now - 15 * min,
        status: 'read',
        attachment: {
          id: 'att_photo_1',
          type: 'photo',
          name: 'Zurich_Quantum_Cryptography_Lab.jpg',
          sizeBytes: 1248000,
          quality: 'hd',
          url: STYLED_3D_SCENES.cyberLab,
          caption: 'Zurich Quantum Lab hardware key verification setup',
          uploadProgress: 100,
          isDownloaded: true,
        },
        reactions: [{ emoji: '🔥', userIds: ['usr_self_01'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDNwaG90bw==',
          ivHex: '7c2e91f04b83a6d19204e766',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '8F4A2C91E0B73D55',
          ratchetStep: 3,
        },
      },
      {
        id: 'msg_104',
        chatId: 'chat_elena',
        senderId: 'chat_elena',
        senderName: 'Dr. Elena Rostova',
        senderPhone: '+41 44 580 12 90',
        senderUsername: 'elena.sec',
        text: 'Also attached the signed PDF audit report. Tap the lock badge in the header anytime to verify our 60-digit Safety Number.',
        timestamp: now - 12 * min,
        status: 'delivered',
        attachment: {
          id: 'att_pdf_1',
          type: 'pdf',
          name: 'Simple_E2EE_Protocol_Audit_v2.4.pdf',
          sizeBytes: 1843200,
          quality: 'original',
          uploadProgress: 100,
          isDownloaded: true,
        },
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDQ=',
          ivHex: '9f01d3e75a28c4b61039f844',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '8F4A2C91E0B73D55',
          ratchetStep: 4,
        },
      },
      {
        id: 'msg_105',
        chatId: 'chat_elena',
        senderId: 'usr_self_01',
        senderName: 'Alex Rivera',
        senderPhone: '+1 (415) 890-4319',
        senderUsername: 'alex.rivera',
        text: 'Received the PDF! I am verifying the SHA-256 signature and read receipt ratchets now.',
        timestamp: now - 5 * min,
        status: 'delivered',
        deliveredAt: now - 5 * min + 900,
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDU=',
          ivHex: '5e21a8c49d03f7b16482c910',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: 'A91C4F82D03E71B4',
          ratchetStep: 5,
        },
      },
      {
        id: 'msg_106_photo_download',
        chatId: 'chat_elena',
        senderId: 'chat_elena',
        senderName: 'Dr. Elena Rostova',
        senderPhone: '+41 44 580 12 90',
        senderUsername: 'elena.sec',
        text: 'Here is the hardware die micrograph for the new cryptographic coprocessor.',
        timestamp: now - 2 * min,
        status: 'delivered',
        attachment: {
          id: 'att_photo_die',
          type: 'photo',
          name: 'Quantum_Coprocessor_Die.jpg',
          sizeBytes: 2516582, // 2.4 MB
          quality: 'hd',
          thumbnailUrl: STYLED_3D_SCENES.siliconChip,
          url: STYLED_3D_SCENES.siliconChip,
          caption: 'Silicon die micrograph: Hardware random number generator & key vault',
          uploadProgress: 100,
          isDownloaded: false, // Tap to download on demand
        },
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockxMDZkaWU=',
          ivHex: '445566778899aabbccddeeff',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '8F4A2C91E0B73D55',
          ratchetStep: 6,
        },
      },
    ],
  },
  {
    id: 'chat_core_group',
    name: 'Simple Android Core Team',
    username: 'simple.android.wg',
    about: 'End-to-end encrypted engineering channel · Disappearing 24h',
    avatarColor: '#06B6D4',
    avatarUrl: AVATAR_3D_BY_ID.team_group_3d,
    isGroup: true,
    isOnline: true,
    lastSeen: '4 members online',
    pinned: true,
    archived: false,
    locked: false,
    muted: false,
    favorite: true,
    hasShortcut: true,
    unreadCount: 1,
    hasMention: true,
    draftText: '',
    disappearing: '24h',
    notificationMode: 'default',
    identityFingerprint: '5C9E11A480B27F36D904E2A17B6C83F512A9D04E7B3C618290F4E1D2C3B4A590',
    isVerified: true,
    groupSettings: {
      description: 'Core Android Jetpack Compose, WebRTC DTLS-SRTP calling, and Signal-protocol ratcheting working group.',
      inviteLink: 'https://simple.privacy/g/9xK4mP2qL8vN',
      adminApprovalRequired: true,
      onlyAdminsCanSend: false,
      onlyAdminsCanEditInfo: true,
      members: [
        { id: 'usr_self_01', name: 'Alex Rivera (You)', username: 'alex.rivera', phone: '+1 (415) 890-4319', role: 'admin', avatarColor: '#10B981' },
        { id: 'chat_elena', name: 'Dr. Elena Rostova', username: 'elena.sec', phone: '+41 44 580 12 90', role: 'admin', avatarColor: '#06B6D4' },
        { id: 'chat_marcus', name: 'Marcus Vance', username: 'mvance.webrtc', phone: '+1 (415) 890-2211', role: 'member', avatarColor: '#6366F1' },
        { id: 'usr_sora', name: 'Sora Takahashi', username: 'sora.compose', phone: '+81 3-5555-0192', role: 'member', avatarColor: '#F59E0B' },
      ],
    },
    messages: [
      {
        id: 'msg_201',
        chatId: 'chat_core_group',
        senderId: 'chat_marcus',
        senderName: 'Marcus Vance',
        text: 'TURN fallback with ephemeral credentials verified across 4G/5G network handoff.',
        timestamp: now - 3 * hour,
        status: 'read',
        reactions: [{ emoji: '🚀', userIds: ['usr_self_01', 'chat_elena'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockyMDE=',
          ivHex: '1d2e3f4a5b6c7d8e9f001122',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '5C9E11A480B27F36',
          ratchetStep: 11,
        },
      },
      {
        id: 'msg_202',
        chatId: 'chat_core_group',
        senderId: 'usr_sora',
        senderName: 'Sora Takahashi',
        text: '@alex.rivera Vote on the default Android WindowManager privacy behavior for the next release:',
        timestamp: now - 55 * min,
        status: 'delivered',
        poll: {
          id: 'poll_flag_secure',
          question: 'Default FLAG_SECURE behavior for Locked Chats?',
          allowMultiple: false,
          options: [
            { id: 'opt_1', text: 'Enable FLAG_SECURE strictly by default', voterIds: ['usr_self_01', 'chat_elena', 'usr_sora'] },
            { id: 'opt_2', text: 'Prompt user during first Chat Lock setup', voterIds: ['chat_marcus'] },
            { id: 'opt_3', text: 'Blur in Recents switcher only', voterIds: [] },
          ],
        },
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockyMDI=',
          ivHex: '4a5b6c7d8e9f001122334455',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '9D4E2A17B6C83F51',
          ratchetStep: 12,
        },
      },
      {
        id: 'msg_203_video',
        chatId: 'chat_core_group',
        senderId: 'chat_marcus',
        senderName: 'Marcus Vance',
        text: 'Recorded packet capture for the new DTLS-SRTP video stream:',
        timestamp: now - 32 * min,
        status: 'delivered',
        attachment: {
          id: 'att_vid_1',
          type: 'video',
          name: 'WebRTC_DTLS_SRTP_Capture.mp4',
          sizeBytes: 3840000,
          quality: 'hd',
          durationSec: 24,
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          thumbnailUrl: STYLED_3D_SCENES.neonHorizon,
          caption: 'WebRTC DTLS-SRTP encrypted frame stream',
          uploadProgress: 100,
          isDownloaded: true,
        },
        reactions: [{ emoji: '👏', userIds: ['usr_self_01', 'usr_sora'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockyMDN2aWQ=',
          ivHex: '5b6c7d8e9f00112233445566',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '5C9E11A480B27F36',
          ratchetStep: 13,
        },
      },
    ],
  },
  {
    id: 'chat_marcus',
    peerUid: 'chat_marcus',
    name: 'Marcus Vance',
    username: 'mvance.webrtc',
    phone: '+1 (415) 890-2211',
    normalizedPhone: '14158902211',
    email: 'marcus@simple.privacy',
    about: 'Real-time audio/video infrastructure',
    avatarColor: '#6366F1',
    avatarUrl: AVATAR_3D_BY_ID.marcus_3d,
    isGroup: false,
    isOnline: false,
    lastSeen: 'Last seen 28m ago',
    pinned: false,
    archived: false,
    locked: false,
    muted: false,
    favorite: false,
    unreadCount: 0,
    hasMention: false,
    draftText: 'Let’s review the low-bandwidth Opus codec profile at 4pm',
    disappearing: 'off',
    notificationMode: 'default',
    identityFingerprint: '3B7E92A4C108D65F29E3B10487C5A2D9E0F143B876C2D591A4E0B38271C6D94F',
    isVerified: true,
    messages: [
      {
        id: 'msg_301',
        chatId: 'chat_marcus',
        senderId: 'chat_marcus',
        senderName: 'Marcus Vance',
        text: 'Check out the zero-metadata call signaling benchmarks at https://simple.privacy/benchmarks/webrtc-dtls',
        timestamp: now - 5 * hour,
        status: 'read',
        linkPreview: {
          url: 'https://simple.privacy/benchmarks/webrtc-dtls',
          title: 'WebRTC DTLS-SRTP Latency & TURN Relay Benchmarks',
          domain: 'simple.privacy',
          description: 'End-to-end encrypted audio and video call signaling without persistent call metadata logs.',
        },
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockzMDE=',
          ivHex: '778899aabbccddeeff001122',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '3B7E92A4C108D65F',
          ratchetStep: 4,
        },
      },
      {
        id: 'msg_302',
        chatId: 'chat_marcus',
        senderId: 'usr_self_01',
        senderName: 'Alex Rivera',
        senderPhone: '+1 (415) 890-4319',
        senderUsername: 'alex.rivera',
        text: 'Sounds great, ping me when you are back online so we can run the DTLS-SRTP benchmark.',
        timestamp: now - 14 * min,
        status: 'sent',
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockzMDI=',
          ivHex: '112233445566778899aabbcc',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: 'A91C4F82D03E71B4',
          ratchetStep: 5,
        },
      },
      {
        id: 'msg_303_sticker',
        chatId: 'chat_marcus',
        senderId: 'chat_marcus',
        senderName: 'Marcus Vance',
        text: '🛡️ Cryptographic Shield Verified',
        timestamp: now - 8 * min,
        status: 'read',
        attachment: {
          id: 'att_sticker_1',
          type: 'sticker',
          name: 'Shield_Lock_Sticker.webp',
          sizeBytes: 86400,
          quality: 'hd',
          stickerEmoji: '🛡️',
          url: CARTOON_3D_STICKERS[0].url,
          caption: 'Zero-knowledge verified',
          uploadProgress: 100,
          isDownloaded: true,
        },
        reactions: [{ emoji: '⚡', userIds: ['usr_self_01'] }],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlockzMDNzdGljaw==',
          ivHex: '2233445566778899aabbccdd',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '3B7E92A4C108D65F',
          ratchetStep: 6,
        },
      },
    ],
  },
  {
    id: 'chat_journalist_vault',
    name: 'Investigative Source #09',
    username: 'vault.source.09',
    phone: '+41 79 901 44 12',
    normalizedPhone: '41799014412',
    about: 'Protected whistleblower channel · PIN / Biometric locked',
    avatarColor: '#F59E0B',
    avatarUrl: AVATAR_3D_BY_ID.astro_3d,
    isGroup: false,
    isOnline: true,
    lastSeen: 'Online',
    pinned: false,
    archived: false,
    locked: true, // Protected inside Locked Chats vault!
    muted: true,
    favorite: true,
    unreadCount: 1,
    hasMention: false,
    draftText: '',
    disappearing: '24h',
    notificationMode: 'hide_preview',
    identityFingerprint: 'E91F04C82B73D65190A4E281C7B3D509F2E4A18376B5C920D1E8F3A472B6C510',
    isVerified: true,
    messages: [
      {
        id: 'msg_401',
        chatId: 'chat_journalist_vault',
        senderId: 'chat_journalist_vault',
        senderName: 'Investigative Source #09',
        text: 'This conversation is stored inside your Locked Chats vault. Tap "Unlock & Restore to Main Inbox" anytime if you want to move it out of the vault.',
        timestamp: now - 2 * hour,
        status: 'delivered',
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlock0MDE=',
          ivHex: 'aabbccddeeff001122334455',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: 'E91F04C82B73D651',
          ratchetStep: 1,
        },
      },
    ],
  },
  {
    id: 'chat_archived_design',
    name: 'Material 3 Design Archive',
    username: 'design.archive',
    about: 'Completed UI sprints',
    avatarColor: '#EC4899',
    avatarUrl: AVATAR_3D_BY_ID.fox_3d,
    isGroup: true,
    isOnline: false,
    lastSeen: 'Archived',
    pinned: false,
    archived: true,
    locked: false,
    muted: true,
    favorite: false,
    unreadCount: 0,
    hasMention: false,
    draftText: '',
    disappearing: 'off',
    notificationMode: 'silent',
    identityFingerprint: '11223344556677889900AABBCCDDEEFF11223344556677889900AABBCCDDEEFF',
    isVerified: false,
    messages: [
      {
        id: 'msg_501',
        chatId: 'chat_archived_design',
        senderId: 'usr_sora',
        senderName: 'Sora Takahashi',
        text: 'AMOLED #000000 pure black tokens finalized for OLED power saving.',
        timestamp: now - 48 * hour,
        status: 'read',
        reactions: [],
        e2eeEnvelope: {
          ciphertextBase64: 'U2ltcGxlR2NtQ2lwaGVydGV4dFBlock1MDE=',
          ivHex: 'ffeeddccbbaa998877665544',
          algorithm: 'ECDH-P256-HKDF-AES256GCM',
          senderFingerprint: '1122334455667788',
          ratchetStep: 1,
        },
      },
    ],
  },
];

export const INITIAL_CALL_HISTORY: CallRecord[] = [
  {
    id: 'call_01',
    chatId: 'chat_elena',
    participantName: 'Dr. Elena Rostova',
    participantUsername: 'elena.sec',
    participantPhone: '+41 44 580 12 90',
    avatarColor: '#10B981',
    isGroupCall: false,
    participantsCount: 2,
    callType: 'video',
    direction: 'incoming',
    timestamp: now - 95 * min,
    durationSec: 842,
    encryptedProtocol: 'WebRTC DTLS-SRTP',
  },
  {
    id: 'call_02',
    chatId: 'chat_core_group',
    participantName: 'Simple Android Core Team',
    participantUsername: 'simple.android.wg',
    avatarColor: '#06B6D4',
    isGroupCall: true,
    participantsCount: 4,
    callType: 'audio',
    direction: 'outgoing',
    timestamp: now - 6 * hour,
    durationSec: 1920,
    encryptedProtocol: 'WebRTC DTLS-SRTP',
  },
  {
    id: 'call_03',
    chatId: 'chat_marcus',
    participantName: 'Marcus Vance',
    participantUsername: 'mvance.webrtc',
    participantPhone: '+1 (415) 890-2211',
    avatarColor: '#6366F1',
    isGroupCall: false,
    participantsCount: 2,
    callType: 'audio',
    direction: 'missed',
    timestamp: now - 22 * hour,
    durationSec: 0,
    encryptedProtocol: 'WebRTC DTLS-SRTP',
  },
];

export const INITIAL_STATUS_POSTS: StatusPost[] = [
  {
    id: 'st_01',
    authorId: 'chat_elena',
    authorName: 'Dr. Elena Rostova',
    authorUsername: 'elena.sec',
    authorAvatarColor: '#10B981',
    authorAvatarUrl: AVATAR_3D_BY_ID.elena_3d,
    contentType: 'photo',
    text: 'Sunset over Lake Zürich 🌅✨',
    caption: 'Evening walk by the water after a great week! Coffee tomorrow morning? ☕',
    mediaUrl: STYLED_3D_SCENES.alpineSunset,
    fontStyle: 'sans',
    backgroundColor: 'linear-gradient(135deg, #064E3B 0%, #0F766E 50%, #022C22 100%)',
    privacy: 'all_contacts',
    expiryDuration: '24h',
    createdAt: now - 35 * min,
    expiresAt: now + 23 * hour,
    viewedByMe: false,
    viewsCount: 28,
    reactions: ['❤️', '🔥', '😍'],
    likedByMe: false,
  },
  {
    id: 'st_02',
    authorId: 'chat_elena',
    authorName: 'Dr. Elena Rostova',
    authorUsername: 'elena.sec',
    authorAvatarColor: '#10B981',
    contentType: 'text',
    text: 'Weekend plans: hiking in the Alps & unplugging for a bit 🏔️🥾💚',
    fontStyle: 'bold',
    backgroundColor: 'linear-gradient(135deg, #1E1B4B 0%, #4338CA 55%, #0F172A 100%)',
    privacy: 'all_contacts',
    expiryDuration: '24h',
    createdAt: now - 20 * min,
    expiresAt: now + 23 * hour,
    viewedByMe: false,
    viewsCount: 19,
    reactions: ['👏', '🎉'],
    likedByMe: false,
  },
  {
    id: 'st_03',
    authorId: 'usr_priya',
    authorName: 'Priya Sharma',
    authorUsername: 'priya.sharma',
    authorAvatarColor: '#F43F5E',
    contentType: 'video',
    text: 'Late night studio jam session 🎸🎶',
    caption: 'Working on our new acoustic track! Turn the sound on 🔊✨',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
    fontStyle: 'sans',
    backgroundColor: 'linear-gradient(135deg, #881337 0%, #BE123C 50%, #4C0519 100%)',
    privacy: 'all_contacts',
    expiryDuration: '24h',
    createdAt: now - 2 * hour,
    expiresAt: now + 22 * hour,
    viewedByMe: false,
    viewsCount: 42,
    reactions: ['🔥', '❤️', '🎉'],
    likedByMe: false,
  },
  {
    id: 'st_04',
    authorId: 'chat_marcus',
    authorName: 'Marcus Vance',
    authorUsername: 'mvance.webrtc',
    authorAvatarColor: '#6366F1',
    authorAvatarUrl: AVATAR_3D_BY_ID.marcus_3d,
    contentType: 'photo',
    text: 'Neon Horizon from the studio 🌉',
    caption: 'Clear skies in San Francisco today! Anyone up for dinner tonight? 🍕',
    mediaUrl: STYLED_3D_SCENES.neonHorizon,
    fontStyle: 'sans',
    backgroundColor: 'linear-gradient(135deg, #78350F 0%, #B45309 50%, #451A03 100%)',
    privacy: 'all_contacts',
    expiryDuration: '24h',
    createdAt: now - 5 * hour,
    expiresAt: now + 19 * hour,
    viewedByMe: true,
    viewsCount: 31,
    reactions: ['👍', '🔥'],
    likedByMe: true,
  },
];

export const INITIAL_LINKED_DEVICES: LinkedDevice[] = [
  {
    id: 'dev_pixel9',
    deviceName: 'My Android Phone',
    deviceType: 'Android',
    lastActive: 'Active now',
    loginDate: 'Oct 01, 2026',
    sessionStatus: 'Active (Current)',
    fingerprint: 'A91C:4F82:D03E:71B4',
  },
  {
    id: 'dev_linux_ws',
    deviceName: 'My Laptop Web Browser',
    deviceType: 'Desktop Web',
    lastActive: '18 minutes ago',
    loginDate: 'Oct 04, 2026',
    sessionStatus: 'Verified Session',
    fingerprint: 'C408:92E1:77A3:05F9',
  },
];
