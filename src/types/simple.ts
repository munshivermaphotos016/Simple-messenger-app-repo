import { EncryptedEnvelope } from '../crypto/e2ee';
import {
  CallBannerStyleId,
  NotificationToneId,
  RingtoneId,
  VibrationPatternId,
} from '../utils/soundEffects';

export type NavigationTab = 'chats' | 'friends' | 'calls' | 'status' | 'settings';

export type ChatFilter =
  | 'all'
  | 'requests'
  | 'unread'
  | 'favorites'
  | 'groups'
  | 'personal'
  | 'archived'
  | 'locked';

export type DisappearingDuration = 'off' | '24h' | '7d' | '30d' | 'custom';

export type AudienceVisibility = 'everyone' | 'contacts' | 'contacts_except' | 'nobody' | 'custom';

export type OnlineVisibilityMode =
  | 'everyone'
  | 'same_as_last_seen'
  | 'contacts'
  | 'contacts_except'
  | 'nobody';

export type MediaQualityOption = 'compress' | 'hd' | 'original';

export type NotificationPreviewMode = 'name_and_message' | 'name_only' | 'new_message_generic' | 'hidden';

export type PerChatNotificationMode = 'default' | 'silent' | 'custom_sound' | 'vibrate' | 'no_vibration' | 'priority' | 'hide_preview' | 'disabled';

export interface PhoneIndexEntry {
  phoneHash: string;
  phoneTailHash: string;
  targetUid: string;
  username: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string;
  identityFingerprint: string;
  updatedAt: number;
}

export interface DirectoryUser {
  uid: string;
  name: string;
  username: string;
  phone: string;
  normalizedPhone: string;
  phoneHash?: string;
  phoneTailHash?: string;
  email: string;
  emailHash?: string;
  about: string;
  avatarColor: string;
  avatarUrl?: string;
  identityFingerprint: string;
  allowUsernameDiscovery: boolean;
  hidePhoneNumber: boolean;
  isOnline?: boolean;
  lastSeen?: string;
  updatedAt: number;
}

export interface SavedContact {
  id: string;
  savedName: string;
  phone: string;
  normalizedPhone: string;
  phoneHash?: string;
  phoneTailHash?: string;
  username?: string;
  email?: string;
  avatarUrl?: string;
  matchedUserUid?: string;
  addedAt: number;
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface ChatPoll {
  id: string;
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
}

export interface AttachmentItem {
  id: string;
  type: 'photo' | 'video' | 'document' | 'pdf' | 'zip' | 'audio' | 'sticker' | 'contact' | 'location';
  name: string;
  sizeBytes: number;
  quality: MediaQualityOption;
  url?: string;
  mimeType?: string;
  uploadProgress: number; // 0 to 100
  isPaused?: boolean;
  isDownloaded?: boolean;
  durationSec?: number;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  caption?: string;
  stickerEmoji?: string;
  locationCoords?: { lat: number; lng: number; label: string };
  contactCard?: { name: string; username: string; phone?: string };
  videoMeta?: {
    trimStart: number;
    trimEnd: number;
    originalDuration?: number;
    playbackRate?: number;
    muted?: boolean;
    volume?: number;
    filterCss?: string;
    rotation?: number;
    flipH?: boolean;
    overlaySummary?: string;
    overlays?: Array<{
      id: string;
      kind: 'text' | 'sticker' | 'stamp';
      text: string;
      stickerUrl?: string;
      x: number;
      y: number;
      scale: number;
      rotation: number;
      flipH?: boolean;
      color: string;
      bgStyle: 'solid' | 'glass' | 'outline' | 'none' | 'pill';
    }>;
  };
}

export interface VoiceNoteData {
  durationSec: number;
  waveform: number[];
  audioDataUrl?: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface MessageItem {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderPhone?: string;
  senderUsername?: string;
  text: string;
  timestamp: number;
  status: 'queued' | 'sent' | 'delivered' | 'read';
  deliveredAt?: number;
  readAt?: number;
  replyToId?: string;
  forwarded?: boolean;
  editedAt?: number;
  deletedForEveryone?: boolean;
  starred?: boolean;
  pinned?: boolean;
  reported?: boolean;
  reactions: MessageReaction[];
  voiceNote?: VoiceNoteData;
  attachment?: AttachmentItem;
  poll?: ChatPoll;
  linkPreview?: {
    url: string;
    title: string;
    domain: string;
    description: string;
  };
  expiresAt?: number;
  e2eeEnvelope: EncryptedEnvelope;
  translatedText?: string;
}

export interface GroupMember {
  id: string;
  name: string;
  username: string;
  phone?: string;
  role: 'admin' | 'member';
  avatarColor: string;
  avatarUrl?: string;
}

export interface GroupSettings {
  description: string;
  inviteLink: string;
  adminApprovalRequired: boolean;
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  members: GroupMember[];
}

export interface ChatConversation {
  id: string;
  peerUid?: string;
  name: string;
  username?: string;
  phone?: string;
  normalizedPhone?: string;
  email?: string;
  about: string;
  avatarColor: string;
  avatarUrl?: string;
  isGroup: boolean;
  isOnline: boolean;
  lastSeen: string;
  isTyping?: boolean;
  pinned: boolean;
  archived: boolean;
  locked: boolean;
  muted: boolean;
  favorite: boolean;
  hasShortcut?: boolean;
  unreadCount: number;
  hasMention: boolean;
  draftText: string;
  disappearing: DisappearingDuration;
  customDisappearingHours?: number;
  notificationMode: PerChatNotificationMode;
  customMessageTone?: NotificationToneId | 'default';
  customRingtone?: RingtoneId | 'default';
  customVideoCallRingtone?: RingtoneId | 'default';
  customVibrationPattern?: VibrationPatternId | 'default';
  customToneDataUrl?: string;
  customRingtoneDataUrl?: string;
  customTheme?: string | 'default';
  customWallpaperStyle?: string | 'default';
  customWallpaperPhotoUrl?: string;
  customWallpaperImage?: string;
  customWallpaperBlur?: number;
  customWallpaperOpacity?: number;
  mediaVisibilityInGallery?: 'default' | 'always' | 'never';
  identityFingerprint: string;
  isVerified: boolean;
  keyChangedWarning?: boolean;
  groupSettings?: GroupSettings;
  isChatRequest?: boolean;
  chatRequestStatus?: 'pending' | 'accepted' | 'declined';
  messages: MessageItem[];
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromUsername: string;
  fromName: string;
  fromAvatarUrl?: string;
  fromAvatarColor?: string;
  toUid: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface UserRecommendation {
  user: DirectoryUser;
  mutualFriendsCount: number;
  reason: string;
  isFriend: boolean;
  requestSent: boolean;
  hasIncomingRequest: boolean;
  incomingRequestId?: string;
}

export interface CallRecord {
  id: string;
  chatId: string;
  participantName: string;
  participantUsername?: string;
  participantPhone?: string;
  avatarColor: string;
  avatarUrl?: string;
  isGroupCall: boolean;
  participantsCount: number;
  callType: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  timestamp: number;
  durationSec: number;
  encryptedProtocol: 'WebRTC DTLS-SRTP';
}

export interface StatusPost {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarColor: string;
  authorAvatarUrl?: string;
  contentType: 'text' | 'photo' | 'video' | 'gif' | 'link';
  text: string;
  caption?: string;
  fontStyle?: 'sans' | 'serif' | 'mono' | 'bold';
  mediaEmoji?: string;
  backgroundColor: string;
  mediaUrl?: string;
  linkUrl?: string;
  privacy: 'all_contacts' | 'selected_contacts' | 'exclude_contacts' | 'nobody';
  expiryDuration?: '24h' | '6h' | '1h' | 'view_once';
  createdAt: number;
  expiresAt: number;
  viewedByMe: boolean;
  viewsCount?: number;
  reactions?: string[];
  likedByMe?: boolean;
}

export interface LinkedDevice {
  id: string;
  deviceName: string;
  deviceType: 'Android' | 'Desktop Web' | 'Tablet' | 'iOS';
  lastActive: string;
  loginDate: string;
  sessionStatus: 'Active (Current)' | 'Verified Session' | 'Idle';
  fingerprint: string;
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  phone: string;
  normalizedPhone: string;
  email?: string;
  authMethod?: 'phone_otp' | 'gmail_otp' | 'both' | 'google_oauth' | 'totp';
  phoneVerified?: boolean;
  emailVerified?: boolean;
  passwordHash?: string;
  twoStepPinHash?: string;
  totpSecret?: string;
  totpEnabled?: boolean;
  verificationToken?: string;
  about: string;
  avatarColor: string;
  avatarUrl?: string;
  allowUsernameDiscovery: boolean;
  hidePhoneNumber: boolean;
  onboardingCompleted: boolean;
  cloudBackupGmail?: string;
}

export type ChatWallpaperStyle =
  | 'theme_img_1'
  | 'theme_img_2'
  | 'theme_img_3'
  | 'theme_img_4'
  | 'obsidian'
  | 'minimal_grid'
  | 'slate_solid'
  | 'midnight_aura'
  | 'aurora_borealis'
  | 'cyber_nebula'
  | 'sunset_horizon'
  | 'oceanic_abyss'
  | 'solar_flare'
  | 'prism_mesh';

export interface ChatWallpaperPreset {
  id: ChatWallpaperStyle;
  label: string;
  category: 'Theme Image' | 'Abstract Gradient' | 'Minimal Surface';
  description: string;
  bgClass: string;
  swatchClass: string;
  imageUrl?: string;
  isDefaultTheme?: boolean;
}

export const CHAT_WALLPAPER_PRESETS: ChatWallpaperPreset[] = [
  {
    id: 'theme_img_1',
    label: 'Botanical Cyber Doodle (Default)',
    category: 'Theme Image',
    description: 'Default app chat background — emerald-teal geometric line art over deep obsidian',
    bgClass: 'bg-slate-950',
    swatchClass: 'bg-emerald-950',
    imageUrl: '/src/assets/images/chat_bg_default_1_1791569064941.jpg',
    isDefaultTheme: true,
  },
  {
    id: 'theme_img_2',
    label: 'Cosmic Nebula Constellations',
    category: 'Theme Image',
    description: 'Deep indigo and neon violet starfield nebula with constellation lines',
    bgClass: 'bg-slate-950',
    swatchClass: 'bg-indigo-950',
    imageUrl: '/src/assets/images/chat_bg_theme_2_1791569104683.jpg',
  },
  {
    id: 'theme_img_3',
    label: 'Aurora Alpine Reflection',
    category: 'Theme Image',
    description: 'Serene midnight alpine peaks under glowing cyan northern lights',
    bgClass: 'bg-slate-950',
    swatchClass: 'bg-cyan-950',
    imageUrl: '/src/assets/images/chat_bg_theme_3_clean_1791569167522.jpg',
  },
  {
    id: 'theme_img_4',
    label: 'Midnight Silk Horizon',
    category: 'Theme Image',
    description: 'Warm golden amber and crimson twilight horizon over dark silk waves',
    bgClass: 'bg-slate-950',
    swatchClass: 'bg-amber-950',
    imageUrl: '/src/assets/images/chat_bg_theme_4_1791569133447.jpg',
  },
  {
    id: 'aurora_borealis',
    label: 'Aurora Borealis',
    category: 'Abstract Gradient',
    description: 'Northern lights blend of emerald, teal, and deep midnight',
    bgClass:
      'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/40 via-teal-950/35 to-slate-950',
    swatchClass: 'bg-gradient-to-br from-emerald-500/70 via-teal-700/65 to-slate-950',
  },
  {
    id: 'cyber_nebula',
    label: 'Cyber Nebula',
    category: 'Abstract Gradient',
    description: 'Cosmic violet, deep indigo, and quantum cyan mesh',
    bgClass:
      'bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-900/45 via-purple-950/35 to-slate-950',
    swatchClass: 'bg-gradient-to-br from-indigo-500/75 via-purple-700/65 to-slate-950',
  },
  {
    id: 'sunset_horizon',
    label: 'Sunset Horizon',
    category: 'Abstract Gradient',
    description: 'Warm twilight gradient of crimson rose, amber, and plum',
    bgClass:
      'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-900/40 via-amber-950/25 to-slate-950',
    swatchClass: 'bg-gradient-to-br from-rose-500/75 via-amber-600/60 to-slate-950',
  },
  {
    id: 'oceanic_abyss',
    label: 'Oceanic Abyss',
    category: 'Abstract Gradient',
    description: 'Bioluminescent cyan and deep sapphire ocean currents',
    bgClass:
      'bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-900/45 via-blue-950/40 to-slate-950',
    swatchClass: 'bg-gradient-to-br from-cyan-400/70 via-blue-700/65 to-slate-950',
  },
  {
    id: 'solar_flare',
    label: 'Solar Flare',
    category: 'Abstract Gradient',
    description: 'Radiant golden amber and warm bronze horizon glow',
    bgClass:
      'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/40 via-orange-950/30 to-slate-950',
    swatchClass: 'bg-gradient-to-br from-amber-400/75 via-orange-700/60 to-slate-950',
  },
  {
    id: 'prism_mesh',
    label: 'Prism Mesh',
    category: 'Abstract Gradient',
    description: 'Multi-spectrum abstract refraction of fuchsia, indigo, and cyan',
    bgClass: 'bg-gradient-to-br from-fuchsia-950/40 via-slate-950 to-cyan-950/40',
    swatchClass: 'bg-gradient-to-br from-fuchsia-500/70 via-indigo-700/60 to-cyan-500/70',
  },
  {
    id: 'midnight_aura',
    label: 'Midnight Aura',
    category: 'Abstract Gradient',
    description: 'Subtle vertical Signal emerald aura over obsidian',
    bgClass: 'bg-gradient-to-b from-slate-950 via-emerald-950/25 to-slate-950',
    swatchClass: 'bg-gradient-to-b from-slate-900 via-emerald-600/60 to-slate-950',
  },
  {
    id: 'obsidian',
    label: 'Obsidian Matte',
    category: 'Minimal Surface',
    description: 'Deep zero-distraction slate surface',
    bgClass: '',
    swatchClass: 'bg-gradient-to-br from-slate-900 via-slate-950 to-black',
  },
  {
    id: 'minimal_grid',
    label: 'Dotted Canvas',
    category: 'Minimal Surface',
    description: 'Subtle modern dot pattern background',
    bgClass: 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]',
    swatchClass:
      'bg-slate-950 bg-[radial-gradient(#475569_1.5px,transparent_1.5px)] [background-size:10px_10px]',
  },
  {
    id: 'slate_solid',
    label: 'Slate Studio',
    category: 'Minimal Surface',
    description: 'Soft elevated matte slate background',
    bgClass: 'bg-slate-900/50',
    swatchClass: 'bg-slate-800',
  },
];

export interface AppSettings {
  // Privacy
  lastSeenVisibility: AudienceVisibility;
  onlineStatusVisibility: OnlineVisibilityMode;
  showOnlineStatus?: boolean; // Master online presence switch (false = don't show online status)
  lastSeenExcludedIds?: string[];
  onlineStatusExcludedIds?: string[];
  profilePhotoVisibility: AudienceVisibility;
  profilePhotoExcludedIds?: string[];
  aboutVisibility: AudienceVisibility;
  statusVisibility: AudienceVisibility;
  readReceipts: boolean;
  typingIndicator: boolean;
  blockedContacts: Array<{ id: string; name: string; username: string; phone?: string }>;

  // Security & Locks
  appLockMethod: 'none' | 'biometric' | 'pin' | 'password';
  appLockPin: string;
  autoLockTimeout: 'immediately' | '30s' | '1m' | '5m' | '15m' | 'restart';
  chatLockEnabled: boolean;
  chatLockPin: string;
  biometricsEnabled: boolean;
  hideRecentAppContent: boolean;
  preventScreenshots: boolean;
  securityNotifications: boolean;
  loginAlerts: boolean;

  // Notifications
  notificationsEnabled: boolean;
  messageNotifications: boolean;
  groupNotifications: boolean;
  callNotifications: boolean;
  statusNotifications: boolean;
  reactionNotifications: boolean;
  mentionNotifications: boolean;
  mediaNotifications: boolean;
  notificationPreview: NotificationPreviewMode;
  privateNotificationsMode: boolean; // Shows "New private message" only
  soundEnabled: boolean;
  inAppChatSoundsEnabled?: boolean;
  vibrationEnabled: boolean;
  ledIndicatorColor: string;
  messageNotificationTone?: NotificationToneId;
  favoriteMessageTone?: NotificationToneId;
  groupNotificationTone?: NotificationToneId;
  statusNotificationTone?: NotificationToneId;
  reactionNotificationTone?: NotificationToneId;
  customMessageToneDataUrl?: string;
  vibrationPattern?: VibrationPatternId;
  favoriteVibrationPattern?: VibrationPatternId;
  groupVibrationPattern?: VibrationPatternId;
  notificationVolume?: number;

  // Call Privacy & Ring Customizations
  incomingCallNotificationStyle: 'show_name' | 'generic_incoming' | 'hide_identity' | 'silent' | 'vibrate_only';
  callRingtone?: RingtoneId;
  favoriteCallRingtone?: RingtoneId;
  videoCallRingtone?: RingtoneId;
  groupCallRingtone?: RingtoneId;
  customRingtoneDataUrl?: string;
  callVibrationPattern?: VibrationPatternId;
  ringtoneVolume?: number;
  incomingCallBannerStyle?: CallBannerStyleId;
  flashScreenOnCall?: boolean;
  announceCallerName?: boolean;
  storeCallHistory: boolean;
  hideCallHistoryFromUI: boolean;
  lockCallHistory: boolean;
  lowDataCallsMode: boolean;
  defaultVideoQuality: 'auto' | 'low' | 'medium' | 'high';

  // Chats & Media
  theme: 'light' | 'dark' | 'amoled' | 'system';
  accentColor: 'emerald' | 'cyan' | 'indigo' | 'amber' | 'rose';
  chatDensity: 'compact' | 'spacious';
  fontSize: 'small' | 'medium' | 'large';
  wallpaperStyle: ChatWallpaperStyle;
  customWallpaperPhotoUrl?: string;
  customWallpaperImage?: string;
  wallpaperBlur?: number;
  wallpaperOpacity?: number;
  wallpaperThemeMigratedV3?: boolean;
  enterKeySends: boolean;
  mediaVisibilityInGallery: boolean;
  autoDownloadMedia: 'never' | 'wifi_only' | 'wifi_and_cellular';
  defaultMediaQuality: MediaQualityOption;
  maxFileSizeMb: number;
  keepChatsArchived: boolean;

  // Status
  statusFeatureEnabled: boolean;

  // Backup
  backupMode: 'none' | 'local_encrypted' | 'cloud_e2ee';
  cloudBackupProvider?: 'google_drive' | 'gmail';
  cloudBackupGmail?: string;
  cloudBackupGmailVerified?: boolean;
  backupFrequency: 'manual' | 'daily' | 'weekly' | 'monthly';
  backupWifiOnly: boolean;
  backupIncludeMedia: boolean;
  lastBackupTimestamp?: number;

  // Permissions & Diagnostics
  contactsPermissionGranted: boolean;
  notificationsPermissionGranted: boolean;
  microphonePermissionGranted: boolean;
  cameraPermissionGranted: boolean;
  optionalDiagnosticsEnabled: boolean;
}
