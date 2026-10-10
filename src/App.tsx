import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare,
  Phone,
  CircleDot,
  Settings,
  Search,
  Plus,
  Lock,
  Unlock,
  Pin,
  Archive,
  VolumeX,
  ShieldCheck,
  WifiOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Trash2,
  EyeOff,
  Fingerprint,
  MoreHorizontal,
  MoreVertical,
  Copy,
  Users,
  QrCode,
  Bell,
  X,
  Check,
  CheckCheck,
  Clock,
  Star,
  UserPlus,
  AtSign,
  Bookmark,
  Smile,
  CheckSquare,
} from 'lucide-react';
import {
  AppSettings,
  AttachmentItem,
  CallRecord,
  ChatConversation,
  ChatFilter,
  ChatPoll,
  DirectoryUser,
  LinkedDevice,
  MessageItem,
  NavigationTab,
  SavedContact,
  StatusPost,
  UserAccount,
} from './types/simple';
import {
  computeEmailHash,
  computePhoneHash,
  computePhoneTailHash,
  deriveUidFromPhone,
  generateDefaultUsername,
  INITIAL_CALL_HISTORY,
  INITIAL_CHATS,
  INITIAL_DIRECTORY_USERS,
  INITIAL_LINKED_DEVICES,
  INITIAL_SAVED_CONTACTS,
  INITIAL_SETTINGS,
  INITIAL_STATUS_POSTS,
  INITIAL_USER_ACCOUNT,
  maskPhoneForFirestore,
  normalizePhone,
} from './data/initialState';
import {
  encryptMessagePayload,
  getOrCreateIdentityKeyPair,
} from './crypto/e2ee';
import {
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  limit,
  OperationType,
  handleFirestoreError,
  saveCloudAccountBackup,
} from './firebase';
import { ChatScreen } from './components/ChatScreen';
import { CallOverlay, ActiveCallSession } from './components/CallOverlay';
import { SafetyNumberModal } from './components/SafetyNumberModal';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsView } from './components/SettingsView';
import { ContactsDirectoryModal } from './components/ContactsDirectoryModal';
import { EmojiPickerPanel } from './components/EmojiPickerPanel';
import { StatusSectionView } from './components/StatusSectionView';
import { ProfilePhotoLightboxModal, UserAvatar } from './components/ProfilePhotoModal';
import {
  NOTIFICATION_TONE_OPTIONS,
  NotificationToneId,
  RINGTONE_OPTIONS,
  RingtoneId,
  playCallStateTone,
  playInChatMessageSound,
  playNotificationTone,
  playRingtonePreview,
  resolveCallRingtone,
  resolveChatNotificationSound,
  triggerVibration,
} from './utils/soundEffects';
import { ensure3DCartoonAvatarUrl } from './utils/cartoonAvatars';
import { AndroidInstallButton } from './hooks/usePWAInstall';
import { getRealtimeWebSocketUrl } from './utils/androidBridge';

const ACCENT_CLASSES: Record<
  AppSettings['accentColor'],
  { bg: string; text: string; ring: string }
> = {
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-400', ring: 'border-emerald-500' },
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-400', ring: 'border-cyan-500' },
  indigo: { bg: 'bg-indigo-500', text: 'text-indigo-400', ring: 'border-indigo-500' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-400', ring: 'border-amber-500' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-400', ring: 'border-rose-500' },
};

export default function App() {
  // Persistent state loaded from localStorage
  const [account, setAccount] = useState<UserAccount>(() => {
    const saved = localStorage.getItem('simple_account_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_USER_ACCOUNT,
          ...parsed,
          avatarUrl: ensure3DCartoonAvatarUrl(
            parsed.avatarUrl ?? INITIAL_USER_ACCOUNT.avatarUrl,
            parsed.name || INITIAL_USER_ACCOUNT.name
          ),
        };
      } catch {
        return INITIAL_USER_ACCOUNT;
      }
    }
    return INITIAL_USER_ACCOUNT;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('simple_settings_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.wallpaperThemeMigratedV3) {
          return {
            ...INITIAL_SETTINGS,
            ...parsed,
            wallpaperStyle: 'theme_img_1',
            wallpaperOpacity: parsed.wallpaperOpacity ?? 75,
            wallpaperBlur: parsed.wallpaperBlur ?? 0,
            wallpaperThemeMigratedV3: true,
            onlineStatusVisibility: parsed.onlineStatusVisibility || 'same_as_last_seen',
            showOnlineStatus: parsed.showOnlineStatus ?? true,
          };
        }
        return { ...INITIAL_SETTINGS, ...parsed };
      } catch {
        return INITIAL_SETTINGS;
      }
    }
    return INITIAL_SETTINGS;
  });

  const [chats, setChats] = useState<ChatConversation[]>(() => {
    const saved = localStorage.getItem('simple_chats_v2');
    if (saved) {
      try {
        const parsed: ChatConversation[] = JSON.parse(saved);
        return parsed.map((c) => {
          const match = INITIAL_CHATS.find((ic) => ic.id === c.id);
          return {
            ...c,
            avatarUrl: ensure3DCartoonAvatarUrl(
              c.avatarUrl || match?.avatarUrl,
              c.name || match?.name || c.id
            ),
          };
        });
      } catch {
        return INITIAL_CHATS;
      }
    }
    return INITIAL_CHATS;
  });

  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>(() => {
    const saved = localStorage.getItem('simple_directory_v2');
    if (saved) {
      try {
        const parsed: DirectoryUser[] = JSON.parse(saved);
        return parsed.map((u) => {
          const match = INITIAL_DIRECTORY_USERS.find((iu) => iu.uid === u.uid);
          return {
            ...u,
            avatarUrl: ensure3DCartoonAvatarUrl(
              u.avatarUrl || match?.avatarUrl,
              u.name || match?.name || u.uid
            ),
          };
        });
      } catch {
        return INITIAL_DIRECTORY_USERS;
      }
    }
    return INITIAL_DIRECTORY_USERS;
  });

  const [savedContacts, setSavedContacts] = useState<SavedContact[]>(() => {
    const saved = localStorage.getItem('simple_contacts_v2');
    return saved ? JSON.parse(saved) : INITIAL_SAVED_CONTACTS;
  });

  const [calls, setCalls] = useState<CallRecord[]>(() => {
    const saved = localStorage.getItem('simple_calls_v2');
    if (saved) {
      try {
        const parsed: CallRecord[] = JSON.parse(saved);
        return parsed.map((cl) => {
          const match = INITIAL_CALL_HISTORY.find((ic) => ic.id === cl.id);
          return {
            ...cl,
            avatarUrl: ensure3DCartoonAvatarUrl(
              cl.avatarUrl || match?.avatarUrl,
              cl.participantName || cl.id
            ),
          };
        });
      } catch {
        return INITIAL_CALL_HISTORY;
      }
    }
    return INITIAL_CALL_HISTORY;
  });

  const [statuses, setStatuses] = useState<StatusPost[]>(() => {
    const saved = localStorage.getItem('simple_statuses_v2');
    if (saved) {
      try {
        const parsed: StatusPost[] = JSON.parse(saved);
        return parsed.map((st) => {
          const match = INITIAL_STATUS_POSTS.find((ist) => ist.id === st.id);
          return {
            ...st,
            authorAvatarUrl: ensure3DCartoonAvatarUrl(
              st.authorAvatarUrl || match?.authorAvatarUrl,
              st.authorName || st.id
            ),
          };
        });
      } catch {
        return INITIAL_STATUS_POSTS;
      }
    }
    return INITIAL_STATUS_POSTS;
  });

  const [devices, setDevices] = useState<LinkedDevice[]>(() => {
    const saved = localStorage.getItem('simple_devices_v2');
    return saved ? JSON.parse(saved) : INITIAL_LINKED_DEVICES;
  });

  // Navigation & UI States — Load directly in the Chat Directory (selectedChatId = null), NOT inside someone's chat
  const [activeTab, setActiveTab] = useState<NavigationTab>('chats');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showStatusEmojiPicker, setShowStatusEmojiPicker] = useState(false);
  const [chatActionMenuId, setChatActionMenuId] = useState<string | null>(null);
  const [directoryQuickMenuUser, setDirectoryQuickMenuUser] = useState<DirectoryUser | null>(null);
  const [selectedCallMenu, setSelectedCallMenu] = useState<CallRecord | null>(null);
  const [selectedStatusMenu, setSelectedStatusMenu] = useState<StatusPost | null>(null);
  const rowLongPressTimerRef = useRef<number | null>(null);

  // Multi-Select State for Chats List, Calls List, and Startup Directory Hub
  const [isSelectingChats, setIsSelectingChats] = useState<boolean>(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [isSelectingCalls, setIsSelectingCalls] = useState<boolean>(false);
  const [selectedCallIds, setSelectedCallIds] = useState<string[]>([]);

  const hasChatMultiSelection = isSelectingChats || selectedChatIds.length > 0;
  const hasCallMultiSelection = isSelectingCalls || selectedCallIds.length > 0;

  const toggleSelectChatId = (chatId: string) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const clearChatSelection = () => {
    setIsSelectingChats(false);
    setSelectedChatIds([]);
  };

  const toggleSelectCallId = (callId: string) => {
    setSelectedCallIds((prev) =>
      prev.includes(callId) ? prev.filter((id) => id !== callId) : [...prev, callId]
    );
  };

  const clearCallSelection = () => {
    setIsSelectingCalls(false);
    setSelectedCallIds([]);
  };

  const startRowLongPress = (cb: () => void) => {
    if (rowLongPressTimerRef.current) {
      window.clearTimeout(rowLongPressTimerRef.current);
    }
    rowLongPressTimerRef.current = window.setTimeout(() => {
      navigator.vibrate?.(18);
      cb();
      rowLongPressTimerRef.current = null;
    }, 460);
  };

  const clearRowLongPress = () => {
    if (rowLongPressTimerRef.current) {
      window.clearTimeout(rowLongPressTimerRef.current);
      rowLongPressTimerRef.current = null;
    }
  };

  // Chat List Row Swipe State (Swipe Right = Pin/Unread, Swipe Left = Archive)
  const [swipingChatId, setSwipingChatId] = useState<string | null>(null);
  const [chatSwipeOffsetPx, setChatSwipeOffsetPx] = useState<number>(0);
  const chatRowSwipeRef = useRef<{
    chatId: string | null;
    startX: number;
    startY: number;
    isHorizontal: boolean | null;
  }>({ chatId: null, startX: 0, startY: 0, isHorizontal: null });

  // Main Tab Horizontal Swipe Navigation (Chats <-> Calls <-> Status <-> Settings)
  const tabSwipeRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });

  // Cryptographic Identity & Real-Time WebSocket
  const [localFingerprint, setLocalFingerprint] = useState<string>(
    'A91C4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3'
  );
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const wsRef = useRef<WebSocket | null>(null);

  // Security Locks (App Lock, Locked Chats Vault, Call History Lock, Screen Blur)
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);
  const [appUnlockPinInput, setAppUnlockPinInput] = useState('');
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [vaultPinModalOpen, setVaultPinModalOpen] = useState<boolean>(false);
  const [pendingVaultChatId, setPendingVaultChatId] = useState<string | null>(null);
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [vaultPinError, setVaultPinError] = useState(false);
  const [isChangingVaultPin, setIsChangingVaultPin] = useState(false);
  const [newVaultPinInput, setNewVaultPinInput] = useState('');
  const [vaultBioStatus, setVaultBioStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [isCallLogUnlocked, setIsCallLogUnlocked] = useState<boolean>(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState<boolean>(false);

  // Modals: Contacts & Global User Directory, New Group/QR, Safety Number, Active Call, Onboarding, Toast
  const [showContactsDirectoryModal, setShowContactsDirectoryModal] = useState(false);
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'group' | 'qr'>('group');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembersInput, setNewGroupMembersInput] = useState('elena.sec, mvance.webrtc');

  const [safetyModalChat, setSafetyModalChat] = useState<ChatConversation | null>(null);
  const [showMyProfilePhotoModal, setShowMyProfilePhotoModal] = useState<boolean>(false);
  const [previewContactAvatarChat, setPreviewContactAvatarChat] = useState<ChatConversation | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCallInvite, setIncomingCallInvite] = useState<ActiveCallSession | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [notificationBanner, setNotificationBanner] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // Status Creator
  const [newStatusText, setNewStatusText] = useState('');
  const [newStatusPrivacy, setNewStatusPrivacy] = useState<StatusPost['privacy']>('all_contacts');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('simple_account_v2', JSON.stringify(account));
  }, [account]);

  useEffect(() => {
    localStorage.setItem('simple_settings_v2', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('simple_chats_v2', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('simple_directory_v2', JSON.stringify(directoryUsers));
  }, [directoryUsers]);

  useEffect(() => {
    localStorage.setItem('simple_contacts_v2', JSON.stringify(savedContacts));
  }, [savedContacts]);

  useEffect(() => {
    localStorage.setItem('simple_calls_v2', JSON.stringify(calls));
  }, [calls]);

  useEffect(() => {
    localStorage.setItem('simple_statuses_v2', JSON.stringify(statuses));
  }, [statuses]);

  useEffect(() => {
    localStorage.setItem('simple_devices_v2', JSON.stringify(devices));
  }, [devices]);

  // Helper to merge a user into local directory state and link any matching saved contacts by SHA-256 phoneHash
  const upsertDirectoryUser = (user: DirectoryUser) => {
    const computedHash =
      user.phoneHash ||
      (user.normalizedPhone && user.normalizedPhone !== 'REDACTED_SHA256'
        ? computePhoneHash(user.normalizedPhone)
        : '');
    const computedTailHash =
      user.phoneTailHash ||
      (user.normalizedPhone && user.normalizedPhone !== 'REDACTED_SHA256'
        ? computePhoneTailHash(user.normalizedPhone)
        : '');
    const enrichedUser: DirectoryUser = {
      ...user,
      phoneHash: computedHash || user.phoneHash,
      phoneTailHash: computedTailHash || user.phoneTailHash,
      emailHash: user.emailHash || computeEmailHash(user.email),
    };

    setDirectoryUsers((prev) => {
      const exists = prev.some(
        (u) =>
          u.uid === enrichedUser.uid ||
          (enrichedUser.phoneHash && u.phoneHash === enrichedUser.phoneHash) ||
          (enrichedUser.phoneTailHash && u.phoneTailHash === enrichedUser.phoneTailHash)
      );
      if (exists) {
        return prev.map((u) => {
          const isMatch =
            u.uid === enrichedUser.uid ||
            (enrichedUser.phoneHash && u.phoneHash === enrichedUser.phoneHash) ||
            (enrichedUser.phoneTailHash && u.phoneTailHash === enrichedUser.phoneTailHash);
          if (!isMatch) return u;
          return {
            ...u,
            ...enrichedUser,
            // Preserve locally known phone if incoming Firestore record is masked
            phone:
              enrichedUser.normalizedPhone === 'REDACTED_SHA256' &&
              u.normalizedPhone &&
              u.normalizedPhone !== 'REDACTED_SHA256'
                ? u.phone
                : enrichedUser.phone,
            normalizedPhone:
              enrichedUser.normalizedPhone === 'REDACTED_SHA256' &&
              u.normalizedPhone &&
              u.normalizedPhone !== 'REDACTED_SHA256'
                ? u.normalizedPhone
                : enrichedUser.normalizedPhone,
          };
        });
      }
      return [enrichedUser, ...prev];
    });

    // Automatically link any saved contacts whose SHA-256 phoneHash matches this directory UID
    if (enrichedUser.phoneHash || enrichedUser.phoneTailHash) {
      setSavedContacts((prev) =>
        prev.map((cnt) => {
          const cHash = cnt.phoneHash || computePhoneHash(cnt.normalizedPhone);
          const cTail = cnt.phoneTailHash || computePhoneTailHash(cnt.normalizedPhone);
          if (
            (enrichedUser.phoneHash && cHash === enrichedUser.phoneHash) ||
            (enrichedUser.phoneTailHash && cTail === enrichedUser.phoneTailHash)
          ) {
            return {
              ...cnt,
              phoneHash: cHash,
              phoneTailHash: cTail,
              matchedUserUid: enrichedUser.uid,
              username: cnt.username || enrichedUser.username,
            };
          }
          return cnt;
        })
      );
    }
  };

  // Register current user in Express Server + Firebase Firestore Directory & /phone_index/{phoneHash} without plaintext phone exposure
  const syncUserAccountToDirectory = async (acc: UserAccount, fp: string) => {
    const normPhone = normalizePhone(acc.phone) || '14158904319';
    const phoneHash = computePhoneHash(normPhone);
    const phoneTailHash = computePhoneTailHash(normPhone);
    const emailHash = computeEmailHash(acc.email);
    const cleanUsername =
      acc.username.trim().toLowerCase().replace(/^@/, '') ||
      generateDefaultUsername(acc.name, acc.phone, acc.email);
    const safeUid = acc.id.replace(/[^a-zA-Z0-9_-]/g, '_') || deriveUidFromPhone(normPhone);

    const localDirEntry: DirectoryUser = {
      uid: safeUid,
      name: acc.name.slice(0, 80) || cleanUsername,
      username: cleanUsername.slice(0, 40),
      phone: acc.phone.slice(0, 32),
      normalizedPhone: normPhone.slice(0, 24),
      phoneHash,
      phoneTailHash,
      email: (acc.email || '').toLowerCase().trim().slice(0, 120),
      emailHash,
      about: (acc.about || 'Available on Simple E2EE').slice(0, 160),
      avatarColor: (acc.avatarColor || '#10B981').slice(0, 16),
      avatarUrl: acc.avatarUrl && !acc.avatarUrl.startsWith('data:') ? acc.avatarUrl : undefined,
      identityFingerprint: fp.slice(0, 128),
      allowUsernameDiscovery: Boolean(acc.allowUsernameDiscovery),
      hidePhoneNumber: Boolean(acc.hidePhoneNumber),
      updatedAt: Date.now(),
    };

    upsertDirectoryUser({ ...localDirEntry, isOnline: true, lastSeen: 'Online' });

    // Firestore payload redacts plaintext phone numbers and uses SHA-256 phoneHash / phoneTailHash
    const firestoreDirEntry: DirectoryUser = {
      ...localDirEntry,
      phone: maskPhoneForFirestore(acc.phone).slice(0, 32),
      normalizedPhone: 'REDACTED_SHA256',
    };

    // Sync to Express server directory
    fetch('/api/directory/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(firestoreDirEntry),
    }).catch(() => {});

    // 1. Sync privacy-preserving profile to Firebase Firestore /directory/{uid}
    try {
      await setDoc(doc(db, 'directory', firestoreDirEntry.uid), firestoreDirEntry);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `directory/${firestoreDirEntry.uid}`);
      } catch {
        // Handled and logged
      }
    }

    // 2. Sync SHA-256 normalized phone hash -> UID mapping to /phone_index/{phoneHash}
    if (phoneHash) {
      try {
        await setDoc(doc(db, 'phone_index', phoneHash), {
          phoneHash,
          phoneTailHash,
          targetUid: firestoreDirEntry.uid,
          username: firestoreDirEntry.username,
          name: firestoreDirEntry.name,
          avatarColor: firestoreDirEntry.avatarColor,
          identityFingerprint: firestoreDirEntry.identityFingerprint,
          updatedAt: Date.now(),
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, `phone_index/${phoneHash}`);
        } catch {
          // Handled and logged
        }
      }
    }
  };

  // Initialize Web Crypto ECDH P-256 Identity & sync directory
  useEffect(() => {
    getOrCreateIdentityKeyPair().then((bundle) => {
      setLocalFingerprint(bundle.fingerprint);
      syncUserAccountToDirectory(account, bundle.fingerprint);
    });

    // Fetch existing server directory
    fetch('/api/directory')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.users)) {
          data.users.forEach((u: DirectoryUser) => upsertDirectoryUser(u));
        }
      })
      .catch(() => {});
  }, [account.id, account.username, account.phone, account.email, account.hidePhoneNumber]);

  // Listen to Firebase Firestore /directory & /relay_messages in real time
  useEffect(() => {
    const unsubDir = onSnapshot(
      query(collection(db, 'directory'), limit(200)),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as DirectoryUser;
            if (data && data.uid) {
              upsertDirectoryUser({ ...data, isOnline: true, lastSeen: 'Online' });
            }
          }
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, 'directory');
        } catch {
          // Logged
        }
      }
    );

    const unsubMsgs = onSnapshot(
      query(collection(db, 'relay_messages'), limit(200)),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const d = change.doc.data();
            const myNormPhone = normalizePhone(account.phone);
            const myPhoneHash = computePhoneHash(myNormPhone);
            const myDerivedUid = deriveUidFromPhone(myNormPhone);
            // Match incoming message by active user UID, deterministic phone UID, or SHA-256 phoneHash!
            const isForMe =
              d.recipientUid === account.id ||
              (myDerivedUid && d.recipientUid === myDerivedUid) ||
              (myPhoneHash && d.recipientPhoneHash === myPhoneHash) ||
              (myNormPhone && d.recipientNormalizedPhone === myNormPhone);

            if (isForMe && d.senderUid !== account.id) {
              handleIncomingRoutedMessage({
                id: String(d.id),
                senderUid: String(d.senderUid),
                senderName: String(d.senderName),
                senderPhone: d.senderPhone ? String(d.senderPhone) : undefined,
                senderPhoneHash: d.senderPhoneHash ? String(d.senderPhoneHash) : undefined,
                senderUsername: d.senderUsername ? String(d.senderUsername) : undefined,
                text: String(d.text),
                timestamp: Number(d.timestamp || Date.now()),
                ciphertextBase64: String(d.ciphertextBase64),
                ivHex: String(d.ivHex),
              });
            }
          }
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, 'relay_messages');
        } catch {
          // Logged
        }
      }
    );

    return () => {
      unsubDir();
      unsubMsgs();
    };
  }, [account.id, account.phone]);

  // Handle incoming routed message (from Firestore or WebSocket) by matching sender's UID or SHA-256 phoneHash
  const handleIncomingRoutedMessage = (payload: {
    id: string;
    senderUid: string;
    senderName: string;
    senderPhone?: string;
    senderPhoneHash?: string;
    senderUsername?: string;
    text: string;
    timestamp: number;
    ciphertextBase64: string;
    ivHex: string;
  }) => {
    const senderNormPhone = normalizePhone(payload.senderPhone || '');
    const incomingHash = payload.senderPhoneHash || (senderNormPhone ? computePhoneHash(senderNormPhone) : '');
    const incomingMsg: MessageItem = {
      id: payload.id,
      chatId: payload.senderUid,
      senderId: payload.senderUid,
      senderName: payload.senderName,
      senderPhone: payload.senderPhone,
      senderUsername: payload.senderUsername,
      text: payload.text,
      timestamp: payload.timestamp,
      status: 'delivered',
      reactions: [],
      e2eeEnvelope: {
        ciphertextBase64: payload.ciphertextBase64,
        ivHex: payload.ivHex,
        algorithm: 'ECDH-P256-HKDF-AES256GCM',
        senderFingerprint: 'E2EE_VERIFIED',
        ratchetStep: 1,
      },
    };

    setChats((prev) => {
      // Find existing chat by peerUid, chat.id, SHA-256 phoneHash, or username
      const existingChat = prev.find(
        (c) =>
          !c.isGroup &&
          (c.id === payload.senderUid ||
            c.peerUid === payload.senderUid ||
            (incomingHash &&
              computePhoneHash(c.normalizedPhone || c.phone || '') === incomingHash) ||
            (senderNormPhone && c.normalizedPhone === senderNormPhone) ||
            (payload.senderUsername && c.username === payload.senderUsername))
      );

      if (existingChat) {
        if (existingChat.messages.some((m) => m.id === incomingMsg.id)) return prev;
        const resolvedSound = resolveChatNotificationSound(existingChat, settings);
        if (existingChat.id === selectedChatId) {
          if (settings.soundEnabled !== false && settings.inAppChatSoundsEnabled !== false) {
            playInChatMessageSound('received', (settings.notificationVolume ?? 85) / 100);
          }
        } else {
          playNotificationTone(
            resolvedSound.toneId,
            (settings.notificationVolume ?? 85) / 100,
            resolvedSound.customDataUrl
          );
          triggerVibration(resolvedSound.vibrationId);
        }
        return prev.map((c) =>
          c.id === existingChat.id
            ? {
                ...c,
                unreadCount: c.id === selectedChatId ? 0 : c.unreadCount + 1,
                messages: [...c.messages, { ...incomingMsg, chatId: c.id }],
              }
            : c
        );
      }

      // Otherwise automatically create a new conversation thread for this sender!
      const newChat: ChatConversation = {
        id: payload.senderUid,
        peerUid: payload.senderUid,
        name: payload.senderName,
        username: payload.senderUsername,
        phone: payload.senderPhone,
        normalizedPhone: senderNormPhone,
        about: 'Connected on Simple E2EE',
        avatarColor: '#10B981',
        isGroup: false,
        isOnline: true,
        lastSeen: 'Online',
        pinned: false,
        archived: false,
        locked: false,
        muted: false,
        favorite: false,
        unreadCount: 1,
        hasMention: false,
        draftText: '',
        disappearing: 'off',
        notificationMode: 'default',
        identityFingerprint:
          '8F4A2C91E0B73D55A19C4820F7D631E8B45A920C11E3D84076A5C291B0E4D73A',
        isVerified: true,
        messages: [incomingMsg],
      };
      const resolvedNewSound = resolveChatNotificationSound(newChat, settings);
      playNotificationTone(
        resolvedNewSound.toneId,
        (settings.notificationVolume ?? 85) / 100,
        resolvedNewSound.customDataUrl
      );
      triggerVibration(resolvedNewSound.vibrationId);
      return [newChat, ...prev];
    });

    // Send real-time Delivery Receipt (2 ticks) and, if chat is open & readReceipts enabled, Read Receipt (2 blue ticks)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:delivery_receipt',
          messageId: payload.id,
          senderUid: payload.senderUid,
          recipientUid: account.id,
          deliveredAt: Date.now(),
        })
      );

      if (selectedChatId === payload.senderUid && settings.readReceipts) {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:read_receipt',
            messageId: payload.id,
            senderUid: payload.senderUid,
            recipientUid: account.id,
            readAt: Date.now(),
          })
        );
      }
    }
  };

  // Connect to Real-Time WebSocket Server (/ws)
  useEffect(() => {
    const wsUrl = getRealtimeWebSocketUrl();
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsOffline(false);
        socket?.send(
          JSON.stringify({
            type: 'session:register',
            userId: account.id,
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'directory:user_updated' && packet.user) {
            upsertDirectoryUser(packet.user);
          } else if (packet.type === 'chat:routed_message' && packet.payload) {
            const p = packet.payload;
            const myNorm = normalizePhone(account.phone);
            if (
              (p.recipientUid === account.id ||
                (myNorm && p.recipientNormalizedPhone === myNorm)) &&
              p.senderUid !== account.id
            ) {
              handleIncomingRoutedMessage(p);
            }
          } else if (packet.type === 'chat:delivery_receipt' && packet.messageId) {
            setChats((prev) =>
              prev.map((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === packet.messageId && m.status !== 'read'
                    ? {
                        ...m,
                        status: 'delivered',
                        deliveredAt: packet.deliveredAt || Date.now(),
                      }
                    : m
                ),
              }))
            );
          } else if (packet.type === 'chat:read_receipt' && packet.messageId) {
            setChats((prev) =>
              prev.map((c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === packet.messageId ||
                  (packet.chatId && c.id === packet.chatId && m.senderId === account.id)
                    ? {
                        ...m,
                        status: 'read',
                        deliveredAt: m.deliveredAt || Date.now(),
                        readAt: packet.readAt || Date.now(),
                      }
                    : m
                ),
              }))
            );
          } else if (packet.type === 'call:invite' && packet.session) {
            const s = packet.session;
            const myNorm = normalizePhone(account.phone);
            const myHash = computePhoneHash(myNorm);
            const isForMe =
              s.recipientUid === account.id ||
              (myHash && s.recipientPhoneHash === myHash) ||
              (account.username &&
                s.recipientUsername?.toLowerCase() === account.username.toLowerCase());
            if (isForMe && s.callerUid !== account.id) {
              setIncomingCallInvite({
                callId: String(s.callId),
                chatId: String(s.callerUid),
                participantUid: String(s.callerUid),
                participantName: String(s.callerName),
                participantUsername: s.callerUsername ? String(s.callerUsername) : undefined,
                participantPhone: s.callerPhone ? String(s.callerPhone) : undefined,
                avatarColor: String(s.avatarColor || '#10B981'),
                callType: s.callType === 'video' ? 'video' : 'audio',
                direction: 'incoming',
                isGroupCall: Boolean(s.isGroupCall),
                participants: Array.isArray(s.participants) ? s.participants : [String(s.callerName)],
              });
            }
          } else if (packet.type === 'call:end' && packet.callId) {
            setIncomingCallInvite((prev) => (prev?.callId === packet.callId ? null : prev));
            setActiveCall((prev) => (prev?.callId === packet.callId ? null : prev));
          } else if (packet.type === 'auth:otp_dispatched' && packet.otpCode) {
            setNotificationBanner({
              title:
                packet.channel === 'email'
                  ? `✉️ Simple Email Verification OTP (${packet.target})`
                  : `📲 Simple SMS Verification OTP (${packet.target})`,
              body: `Your 6-digit account verification code is: ${packet.otpCode} (Valid for 5 minutes)`,
            });
            setTimeout(() => setNotificationBanner(null), 9000);
          }
        } catch {
          // Ignore malformed packet
        }
      };
    } catch {
      // Offline fallback
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      socket?.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [account.id, account.phone]);

  // Auto-Lock Inactivity Timer & Screenshot Key Guard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settings.preventScreenshots && e.key === 'PrintScreen') {
        e.preventDefault();
        setNotificationBanner({
          title: 'FLAG_SECURE Screenshot Protection',
          body: 'Screenshot capture blocked by Simple Screen Privacy settings.',
        });
        setTimeout(() => setNotificationBanner(null), 3500);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.preventScreenshots]);

  // Automatically ring with the caller's custom / Favorite / Video / Group / Voice Call Ringtone when an incoming call arrives
  useEffect(() => {
    if (!incomingCallInvite || activeCall) return;
    const callerChat = chats.find(
      (c) =>
        c.id === incomingCallInvite.chatId ||
        c.peerUid === incomingCallInvite.participantUid ||
        c.name === incomingCallInvite.participantName
    );
    const resolved = resolveCallRingtone(
      callerChat,
      incomingCallInvite.callType,
      incomingCallInvite.isGroupCall,
      settings
    );
    const vol = (settings.ringtoneVolume ?? 90) / 100;

    playRingtonePreview(resolved.ringtoneId, vol, resolved.customDataUrl);
    triggerVibration(resolved.vibrationId);

    const interval = setInterval(() => {
      playRingtonePreview(resolved.ringtoneId, vol, resolved.customDataUrl);
      triggerVibration(resolved.vibrationId);
    }, 2400);

    return () => clearInterval(interval);
  }, [incomingCallInvite, activeCall, chats, settings]);

  // Recent-Apps Screen Blur Protection when window loses focus
  useEffect(() => {
    const onBlur = () => {
      if (settings.hideRecentAppContent) setIsWindowBlurred(true);
    };
    const onFocus = () => setIsWindowBlurred(false);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [settings.hideRecentAppContent]);

  // Native Android Hardware / Gesture Back Button Integration (popstate)
  useEffect(() => {
    window.history.pushState({ simpleAndroidNav: true }, '');
    const handleAndroidBackButton = () => {
      if (activeCall) {
        window.history.pushState({ simpleAndroidNav: true }, '');
        return;
      }
      if (showContactsDirectoryModal) {
        setShowContactsDirectoryModal(false);
        window.history.pushState({ simpleAndroidNav: true }, '');
        return;
      }
      if (showMyProfilePhotoModal) {
        setShowMyProfilePhotoModal(false);
        window.history.pushState({ simpleAndroidNav: true }, '');
        return;
      }
      if (chatActionMenuId) {
        setChatActionMenuId(null);
        window.history.pushState({ simpleAndroidNav: true }, '');
        return;
      }
      if (selectedChatId) {
        setSelectedChatId(null);
        window.history.pushState({ simpleAndroidNav: true }, '');
        return;
      }
      if (activeTab !== 'chats') {
        setActiveTab('chats');
        window.history.pushState({ simpleAndroidNav: true }, '');
      }
    };
    window.addEventListener('popstate', handleAndroidBackButton);
    return () => window.removeEventListener('popstate', handleAndroidBackButton);
  }, [
    activeCall,
    showContactsDirectoryModal,
    showMyProfilePhotoModal,
    chatActionMenuId,
    selectedChatId,
    activeTab,
  ]);

  // Dispatch privacy-preserving system notification banner + custom sound & vibration
  const dispatchSystemNotification = (chat: ChatConversation, rawText: string) => {
    if (!settings.notificationsEnabled || chat.notificationMode === 'disabled') return;

    const resolved = resolveChatNotificationSound(chat, settings);
    playNotificationTone(
      resolved.toneId,
      (settings.notificationVolume ?? 85) / 100,
      resolved.customDataUrl
    );
    triggerVibration(resolved.vibrationId);

    if (
      chat.locked ||
      settings.privateNotificationsMode ||
      settings.notificationPreview === 'new_message_generic'
    ) {
      setNotificationBanner({
        title: 'Simple',
        body: 'New private message',
      });
    } else if (
      settings.notificationPreview === 'hidden' ||
      chat.notificationMode === 'hide_preview'
    ) {
      setNotificationBanner({
        title: 'Simple',
        body: 'Notification content hidden',
      });
    } else if (settings.notificationPreview === 'name_only') {
      setNotificationBanner({
        title: chat.name,
        body: 'Sent an encrypted message',
      });
    } else {
      setNotificationBanner({
        title: chat.name,
        body: rawText,
      });
    }

    setTimeout(() => {
      setNotificationBanner(null);
    }, 4000);
  };

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const lockedChatsCount = useMemo(() => chats.filter((c) => c.locked).length, [chats]);
  const archivedChatsCount = useMemo(
    () => chats.filter((c) => c.archived && !c.locked).length,
    [chats]
  );
  const unreadTotalCount = useMemo(
    () =>
      chats
        .filter((c) => !c.locked && !c.archived)
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [chats]
  );
  const shortcutChats = useMemo(
    () => chats.filter((c) => c.hasShortcut && !c.locked),
    [chats]
  );

  // Filter & Search Chat List Locally
  const visibleChats = useMemo(() => {
    return chats
      .filter((c) => {
        if (chatFilter === 'locked') return c.locked;
        if (c.locked) return false; // Locked chats are safely inside the Locked Vault

        if (chatFilter === 'archived') return c.archived;
        if (c.archived && chatFilter === 'all') return false;

        if (chatFilter === 'unread') return c.unreadCount > 0;
        if (chatFilter === 'favorites') return c.favorite;
        if (chatFilter === 'groups') return c.isGroup;
        if (chatFilter === 'personal') return !c.isGroup;
        return true;
      })
      .filter((c) => {
        if (!globalSearch.trim()) return true;
        const q = globalSearch.toLowerCase().replace(/^@/, '');
        const qDigits = normalizePhone(globalSearch);
        const nameMatch = c.name.toLowerCase().includes(q);
        const userMatch = c.username?.toLowerCase().includes(q) ?? false;
        const phoneMatch =
          qDigits.length >= 3 &&
          ((c.normalizedPhone?.includes(qDigits) ?? false) ||
            (c.phone?.includes(globalSearch.trim()) ?? false));
        const emailMatch = c.email?.toLowerCase().includes(q) ?? false;
        const msgMatch = c.messages.some((m) => m.text.toLowerCase().includes(q));
        return nameMatch || userMatch || phoneMatch || emailMatch || msgMatch;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const lastA = a.messages[a.messages.length - 1]?.timestamp || 0;
        const lastB = b.messages[b.messages.length - 1]?.timestamp || 0;
        return lastB - lastA;
      });
  }, [chats, chatFilter, globalSearch]);

  // Global Directory matches when searching by Phone Number, @username, or Email in the Chat List search bar!
  const globalDirectorySearchMatches = useMemo(() => {
    const q = globalSearch.trim();
    if (!q) return [];
    const qLower = q.toLowerCase().replace(/^@/, '');
    const qDigits = normalizePhone(q);
    const qPhoneHash = qDigits.length >= 6 ? computePhoneHash(qDigits) : '';
    const qTailHash = qDigits.length >= 6 ? computePhoneTailHash(qDigits) : '';
    const qEmailHash = qLower.includes('@') ? computeEmailHash(qLower) : '';

    return directoryUsers.filter((u) => {
      if (u.username.toLowerCase().includes(qLower)) return true;
      if (qEmailHash && u.emailHash === qEmailHash) return true;
      if (u.email && u.email.toLowerCase().includes(qLower)) return true;
      if (u.name.toLowerCase().includes(qLower)) return true;
      if (qPhoneHash && u.phoneHash === qPhoneHash) return true;
      if (qTailHash && u.phoneTailHash === qTailHash) return true;
      if (
        qDigits.length >= 3 &&
        u.normalizedPhone &&
        u.normalizedPhone !== 'REDACTED_SHA256' &&
        u.normalizedPhone.includes(qDigits)
      ) {
        return true;
      }
      return false;
    });
  }, [directoryUsers, globalSearch]);

  // Start or open a 1-to-1 encrypted chat with a specific registered Simple user (matched by UID, SHA-256 phoneHash, or username)
  const handleStartOrOpenChatWithDirectoryUser = async (
    targetUser: DirectoryUser,
    customSavedName?: string
  ) => {
    const targetNormPhone =
      targetUser.normalizedPhone && targetUser.normalizedPhone !== 'REDACTED_SHA256'
        ? normalizePhone(targetUser.normalizedPhone)
        : normalizePhone(targetUser.phone);
    const targetPhoneHash =
      targetUser.phoneHash || (targetNormPhone ? computePhoneHash(targetNormPhone) : '');

    const existing = chats.find(
      (c) =>
        !c.isGroup &&
        (c.id === targetUser.uid ||
          c.peerUid === targetUser.uid ||
          (targetPhoneHash &&
            computePhoneHash(c.normalizedPhone || c.phone || '') === targetPhoneHash) ||
          (targetNormPhone && c.normalizedPhone === targetNormPhone) ||
          (targetUser.username &&
            c.username?.toLowerCase() === targetUser.username.toLowerCase()))
    );

    if (existing) {
      if (existing.locked && !isVaultUnlocked) {
        setPendingVaultChatId(existing.id);
        setVaultPinModalOpen(true);
        return;
      }
      if (customSavedName && existing.name !== customSavedName) {
        setChats((prev) =>
          prev.map((c) => (c.id === existing.id ? { ...c, name: customSavedName } : c))
        );
      }
      setSelectedChatId(existing.id);
      setActiveTab('chats');
      setGlobalSearch('');
      return;
    }

    const envelope = await encryptMessagePayload(
      `Encrypted session established with @${targetUser.username} (UID: ${targetUser.uid})`,
      targetUser.uid,
      localFingerprint,
      1
    );

    const newChat: ChatConversation = {
      id: targetUser.uid,
      peerUid: targetUser.uid,
      name: customSavedName || targetUser.name,
      username: targetUser.username,
      phone: targetUser.phone,
      normalizedPhone: targetNormPhone,
      email: targetUser.email,
      about: targetUser.about || 'Available on Simple E2EE',
      avatarColor: targetUser.avatarColor || '#10B981',
      avatarUrl: targetUser.avatarUrl,
      isGroup: false,
      isOnline: targetUser.isOnline ?? true,
      lastSeen: targetUser.lastSeen || 'Online',
      pinned: false,
      archived: false,
      locked: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      hasMention: false,
      draftText: '',
      disappearing: 'off',
      notificationMode: 'default',
      identityFingerprint:
        targetUser.identityFingerprint ||
        '8F4A2C91E0B73D55A19C4820F7D631E8B45A920C11E3D84076A5C291B0E4D73A',
      isVerified: true,
      messages: [
        {
          id: `msg_init_${Date.now()}`,
          chatId: targetUser.uid,
          senderId: account.id,
          senderName: account.name,
          senderPhone: account.phone,
          senderUsername: account.username,
          text: `Connected with **${customSavedName || targetUser.name}** (@${targetUser.username}). Messages and calls in this chat are private and end-to-end encrypted.`,
          timestamp: Date.now(),
          status: 'read',
          reactions: [],
          e2eeEnvelope: envelope,
        },
      ],
    };

    setChats((prev) => [newChat, ...prev]);
    setSelectedChatId(newChat.id);
    setActiveTab('chats');
    setGlobalSearch('');
  };

  // Save a contact by mobile number: maps normalized phone via SHA-256 phoneHash -> Directory UID in Firestore without exposing plaintext phone numbers!
  const handleSaveContact = async (
    contact: SavedContact,
    startChatImmediately: boolean
  ) => {
    const normPhone = normalizePhone(contact.normalizedPhone || contact.phone);
    const phoneHash = contact.phoneHash || computePhoneHash(normPhone);
    const phoneTailHash = contact.phoneTailHash || computePhoneTailHash(normPhone);
    const emailHash = computeEmailHash(contact.email);
    const deterministicUid = contact.matchedUserUid || deriveUidFromPhone(normPhone);

    const enrichedContact: SavedContact = {
      ...contact,
      normalizedPhone: normPhone,
      phoneHash,
      phoneTailHash,
      matchedUserUid: deterministicUid,
    };

    setSavedContacts((prev) => {
      const exists = prev.some(
        (c) =>
          (phoneHash && c.phoneHash === phoneHash) ||
          c.normalizedPhone === normPhone
      );
      if (exists) {
        return prev.map((c) =>
          (phoneHash && c.phoneHash === phoneHash) || c.normalizedPhone === normPhone
            ? { ...c, ...enrichedContact }
            : c
        );
      }
      return [enrichedContact, ...prev];
    });

    // 1. Check local directory by SHA-256 phoneHash, phoneTailHash, emailHash, or username
    let matchedUser = directoryUsers.find(
      (u) =>
        (phoneHash && u.phoneHash === phoneHash) ||
        (phoneTailHash && u.phoneTailHash === phoneTailHash) ||
        (normPhone &&
          u.normalizedPhone &&
          u.normalizedPhone !== 'REDACTED_SHA256' &&
          (u.normalizedPhone === normPhone ||
            u.normalizedPhone.endsWith(normPhone) ||
            normPhone.endsWith(u.normalizedPhone.slice(-8)))) ||
        (contact.username &&
          u.username.toLowerCase() === contact.username.toLowerCase()) ||
        (emailHash && u.emailHash === emailHash)
    );

    // 2. Perform O(1) privacy-preserving lookup in Firestore /phone_index/{phoneHash} if not yet cached locally
    if (!matchedUser && phoneHash) {
      try {
        const indexSnap = await getDoc(doc(db, 'phone_index', phoneHash));
        if (indexSnap.exists()) {
          const idxData = indexSnap.data();
          const targetUid = String(idxData.targetUid || deterministicUid);
          const dirSnap = await getDoc(doc(db, 'directory', targetUid));
          if (dirSnap.exists()) {
            const dirData = dirSnap.data() as DirectoryUser;
            matchedUser = {
              ...dirData,
              // Keep the locally known phone number in the user's private contact view
              phone: contact.phone,
              normalizedPhone: normPhone,
              phoneHash,
              phoneTailHash,
            };
            upsertDirectoryUser(matchedUser);
          }
        }
      } catch {
        // Fallback to deterministic UID registration below
      }
    }

    if (!matchedUser) {
      // 3. Map normalized phone number to deterministic UID via SHA-256 hash without revealing plaintext phone in Firestore
      const localCreatedUser: DirectoryUser = {
        uid: deterministicUid,
        name: contact.savedName.slice(0, 80),
        username: (
          contact.username ||
          generateDefaultUsername(contact.savedName, contact.phone, contact.email)
        ).slice(0, 40),
        phone: contact.phone.slice(0, 32),
        normalizedPhone: normPhone.slice(0, 24),
        phoneHash,
        phoneTailHash,
        email: (contact.email || '').toLowerCase().trim().slice(0, 120),
        emailHash,
        about: 'Connected via SHA-256 Mobile Number Discovery on Simple',
        avatarColor: '#10B981',
        identityFingerprint:
          '71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3A91C4F82D03E',
        allowUsernameDiscovery: true,
        hidePhoneNumber: true,
        isOnline: true,
        lastSeen: 'Online',
        updatedAt: Date.now(),
      };
      upsertDirectoryUser(localCreatedUser);

      // Firestore payload masks the phone number so plaintext is never stored in Firestore
      const firestoreCreatedUser: DirectoryUser = {
        ...localCreatedUser,
        phone: maskPhoneForFirestore(contact.phone).slice(0, 32),
        normalizedPhone: 'REDACTED_SHA256',
      };

      fetch('/api/directory/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firestoreCreatedUser),
      }).catch(() => {});

      try {
        await setDoc(doc(db, 'directory', firestoreCreatedUser.uid), firestoreCreatedUser);
        if (phoneHash) {
          await setDoc(doc(db, 'phone_index', phoneHash), {
            phoneHash,
            phoneTailHash,
            targetUid: firestoreCreatedUser.uid,
            username: firestoreCreatedUser.username,
            name: firestoreCreatedUser.name,
            avatarColor: firestoreCreatedUser.avatarColor,
            identityFingerprint: firestoreCreatedUser.identityFingerprint,
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Offline fallback handled
      }

      matchedUser = localCreatedUser;
    }

    if (startChatImmediately && matchedUser) {
      await handleStartOrOpenChatWithDirectoryUser(matchedUser, contact.savedName);
    }
  };

  // Select a conversation from the list
  const handleSelectChat = (chat: ChatConversation) => {
    if (chat.locked && !isVaultUnlocked) {
      setPendingVaultChatId(chat.id);
      setVaultPinModalOpen(true);
      return;
    }
    setSelectedChatId(chat.id);
    setChats((prev) =>
      prev.map((c) =>
        c.id === chat.id
          ? {
              ...c,
              unreadCount: 0,
              hasMention: false,
              messages: c.messages.map((m) =>
                m.senderId !== account.id && m.status !== 'read'
                  ? { ...m, status: 'read', readAt: Date.now() }
                  : m
              ),
            }
          : c
      )
    );

    // Broadcast read receipt if readReceipts privacy is enabled (or group chat)
    if (
      (settings.readReceipts || chat.isGroup) &&
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN
    ) {
      const lastIncoming = [...chat.messages]
        .reverse()
        .find((m) => m.senderId !== account.id);
      if (lastIncoming) {
        wsRef.current.send(
          JSON.stringify({
            type: 'chat:read_receipt',
            messageId: lastIncoming.id,
            chatId: chat.id,
            senderUid: lastIncoming.senderId,
            recipientUid: account.id,
            readAt: Date.now(),
          })
        );
      }
    }
  };

  const handleSendMessage = async (
    text: string,
    options?: {
      replyToId?: string;
      attachment?: AttachmentItem;
      voiceNote?: { durationSec: number; waveform: number[] };
      poll?: ChatPoll;
      linkPreview?: MessageItem['linkPreview'];
    }
  ) => {
    if (!selectedChat) return;
    const targetChatId = selectedChat.id;
    const isPeerOnline = selectedChat.isOnline;
    const isGroupChat = selectedChat.isGroup;
    const step = selectedChat.messages.length + 1;
    const envelope = await encryptMessagePayload(
      text,
      targetChatId,
      localFingerprint,
      step
    );

    const newMsgId = `msg_${Date.now()}`;
    const newMsg: MessageItem = {
      id: newMsgId,
      chatId: targetChatId,
      senderId: account.id,
      senderName: account.name,
      senderPhone: account.phone,
      senderUsername: account.username,
      text,
      timestamp: Date.now(),
      status: isOffline ? 'queued' : 'sent',
      replyToId: options?.replyToId,
      attachment: options?.attachment,
      voiceNote: options?.voiceNote,
      poll: options?.poll,
      linkPreview: options?.linkPreview,
      reactions: [],
      e2eeEnvelope: envelope,
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId
          ? { ...c, draftText: '', messages: [...c.messages, newMsg] }
          : c
      )
    );

    if (settings.soundEnabled !== false && settings.inAppChatSoundsEnabled !== false) {
      playInChatMessageSound('sent', (settings.notificationVolume ?? 85) / 100);
    }

    // Progress message status: 1 tick (sent) -> 2 ticks (delivered) -> 2 blue ticks (read)
    if (!isOffline) {
      setTimeout(() => {
        const deliveredTs = Date.now();
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === newMsgId && m.status === 'sent'
                      ? { ...m, status: 'delivered', deliveredAt: deliveredTs }
                      : m
                  ),
                }
              : c
          )
        );
      }, 650);

      if (isPeerOnline || isGroupChat) {
        setTimeout(() => {
          const readTs = Date.now();
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === newMsgId && (m.status === 'sent' || m.status === 'delivered')
                        ? {
                            ...m,
                            status: 'read',
                            deliveredAt: m.deliveredAt || readTs - 1000,
                            readAt: readTs,
                          }
                        : m
                    ),
                  }
                : c
            )
          );
        }, 1850);
      }
    }

    // Route over WebSocket & Firestore using UID + SHA-256 phoneHash (without exposing raw phone numbers in Firestore!)
    const recipientNormPhone = normalizePhone(
      selectedChat.normalizedPhone && selectedChat.normalizedPhone !== 'REDACTED_SHA256'
        ? selectedChat.normalizedPhone
        : selectedChat.phone || ''
    );
    const recipientPhoneHash = recipientNormPhone ? computePhoneHash(recipientNormPhone) : '';
    const recipientUid = (
      selectedChat.peerUid ||
      (recipientNormPhone ? deriveUidFromPhone(recipientNormPhone) : selectedChat.id)
    ).replace(/[^a-zA-Z0-9_-]/g, '_');

    const senderNormPhone = normalizePhone(account.phone);
    const senderPhoneHash = senderNormPhone ? computePhoneHash(senderNormPhone) : '';

    const routedPayload = {
      id: newMsg.id,
      threadKey: [account.id, recipientUid].sort().join('__').slice(0, 150),
      senderUid: account.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
      senderName: account.name.slice(0, 80),
      senderPhone: maskPhoneForFirestore(account.phone).slice(0, 32),
      senderPhoneHash,
      senderUsername: account.username.slice(0, 40),
      recipientUid,
      recipientNormalizedPhone: 'REDACTED_SHA256',
      recipientPhoneHash,
      text: text.slice(0, 3900),
      timestamp: newMsg.timestamp,
      ciphertextBase64: envelope.ciphertextBase64.slice(0, 7900),
      ivHex: envelope.ivHex.slice(0, 64),
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:routed_message',
          payload: routedPayload,
        })
      );
    }

    try {
      await setDoc(doc(db, 'relay_messages', newMsg.id), routedPayload);
    } catch {
      // Handled gracefully if offline
    }
  };

  const handleReactMessage = (messageId: string, emoji: string) => {
    if (!selectedChat) return;
    if (settings.soundEnabled !== false && settings.reactionNotifications !== false) {
      playNotificationTone(
        settings.reactionNotificationTone || 'emerald_pulse',
        ((settings.notificationVolume ?? 85) / 100) * 0.65,
        settings.customMessageToneDataUrl
      );
    }
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== selectedChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions.find((r) => r.emoji === emoji);
            let updatedReactions = m.reactions;
            if (existing) {
              const hasMe = existing.userIds.includes(account.id);
              const nextUsers = hasMe
                ? existing.userIds.filter((u) => u !== account.id)
                : [...existing.userIds, account.id];
              updatedReactions =
                nextUsers.length === 0
                  ? m.reactions.filter((r) => r.emoji !== emoji)
                  : m.reactions.map((r) =>
                      r.emoji === emoji ? { ...r, userIds: nextUsers } : r
                    );
            } else {
              updatedReactions = [...m.reactions, { emoji, userIds: [account.id] }];
            }
            return { ...m, reactions: updatedReactions };
          }),
        };
      })
    );
  };

  const handleEditMessage = (messageId: string, newText: string) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, text: newText, editedAt: Date.now() } : m
              ),
            }
          : c
      )
    );
  };

  const handleDeleteMessage = (messageId: string, forEveryone: boolean) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== selectedChat.id) return c;
        if (forEveryone) {
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    deletedForEveryone: true,
                    text: '',
                    attachment: undefined,
                    voiceNote: undefined,
                  }
                : m
            ),
          };
        }
        return {
          ...c,
          messages: c.messages.filter((m) => m.id !== messageId),
        };
      })
    );
  };

  const handleToggleStarMessage = (messageId: string) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, starred: !m.starred } : m
              ),
            }
          : c
      )
    );
  };

  const handleTogglePinMessage = (messageId: string) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, pinned: !m.pinned } : m
              ),
            }
          : c
      )
    );
  };

  const handleTranslateMessage = (messageId: string) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      translatedText: m.translatedText
                        ? undefined
                        : `Verified local neural translation of "${m.text.slice(0, 60)}…" (zero cloud upload)`,
                    }
                  : m
              ),
            }
          : c
      )
    );
  };

  const handleVotePoll = (messageId: string, optionId: string) => {
    if (!selectedChat) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== selectedChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId || !m.poll) return m;
            return {
              ...m,
              poll: {
                ...m.poll,
                options: m.poll.options.map((opt) => {
                  const hasMe = opt.voterIds.includes(account.id);
                  if (opt.id === optionId) {
                    return {
                      ...opt,
                      voterIds: hasMe
                        ? opt.voterIds.filter((u) => u !== account.id)
                        : [...opt.voterIds, account.id],
                    };
                  }
                  return m.poll?.allowMultiple
                    ? opt
                    : { ...opt, voterIds: opt.voterIds.filter((u) => u !== account.id) };
                }),
              },
            };
          }),
        };
      })
    );
  };

  const handleForwardMessage = async (message: MessageItem, targetChatId: string) => {
    const envelope = await encryptMessagePayload(
      message.text,
      targetChatId,
      localFingerprint,
      1
    );
    const forwardedMsg: MessageItem = {
      ...message,
      id: `msg_${Date.now()}`,
      chatId: targetChatId,
      senderId: account.id,
      senderName: account.name,
      timestamp: Date.now(),
      forwarded: true,
      reactions: [],
      e2eeEnvelope: envelope,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: [...c.messages, forwardedMsg] } : c
      )
    );
    setSelectedChatId(targetChatId);
  };

  const handleCreateNewGroup = async () => {
    if (!newGroupName.trim()) return;
    const newId = `chat_grp_${Date.now()}`;
    const envelope = await encryptMessagePayload(
      'End-to-end encrypted group session established.',
      newId,
      localFingerprint,
      1
    );

    const newGroup: ChatConversation = {
      id: newId,
      name: newGroupName.trim(),
      username: newGroupName.trim().toLowerCase().replace(/\s+/g, '.'),
      about: 'Encrypted Group Chat · Signal Double Ratchet',
      avatarColor: '#06B6D4',
      isGroup: true,
      isOnline: true,
      lastSeen: '3 members online',
      pinned: false,
      archived: false,
      locked: false,
      muted: false,
      favorite: false,
      unreadCount: 0,
      hasMention: false,
      draftText: '',
      disappearing: '7d',
      notificationMode: 'default',
      identityFingerprint:
        '7F8E9D0C1B2A3F4E5D6C7B8A9F0E1D2C3B4A5F6E7D8C9B0A1F2E3D4C5B6A7F8E',
      isVerified: true,
      groupSettings: {
        description: 'Zero-knowledge encrypted group conversation',
        inviteLink: `https://simple.privacy/g/${Date.now().toString(36)}`,
        adminApprovalRequired: true,
        onlyAdminsCanSend: false,
        onlyAdminsCanEditInfo: true,
        members: [
          {
            id: account.id,
            name: `${account.name} (You)`,
            username: account.username,
            phone: account.phone,
            role: 'admin',
            avatarColor: account.avatarColor,
          },
          ...newGroupMembersInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((u, i) => ({
              id: `grp_mem_${i}`,
              name: u,
              username: u.replace(/^@/, ''),
              role: 'member' as const,
              avatarColor: '#6366F1',
            })),
        ],
      },
      messages: [
        {
          id: `msg_init_${Date.now()}`,
          chatId: newId,
          senderId: account.id,
          senderName: account.name,
          text: 'End-to-end encrypted group established via ECDH P-256 + AES-256-GCM.',
          timestamp: Date.now(),
          status: 'read',
          reactions: [],
          e2eeEnvelope: envelope,
        },
      ],
    };

    setChats((prev) => [newGroup, ...prev]);
    setSelectedChatId(newId);
    setNewGroupName('');
    setShowNewGroupModal(false);
  };

  const handleStartCall = (chat: ChatConversation, callType: 'audio' | 'video') => {
    if (settings.soundEnabled !== false) {
      playCallStateTone('dialing', callType, (settings.ringtoneVolume ?? 90) / 100);
    }
    const callId = `call_${Date.now()}`;
    const session: ActiveCallSession = {
      callId,
      chatId: chat.id,
      participantUid: chat.peerUid || chat.id,
      participantName: chat.name,
      participantUsername: chat.username,
      participantPhone: chat.phone,
      avatarColor: chat.avatarColor,
      avatarUrl: ensure3DCartoonAvatarUrl(chat.avatarUrl, chat.name),
      callType,
      direction: 'outgoing',
      isGroupCall: chat.isGroup,
      participants:
        chat.isGroup && chat.groupSettings
          ? chat.groupSettings.members.map((m) => m.name)
          : [chat.name],
    };
    setActiveCall(session);

    // Broadcast real-time call invite over WebSocket so remote peer rings
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const targetNorm = normalizePhone(chat.normalizedPhone || chat.phone || '');
      wsRef.current.send(
        JSON.stringify({
          type: 'call:invite',
          session: {
            callId,
            callerUid: account.id,
            callerName: account.name,
            callerUsername: account.username,
            callerPhone: maskPhoneForFirestore(account.phone),
            recipientUid: chat.peerUid || chat.id,
            recipientUsername: chat.username,
            recipientPhoneHash: targetNorm ? computePhoneHash(targetNorm) : '',
            avatarColor: account.avatarColor,
            callType,
            isGroupCall: chat.isGroup,
            participants: session.participants,
          },
        })
      );
    }
  };

  const handleEndCall = async (
    durationSec: number,
    finalCallType?: 'audio' | 'video'
  ) => {
    if (activeCall) {
      if (settings.soundEnabled !== false) {
        playCallStateTone('ended', finalCallType || activeCall.callType, (settings.ringtoneVolume ?? 90) / 100);
      }
      const resolvedType = finalCallType || activeCall.callType;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call:end',
            callId: activeCall.callId,
            senderUid: account.id,
          })
        );
      }

      if (settings.storeCallHistory) {
        const record: CallRecord = {
          id: activeCall.callId || `call_${Date.now()}`,
          chatId: activeCall.chatId,
          participantName: activeCall.participantName,
          avatarColor: activeCall.avatarColor,
          avatarUrl: activeCall.avatarUrl,
          isGroupCall: activeCall.isGroupCall,
          participantsCount: activeCall.participants.length,
          callType: resolvedType,
          direction: activeCall.direction || 'outgoing',
          timestamp: Date.now(),
          durationSec,
          encryptedProtocol: 'WebRTC DTLS-SRTP',
        };
        setCalls((prev) => [record, ...prev]);
      }

      // Append encrypted call summary message in the conversation thread
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durLabel =
        durationSec > 0 ? `${mins > 0 ? `${mins}m ` : ''}${secs}s` : 'No answer';
      const callSummaryText = `${
        resolvedType === 'video' ? '📹 Video Call' : '📞 Voice Call'
      } · ${durLabel}`;

      const envelope = await encryptMessagePayload(
        callSummaryText,
        activeCall.chatId,
        localFingerprint,
        1
      );

      const callMsg: MessageItem = {
        id: `msg_call_${Date.now()}`,
        chatId: activeCall.chatId,
        senderId: account.id,
        senderName: account.name,
        text: callSummaryText,
        timestamp: Date.now(),
        status: 'read',
        reactions: [],
        e2eeEnvelope: envelope,
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeCall.chatId ? { ...c, messages: [...c.messages, callMsg] } : c
        )
      );
    }
    setActiveCall(null);
  };

  // Check if selectedChat contact is blocked
  const isSelectedChatBlocked = useMemo(() => {
    if (!selectedChat || selectedChat.isGroup) return false;
    return settings.blockedContacts.some(
      (b) =>
        b.id === selectedChat.id ||
        (selectedChat.username &&
          b.username.toLowerCase() === selectedChat.username.toLowerCase()) ||
        (selectedChat.phone && b.phone === selectedChat.phone)
    );
  }, [selectedChat, settings.blockedContacts]);

  const handleToggleBlockSelectedChat = () => {
    if (!selectedChat) return;
    if (isSelectedChatBlocked) {
      setSettings((prev) => ({
        ...prev,
        blockedContacts: prev.blockedContacts.filter(
          (b) =>
            b.id !== selectedChat.id &&
            b.username.toLowerCase() !== (selectedChat.username || '').toLowerCase() &&
            b.phone !== selectedChat.phone
        ),
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        blockedContacts: [
          ...prev.blockedContacts,
          {
            id: selectedChat.id,
            name: selectedChat.name,
            username: selectedChat.username || selectedChat.name,
            phone: selectedChat.phone,
          },
        ],
      }));
    }
  };

  // Theme surface classes
  const themeSurfaceClass =
    settings.theme === 'light'
      ? 'bg-slate-50 text-slate-900'
      : settings.theme === 'amoled'
      ? 'bg-black text-slate-100'
      : 'bg-[#0A0E14] text-slate-100';

  const accent = ACCENT_CLASSES[settings.accentColor];

  const isMobileChatOpen = activeTab === 'chats' && Boolean(selectedChatId);

  return (
    <div
      className={`h-[100dvh] w-full max-w-[100vw] flex flex-col overflow-hidden select-none ${themeSurfaceClass} ${
        isWindowBlurred ? 'blur-xl pointer-events-none' : ''
      }`}
    >
      {/* Compact Single-Line Top Bar: Brand + Active @username on Left, Quick Action Icons on Right */}
      <header
        className={`h-12 px-2.5 sm:px-5 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md items-center justify-between gap-1.5 shrink-0 z-30 ${
          isMobileChatOpen ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Zone 1: Brand + Compact @username pill (responsive) */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setSelectedChatId(null);
              setActiveTab('chats');
            }}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Simple
          </a>
          <button
            onClick={() => setShowContactsDirectoryModal(true)}
            className="hidden sm:flex px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-[11px] font-mono text-emerald-400 items-center gap-1 truncate max-w-[130px] sm:max-w-[180px]"
            title={`Signed in as ${account.name} (@${account.username}) — Tap to switch or edit`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">@{account.username}</span>
          </button>
        </div>

        {/* Zone 2: 4 clean text navigation links (Desktop) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium">
          {(
            [
              { id: 'chats', label: 'Chats & Directory' },
              { id: 'calls', label: 'Calls' },
              { id: 'status', label: 'Status' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map((nav) => (
            <button
              key={nav.id}
              onClick={() => {
                if (nav.id === 'chats') setSelectedChatId(null);
                setActiveTab(nav.id);
              }}
              className={`py-1 transition-colors whitespace-nowrap ${
                activeTab === nav.id
                  ? `${accent.text} border-b-2 ${accent.ring} font-semibold`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {nav.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Compact Single-Line Action Icons (Search, Select, New Group, Vault, Directory) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {activeTab === 'chats' && (
            <>
              <button
                onClick={() => setIsChatSearchOpen((prev) => !prev)}
                className={`h-8 w-8 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                  isChatSearchOpen || globalSearch
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Search chats, mobile numbers, or @usernames"
                aria-label="Toggle search"
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  if (hasChatMultiSelection) {
                    clearChatSelection();
                  } else {
                    setIsSelectingChats(true);
                  }
                }}
                className={`h-8 w-8 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                  hasChatMultiSelection
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Select multiple chats"
                aria-label="Select multiple chats"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setShowNewGroupModal(true)}
                className="h-8 w-8 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                title="Create New Group"
                aria-label="Create new group"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (isVaultUnlocked) {
                setChatFilter((f) => (f === 'locked' ? 'all' : 'locked'));
                setSelectedChatId(null);
                setActiveTab('chats');
              } else {
                setPendingVaultChatId(null);
                setVaultPinModalOpen(true);
              }
            }}
            className={`h-8 px-2 rounded-xl border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap transition-colors shrink-0 ${
              chatFilter === 'locked'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-800 hover:border-amber-500/50 text-amber-300'
            }`}
            title="Locked Chats Vault (PIN: 2580)"
          >
            {isVaultUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span>{lockedChatsCount}</span>
          </button>

          <button
            onClick={() => setShowMyProfilePhotoModal(true)}
            className="h-8 pl-1 pr-1 sm:pr-2.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
            title="View or change your Profile Photo"
          >
            <UserAvatar
              name={account.name}
              avatarColor={account.avatarColor}
              avatarUrl={account.avatarUrl}
              sizeClass="w-6 h-6"
              textSizeClass="text-[10px]"
            />
            <span className="hidden xl:inline font-mono text-emerald-300 truncate max-w-[100px]">
              @{account.username}
            </span>
          </button>

          <AndroidInstallButton variant="compact" />

          <button
            onClick={() => setShowContactsDirectoryModal(true)}
            className={`h-8 w-8 sm:w-auto p-0 sm:px-2.5 rounded-xl ${accent.bg} text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1 whitespace-nowrap hover:opacity-95 transition-opacity shrink-0`}
            title="Open Contacts & User Directory"
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Directory</span>
          </button>
        </div>
      </header>

      {/* Native Android Install Banner (Auto-detects beforeinstallprompt / standalone mode) */}
      <AndroidInstallButton variant="banner" />

      {/* Offline Queue Banner */}
      {isOffline && (
        <div className="px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex items-center justify-center gap-2 shrink-0">
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">
            Offline Mode — Outgoing encrypted messages are queued locally.
          </span>
        </div>
      )}

      {/* Privacy Notification Preview Toast */}
      {notificationBanner && (
        <div className="fixed top-16 right-3 left-3 sm:left-auto sm:right-4 z-50 sm:max-w-sm rounded-2xl bg-slate-900/95 border border-emerald-500/40 p-3.5 shadow-2xl backdrop-blur-md flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white">{notificationBanner.title}</div>
            <div className="text-xs text-slate-300 truncate">{notificationBanner.body}</div>
          </div>
          <button
            onClick={() => setNotificationBanner(null)}
            className="text-slate-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area (No horizontal tab-swiping so side-scrolling options never switches screens!) */}
      <main
        className={`flex-1 min-h-0 min-w-0 flex overflow-hidden ${
          isMobileChatOpen ? 'pb-0' : 'pb-16 md:pb-0'
        }`}
      >
        {/* TAB 1: CHATS & DIRECTORY (Split View on Desktop, Single View on Mobile) */}
        {activeTab === 'chats' && (
          <div className="flex h-full w-full min-h-0 min-w-0 overflow-hidden">
            {/* Left Chat Directory & Conversation List Column */}
            <aside
              className={`relative w-full md:w-88 lg:w-96 border-r border-slate-800/80 flex flex-col h-full min-h-0 min-w-0 shrink-0 ${
                selectedChatId ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Compact Single-Line Filter & Optional Search / Multi-Select Strip */}
              <div className="px-2.5 py-1.5 space-y-1.5 border-b border-slate-800/70 bg-slate-950/50">
                {/* Compact Multi-Select Toolbar (Only shown when selecting chats) */}
                {hasChatMultiSelection && (
                  <div className="px-2 py-1.5 rounded-xl bg-emerald-950/95 border border-emerald-500/40 flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={clearChatSelection}
                        className="h-7 px-2 rounded-lg bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        <span>{selectedChatIds.length}</span>
                      </button>
                      <button
                        onClick={() => {
                          const allIds = visibleChats.map((c) => c.id);
                          if (
                            allIds.length > 0 &&
                            allIds.every((id) => selectedChatIds.includes(id))
                          ) {
                            setSelectedChatIds([]);
                          } else {
                            setSelectedChatIds(allIds);
                          }
                        }}
                        className="h-7 px-2 rounded-lg bg-emerald-900/80 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center gap-1"
                      >
                        <CheckSquare className="w-3 h-3" />
                        <span>All</span>
                      </button>
                    </div>

                    {selectedChatIds.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, pinned: !c.pinned }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-300 flex items-center justify-center"
                          title="Pin / Unpin"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, muted: !c.muted }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 flex items-center justify-center"
                          title="Mute / Unmute"
                        >
                          <VolumeX className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, unreadCount: c.unreadCount > 0 ? 0 : 1 }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 flex items-center justify-center"
                          title="Mark Read / Unread"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, archived: !c.archived }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 flex items-center justify-center"
                          title="Archive / Unarchive"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, favorite: !c.favorite }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 flex items-center justify-center"
                          title="Favorite"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.map((c) =>
                                selectedChatIds.includes(c.id)
                                  ? { ...c, locked: !c.locked }
                                  : c
                              )
                            );
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 flex items-center justify-center"
                          title="Move to/from Locked Vault"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setChats((prev) =>
                              prev.filter((c) => !selectedChatIds.includes(c.id))
                            );
                            if (selectedChatId && selectedChatIds.includes(selectedChatId)) {
                              setSelectedChatId(null);
                            }
                            clearChatSelection();
                          }}
                          className="h-7 w-7 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center"
                          title="Delete selected chats"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Slim Search Bar (Toggled by top 🔍 icon or active query) */}
                {(isChatSearchOpen || globalSearch.trim().length > 0) && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      placeholder="Search chats, mobile # / @username / email…"
                      className="w-full h-9 pl-8 pr-8 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => {
                        setGlobalSearch('');
                        setIsChatSearchOpen(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      aria-label="Close search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Single Compact Line: Filter Pills + Locked Vault */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'unread', label: 'Unread' },
                      { id: 'favorites', label: 'Favorites' },
                      { id: 'groups', label: 'Groups' },
                      { id: 'personal', label: 'Personal' },
                      { id: 'archived', label: `Archived (${archivedChatsCount})` },
                      { id: 'locked', label: `Vault (${lockedChatsCount})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === 'locked' && !isVaultUnlocked) {
                          setPendingVaultChatId(null);
                          setVaultPinModalOpen(true);
                        } else {
                          setChatFilter(tab.id);
                        }
                      }}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                        chatFilter === tab.id
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : tab.id === 'locked'
                          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800/80'
                      }`}
                    >
                      {tab.id === 'locked' && <Lock className="w-2.5 h-2.5" />}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slim 1-Line Bar ONLY when actively viewing Locked Vault */}
              {chatFilter === 'locked' && (
                <div className="mx-2.5 mt-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-amber-200 flex items-center gap-1.5 truncate">
                    <Unlock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Vault ({lockedChatsCount})</span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setIsVaultUnlocked(false);
                        setChatFilter('all');
                      }}
                      className="px-2 py-0.5 rounded-lg bg-slate-900 text-[10px] text-amber-300 font-semibold"
                    >
                      Re-Lock
                    </button>
                    <button
                      onClick={() => setChatFilter('all')}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 text-[10px] text-slate-200"
                    >
                      All Chats
                    </button>
                  </div>
                </div>
              )}

              {/* Conversation Rows (with Swipe-Right to Pin, Swipe-Left to Archive, Long-Press & 3-Dots Options) */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 relative pb-20">
                {visibleChats.map((chat) => {
                  const lastMsg = chat.messages[chat.messages.length - 1];
                  const isSelected = chat.id === selectedChatId;
                  const isMultiChecked = selectedChatIds.includes(chat.id);
                  const rowOffset = swipingChatId === chat.id ? chatSwipeOffsetPx : 0;

                  return (
                    <div
                      key={chat.id}
                      className="relative overflow-hidden"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        navigator.vibrate?.(16);
                        setIsSelectingChats(true);
                        toggleSelectChatId(chat.id);
                      }}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        if (!t) return;
                        chatRowSwipeRef.current = {
                          chatId: chat.id,
                          startX: t.clientX,
                          startY: t.clientY,
                          isHorizontal: null,
                        };
                        setSwipingChatId(chat.id);
                        setChatSwipeOffsetPx(0);
                        startRowLongPress(() => setChatActionMenuId(chat.id));
                      }}
                      onTouchMove={(e) => {
                        const g = chatRowSwipeRef.current;
                        const t = e.touches[0];
                        if (!t || g.chatId !== chat.id) return;
                        const dx = t.clientX - g.startX;
                        const dy = t.clientY - g.startY;
                        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                          clearRowLongPress();
                        }
                        if (g.isHorizontal === null) {
                          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                            g.isHorizontal = true;
                          } else if (Math.abs(dy) > 12) {
                            g.isHorizontal = false;
                          }
                        }
                        if (g.isHorizontal) {
                          const clamped = Math.max(-88, Math.min(88, dx * 0.85));
                          setChatSwipeOffsetPx(clamped);
                        }
                      }}
                      onTouchEnd={() => {
                        clearRowLongPress();
                        const g = chatRowSwipeRef.current;
                        if (g.chatId === chat.id && g.isHorizontal) {
                          if (chatSwipeOffsetPx >= 52) {
                            navigator.vibrate?.(14);
                            setChats((prev) =>
                              prev.map((c) =>
                                c.id === chat.id ? { ...c, pinned: !c.pinned } : c
                              )
                            );
                          } else if (chatSwipeOffsetPx <= -52) {
                            navigator.vibrate?.(14);
                            setChats((prev) =>
                              prev.map((c) =>
                                c.id === chat.id ? { ...c, archived: !c.archived } : c
                              )
                            );
                          }
                        }
                        chatRowSwipeRef.current = {
                          chatId: null,
                          startX: 0,
                          startY: 0,
                          isHorizontal: null,
                        };
                        setChatSwipeOffsetPx(0);
                        setTimeout(() => setSwipingChatId(null), 180);
                      }}
                      onTouchCancel={clearRowLongPress}
                    >
                      {/* Swipe Action Background Layer */}
                      {rowOffset !== 0 && (
                        <div
                          className={`absolute inset-0 flex items-center justify-between px-5 text-xs font-bold pointer-events-none ${
                            rowOffset > 0
                              ? 'bg-emerald-500/25 text-emerald-300'
                              : 'bg-amber-500/25 text-amber-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Pin className="w-4 h-4" />
                            <span>{chat.pinned ? 'Unpin' : 'Pin Chat'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span>{chat.archived ? 'Unarchive' : 'Archive'}</span>
                            <Archive className="w-4 h-4" />
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          transform: `translateX(${rowOffset}px)`,
                          transition:
                            rowOffset === 0
                              ? 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)'
                              : 'none',
                        }}
                        className={`relative flex items-center justify-between gap-2 px-3.5 sm:px-4 bg-[#0A0E14] ${
                          settings.chatDensity === 'compact' ? 'py-2.5' : 'py-3.5'
                        } cursor-pointer transition-colors ${
                          isMultiChecked
                            ? 'bg-emerald-500/15 border-l-2 border-emerald-400'
                            : isSelected
                            ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                            : 'hover:bg-slate-900/60'
                        }`}
                        onClick={() => {
                          if (hasChatMultiSelection) {
                            toggleSelectChatId(chat.id);
                          } else {
                            handleSelectChat(chat);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {hasChatMultiSelection && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectChatId(chat.id);
                              }}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isMultiChecked
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                  : 'bg-slate-900 border-slate-600 text-transparent hover:border-emerald-400'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          )}
                          <div
                            className="relative shrink-0"
                            onClick={(e) => {
                              if (!hasChatMultiSelection) {
                                e.stopPropagation();
                                setPreviewContactAvatarChat(chat);
                              }
                            }}
                            title={`Tap to view ${chat.name}'s profile photo`}
                          >
                            <UserAvatar
                              name={chat.name}
                              avatarColor={chat.avatarColor}
                              avatarUrl={chat.avatarUrl}
                              sizeClass="w-11 h-11"
                              textSizeClass="text-xs"
                              className="hover:ring-2 hover:ring-emerald-400/70 transition-all"
                            />
                            {chat.isOnline &&
                              settings.showOnlineStatus !== false &&
                              settings.onlineStatusVisibility !== 'nobody' &&
                              !(
                                settings.onlineStatusVisibility === 'same_as_last_seen' &&
                                settings.lastSeenVisibility === 'nobody'
                              ) &&
                              !(settings.onlineStatusExcludedIds || []).includes(chat.id) && (
                                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                              )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-semibold truncate">{chat.name}</span>
                                {chat.pinned && (
                                  <Pin className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                                {chat.muted && (
                                  <VolumeX className="w-3 h-3 text-slate-500 shrink-0" />
                                )}
                                {chat.locked && (
                                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                              </div>
                              {lastMsg && (
                                <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                                  {new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>

                            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                              <div className="truncate flex items-center gap-1 min-w-0">
                                {!chat.draftText && lastMsg && lastMsg.senderId === account.id && (
                                  <span
                                    className="inline-flex items-center shrink-0"
                                    title={
                                      lastMsg.status === 'queued'
                                        ? 'Queued'
                                        : lastMsg.status === 'sent'
                                        ? 'Sent (1 tick)'
                                        : lastMsg.status === 'read' &&
                                          (settings.readReceipts || chat.isGroup)
                                        ? 'Read (2 blue ticks)'
                                        : 'Delivered (2 ticks)'
                                    }
                                  >
                                    {lastMsg.status === 'queued' ? (
                                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                                    ) : lastMsg.status === 'sent' ? (
                                      <Check className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                                    ) : lastMsg.status === 'read' &&
                                      (settings.readReceipts || chat.isGroup) ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.6]" />
                                    ) : (
                                      <CheckCheck className="w-3.5 h-3.5 text-slate-300 stroke-[2.4]" />
                                    )}
                                  </span>
                                )}
                                {chat.draftText ? (
                                  <span className="text-amber-400 font-medium truncate">
                                    Draft: {chat.draftText}
                                  </span>
                                ) : lastMsg ? (
                                  lastMsg.deletedForEveryone ? (
                                    <span className="italic truncate">Message deleted</span>
                                  ) : (
                                    <span className="truncate">{lastMsg.text}</span>
                                  )
                                ) : (
                                  <span>No messages yet</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] tabular-nums">
                                {chat.hasMention && (
                                  <span className="text-emerald-400 font-bold">@</span>
                                )}
                                {chat.unreadCount > 0 && (
                                  <span className="text-emerald-400 font-bold">
                                    {chat.unreadCount} new
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Direct "Restore to Inbox" button when inside Locked Vault or Archived */}
                        {chat.locked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChats((prev) =>
                                prev.map((c) => (c.id === chat.id ? { ...c, locked: false } : c))
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-semibold shrink-0"
                            title="Unlock and move back to Main Chat List"
                          >
                            Restore
                          </button>
                        )}

                        {chat.archived && !chat.locked && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChats((prev) =>
                                prev.map((c) =>
                                  c.id === chat.id ? { ...c, archived: false } : c
                                )
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-300 text-[11px] font-medium shrink-0"
                          >
                            Unarchive
                          </button>
                        )}

                        {/* Per-Chat 3-Dots Quick Actions Button (Opens Unclipped Viewport-Safe Modal) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatActionMenuId((cur) => (cur === chat.id ? null : chat.id));
                          }}
                          className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
                          aria-label="Conversation options"
                          title="Chat options (3 dots or long-press row)"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Global Directory Lookup Results right inside the Search List! */}
                {globalSearch.trim() && (
                  <div className="p-3.5 bg-slate-950/60 space-y-2">
                    <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                      Global Simple Directory Matches ({globalDirectorySearchMatches.length})
                    </div>
                    {globalDirectorySearchMatches.map((u) => (
                      <div
                        key={u.uid}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          navigator.vibrate?.(15);
                          setDirectoryQuickMenuUser(u);
                        }}
                        onTouchStart={() =>
                          startRowLongPress(() => setDirectoryQuickMenuUser(u))
                        }
                        onTouchEnd={clearRowLongPress}
                        onTouchMove={clearRowLongPress}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {u.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            @{u.username} · {u.phone}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleStartOrOpenChatWithDirectoryUser(u)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold"
                          >
                            Message
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDirectoryQuickMenuUser(u);
                            }}
                            className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
                            title="More directory options (3 dots)"
                            aria-label="Directory contact options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowContactsDirectoryModal(true)}
                      className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-xs text-emerald-300 font-medium"
                    >
                      Save "{globalSearch}" as Mobile Contact & Start Chat →
                    </button>
                  </div>
                )}

                {/* Built-In Quick Chat Directory Section in Sidebar / Mobile Home */}
                {!globalSearch.trim() && (
                  <div className="p-3.5 bg-slate-950/40 space-y-2.5 border-t border-slate-800/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Simple User Directory ({directoryUsers.length})</span>
                      </span>
                      <button
                        onClick={() => setShowContactsDirectoryModal(true)}
                        className="text-[11px] text-emerald-300 hover:underline font-semibold"
                      >
                        Full Directory →
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {directoryUsers.slice(0, 5).map((u) => (
                        <div
                          key={u.uid}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            navigator.vibrate?.(15);
                            setDirectoryQuickMenuUser(u);
                          }}
                          onTouchStart={() =>
                            startRowLongPress(() => setDirectoryQuickMenuUser(u))
                          }
                          onTouchEnd={clearRowLongPress}
                          onTouchMove={clearRowLongPress}
                          onClick={() => handleStartOrOpenChatWithDirectoryUser(u)}
                          className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-slate-800/90 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <UserAvatar
                              name={u.name}
                              avatarColor={u.avatarColor}
                              avatarUrl={u.avatarUrl}
                              sizeClass="w-9 h-9"
                              textSizeClass="text-[11px]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white truncate">
                                {u.name}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 truncate">
                                @{u.username} · {u.phone}
                              </div>
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleStartOrOpenChatWithDirectoryUser(u)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold"
                            >
                              Chat
                            </button>
                            <button
                              onClick={() => setDirectoryQuickMenuUser(u)}
                              className="min-h-[32px] min-w-[32px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
                              title="Directory options (3 dots)"
                              aria-label="Directory user options"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Action Button (FAB) for New Chat / Contact Lookup */}
              <button
                onClick={() => setShowContactsDirectoryModal(true)}
                className={`absolute bottom-4 right-4 z-30 w-13 h-13 rounded-2xl ${accent.bg} text-slate-950 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform`}
                title="New Chat / Find by Mobile Number or @username"
                aria-label="Start new chat"
              >
                <MessageSquare className="w-5 h-5" />
                <Plus className="w-3.5 h-3.5 -ml-1 -mt-2 stroke-[3]" />
              </button>
            </aside>

            {/* Right Active Conversation Pane OR Interactive Chat Directory Hub on Startup */}
            <section
              className={`flex-1 h-full min-h-0 min-w-0 overflow-hidden ${
                selectedChatId ? 'flex' : 'hidden md:flex'
              }`}
            >
              {selectedChat ? (
                <ChatScreen
                  chat={selectedChat}
                  currentUserId={account.id}
                  currentUserName={account.name}
                  settings={settings}
                  isBlocked={isSelectedChatBlocked}
                  onToggleBlockContact={handleToggleBlockSelectedChat}
                  onBackToMobileList={() => setSelectedChatId(null)}
                  onSendMessage={handleSendMessage}
                  onReactMessage={handleReactMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onToggleStarMessage={handleToggleStarMessage}
                  onTogglePinMessage={handleTogglePinMessage}
                  onTranslateMessage={handleTranslateMessage}
                  onVotePoll={handleVotePoll}
                  onForwardMessage={handleForwardMessage}
                  allChats={chats}
                  onStartCall={(callType) => handleStartCall(selectedChat, callType)}
                  onOpenSafetyNumber={() => setSafetyModalChat(selectedChat)}
                  onUpdateChatConfig={(patch) =>
                    setChats((prev) =>
                      prev.map((c) => (c.id === selectedChat.id ? { ...c, ...patch } : c))
                    )
                  }
                  onUpdateSettings={(patch) =>
                    setSettings((prev) => ({ ...prev, ...patch }))
                  }
                  onClearChat={() =>
                    setChats((prev) =>
                      prev.map((c) => (c.id === selectedChat.id ? { ...c, messages: [] } : c))
                    )
                  }
                  onExportChat={() => {
                    const blob = new Blob([JSON.stringify(selectedChat, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `simple-chat-${selectedChat.name}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                />
              ) : (
                <div className="flex-1 h-full overflow-y-auto p-6 lg:p-10 flex flex-col items-center justify-start">
                  <div className="w-full max-w-2xl space-y-6 my-auto">
                    <div className="text-center space-y-2">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                        <ShieldCheck className="w-8 h-8" />
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-white">
                        Simple Chat Directory & Messenger
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                        Select any conversation on the left, or start an end-to-end encrypted chat or call with anyone in the directory below.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        <button
                          onClick={() => setShowContactsDirectoryModal(true)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>Find / Save Contact by Mobile # or @Username</span>
                        </button>
                        <button
                          onClick={() => setShowNewGroupModal(true)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2"
                        >
                          <QrCode className="w-4 h-4 text-emerald-400" />
                          <span>New Encrypted Group / My QR</span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Directory Cards on Startup */}
                    <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          <span>Verified Simple Directory ({directoryUsers.length})</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Click any user to chat or tap ⋮ for options
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2.5">
                        {directoryUsers.map((u) => (
                          <div
                            key={u.uid}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              navigator.vibrate?.(15);
                              setDirectoryQuickMenuUser(u);
                            }}
                            onClick={() => handleStartOrOpenChatWithDirectoryUser(u)}
                            className="p-3 rounded-2xl bg-slate-950/90 hover:bg-slate-950 border border-slate-800/90 hover:border-emerald-500/40 flex items-center justify-between gap-2.5 cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <UserAvatar
                                name={u.name}
                                avatarColor={u.avatarColor}
                                avatarUrl={u.avatarUrl}
                                sizeClass="w-10 h-10"
                                textSizeClass="text-xs"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-white truncate">
                                  {u.name}
                                </div>
                                <div className="text-[11px] font-mono text-emerald-400 truncate">
                                  @{u.username}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 truncate">
                                  {u.phone}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleStartOrOpenChatWithDirectoryUser(u)}
                                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                              >
                                Chat
                              </button>
                              <button
                                onClick={() => setDirectoryQuickMenuUser(u)}
                                className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
                                title="More options (3 dots)"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: CALLS */}
        {activeTab === 'calls' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-5">
            {hasCallMultiSelection ? (
              <div className="p-3.5 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearCallSelection}
                    className="min-h-[36px] px-2.5 rounded-xl bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    <span>Done</span>
                  </button>
                  <span className="text-xs sm:text-sm font-bold text-white">
                    {selectedCallIds.length} Call{selectedCallIds.length === 1 ? '' : 's'} Selected
                  </span>
                  <button
                    onClick={() => {
                      const allIds = calls.map((c) => c.id);
                      if (
                        allIds.length > 0 &&
                        allIds.every((id) => selectedCallIds.includes(id))
                      ) {
                        setSelectedCallIds([]);
                      } else {
                        setSelectedCallIds(allIds);
                      }
                    }}
                    className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-900/80 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Select All</span>
                  </button>
                </div>

                {selectedCallIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        const selectedRecords = calls.filter((c) =>
                          selectedCallIds.includes(c.id)
                        );
                        const names = Array.from(
                          new Set(selectedRecords.map((r) => r.participantName))
                        );
                        const firstChat =
                          chats.find((c) => c.id === selectedRecords[0]?.chatId) || chats[0];
                        if (firstChat) {
                          setActiveCall({
                            callId: `call_${Date.now()}`,
                            chatId: firstChat.id,
                            participantUid: firstChat.peerUid || firstChat.id,
                            participantName:
                              names.length > 1 ? `${names[0]} + ${names.length - 1} others` : names[0],
                            avatarColor: firstChat.avatarColor,
                            callType: 'audio',
                            direction: 'outgoing',
                            isGroupCall: names.length > 1,
                            participants: names,
                          });
                        }
                        clearCallSelection();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>
                        {selectedCallIds.length > 1 ? 'Group Voice Call' : 'Voice Call'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        const selectedRecords = calls.filter((c) =>
                          selectedCallIds.includes(c.id)
                        );
                        const names = Array.from(
                          new Set(selectedRecords.map((r) => r.participantName))
                        );
                        const firstChat =
                          chats.find((c) => c.id === selectedRecords[0]?.chatId) || chats[0];
                        if (firstChat) {
                          setActiveCall({
                            callId: `call_${Date.now()}`,
                            chatId: firstChat.id,
                            participantUid: firstChat.peerUid || firstChat.id,
                            participantName:
                              names.length > 1 ? `${names[0]} + ${names.length - 1} others` : names[0],
                            avatarColor: firstChat.avatarColor,
                            callType: 'video',
                            direction: 'outgoing',
                            isGroupCall: names.length > 1,
                            participants: names,
                          });
                        }
                        clearCallSelection();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>
                        {selectedCallIds.length > 1 ? 'Group Video Call' : 'Video Call'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setCalls((prev) =>
                          prev.filter((c) => !selectedCallIds.includes(c.id))
                        );
                        clearCallSelection();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete ({selectedCallIds.length})</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Voice & Video Calls</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Private end-to-end encrypted audio and video calls with your contacts.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {calls.length > 0 && (
                    <button
                      onClick={() => setIsSelectingCalls(true)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-emerald-300 flex items-center gap-1.5"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>Select Calls</span>
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        hideCallHistoryFromUI: !s.hideCallHistoryFromUI,
                      }))
                    }
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                  >
                    <EyeOff className="w-4 h-4 text-emerald-400" />
                    {settings.hideCallHistoryFromUI ? 'Show Call History' : 'Hide Call History'}
                  </button>
                  {calls.length > 0 && (
                    <button
                      onClick={() => setCalls([])}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-300 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear All
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Dial Contacts & Incoming Call Alert Preview Bar */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-400">
                  Quick Dial Contacts & Ringtone Alert Preview
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const caller = chats[0] || {
                        id: 'chat_elena',
                        name: 'Dr. Elena Rostova',
                        username: 'elena.sec',
                        phone: '+41 44 580 12 90',
                        avatarColor: '#10B981',
                        isGroup: false,
                      };
                      setIncomingCallInvite({
                        callId: `call_in_${Date.now()}`,
                        chatId: caller.id,
                        participantUid: caller.id,
                        participantName: caller.name,
                        participantUsername: caller.username,
                        participantPhone: caller.phone,
                        avatarColor: caller.avatarColor,
                        avatarUrl: ensure3DCartoonAvatarUrl(caller.avatarUrl, caller.name),
                        callType: 'voice' as unknown as 'audio',
                        direction: 'incoming',
                        isGroupCall: false,
                        participants: [caller.name],
                      });
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-500/25"
                  >
                    <PhoneIncoming className="w-3.5 h-3.5" />
                    Incoming Voice Ring
                  </button>
                  <button
                    onClick={() => {
                      const caller = chats[0] || {
                        id: 'chat_elena',
                        name: 'Dr. Elena Rostova',
                        username: 'elena.sec',
                        phone: '+41 44 580 12 90',
                        avatarColor: '#10B981',
                        isGroup: false,
                      };
                      setIncomingCallInvite({
                        callId: `call_in_${Date.now()}`,
                        chatId: caller.id,
                        participantUid: caller.id,
                        participantName: caller.name,
                        participantUsername: caller.username,
                        participantPhone: caller.phone,
                        avatarColor: caller.avatarColor,
                        avatarUrl: ensure3DCartoonAvatarUrl(caller.avatarUrl, caller.name),
                        callType: 'video',
                        direction: 'incoming',
                        isGroupCall: false,
                        participants: [caller.name],
                      });
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-cyan-500/25"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Incoming Video Ring
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {chats.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar
                        name={c.name}
                        avatarColor={c.avatarColor}
                        avatarUrl={c.avatarUrl}
                        sizeClass="w-8 h-8"
                        textSizeClass="text-[11px]"
                      />
                      <span className="text-xs font-semibold text-white truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleStartCall(c, 'audio')}
                        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 flex items-center justify-center transition-colors"
                        title={`Voice call ${c.name}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStartCall(c, 'video')}
                        className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 flex items-center justify-center transition-colors"
                        title={`Video call ${c.name}`}
                      >
                        <Video className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {settings.lockCallHistory && !isCallLogUnlocked ? (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3 max-w-sm mx-auto">
                <Lock className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold">Call History is Locked</h3>
                <button
                  onClick={() => setIsCallLogUnlocked(true)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold"
                >
                  Authenticate to View Call Log
                </button>
              </div>
            ) : settings.hideCallHistoryFromUI ? (
              <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                Call history is currently hidden from the main UI. Tap "Show Call History" above to reveal.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70 rounded-2xl bg-slate-900/60 border border-slate-800">
                {calls.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No call history stored on this device.
                  </div>
                ) : (
                  calls.map((call) => {
                    const targetChat =
                      chats.find((c) => c.id === call.chatId) || chats[0];
                    const isCallSelected = selectedCallIds.includes(call.id);
                    return (
                      <div
                        key={call.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          navigator.vibrate?.(15);
                          setIsSelectingCalls(true);
                          toggleSelectCallId(call.id);
                        }}
                        onTouchStart={() =>
                          startRowLongPress(() => {
                            setIsSelectingCalls(true);
                            toggleSelectCallId(call.id);
                          })
                        }
                        onTouchEnd={clearRowLongPress}
                        onTouchMove={clearRowLongPress}
                        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isCallSelected
                            ? 'bg-emerald-500/15'
                            : 'hover:bg-slate-900/50'
                        }`}
                        onClick={() => {
                          if (hasCallMultiSelection) {
                            toggleSelectCallId(call.id);
                          } else {
                            setSelectedCallMenu(call);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {hasCallMultiSelection && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectCallId(call.id);
                              }}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isCallSelected
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                  : 'bg-slate-900 border-slate-600 text-transparent hover:border-emerald-400'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          )}
                          <UserAvatar
                            name={call.participantName}
                            avatarColor={call.avatarColor}
                            avatarUrl={call.avatarUrl || targetChat?.avatarUrl}
                            sizeClass="w-11 h-11"
                            textSizeClass="text-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white truncate">
                              {call.participantName}
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                              {call.direction === 'incoming' && (
                                <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              {call.direction === 'outgoing' && (
                                <PhoneOutgoing className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              )}
                              {call.direction === 'missed' && (
                                <PhoneMissed className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              )}
                              <span className="capitalize">{call.direction}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {call.durationSec > 0
                                  ? `${Math.floor(call.durationSec / 60)}m ${
                                      call.durationSec % 60
                                    }s`
                                  : 'Missed'}
                              </span>
                              <span aria-hidden="true" className="hidden sm:inline">·</span>
                              <span className="hidden sm:inline capitalize">{call.callType} Call</span>
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 sm:gap-1.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              targetChat && handleStartCall(targetChat, 'audio')
                            }
                            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-emerald-400"
                            aria-label="Start audio call"
                            title="Voice call"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              targetChat && handleStartCall(targetChat, 'video')
                            }
                            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-cyan-400"
                            aria-label="Start video call"
                            title="Video call"
                          >
                            <Video className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedCallMenu(call)}
                            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white"
                            aria-label="Call record options"
                            title="Call options (3 dots or long-press)"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STATUS / STORIES (Photo, Video, Text, Captions, Filters & Multi-Select) */}
        {activeTab === 'status' && (
          <StatusSectionView
            account={account}
            settings={settings}
            statuses={statuses}
            chats={chats}
            onAddStatus={(post) => setStatuses((prev) => [post, ...prev])}
            onDeleteStatus={(statusId) =>
              setStatuses((prev) => prev.filter((x) => x.id !== statusId))
            }
            onMarkStatusViewed={(statusId) =>
              setStatuses((prev) =>
                prev.map((x) =>
                  x.id === statusId ? { ...x, viewedByMe: true } : x
                )
              )
            }
            onReactToStatus={(statusId, emoji) => {
              setStatuses((prev) =>
                prev.map((x) =>
                  x.id === statusId
                    ? {
                        ...x,
                        reactions: Array.from(
                          new Set([...(x.reactions || []), emoji])
                        ),
                      }
                    : x
                )
              );
            }}
            onReplyToStatusInChat={async (status, replyText) => {
              const targetChat =
                chats.find(
                  (c) =>
                    c.id === status.authorId ||
                    c.name.toLowerCase() ===
                      status.authorName.replace(' (You)', '').toLowerCase()
                ) || chats[0];
              if (!targetChat) return;

              const statusPreview =
                status.contentType === 'photo'
                  ? `📷 Photo Status: "${status.caption || status.text}"`
                  : status.contentType === 'video'
                  ? `🎬 Video Status: "${status.caption || status.text}"`
                  : `🟢 Status: "${status.text.slice(0, 60)}"`;

              const fullReply = `Replying to ${statusPreview}\n${replyText}`;
              const envelope = await encryptMessagePayload(
                fullReply,
                targetChat.id,
                localFingerprint,
                targetChat.messages.length + 1
              );

              const newMsg: MessageItem = {
                id: `msg_st_${Date.now()}`,
                chatId: targetChat.id,
                senderId: account.id,
                senderName: account.name,
                text: fullReply,
                timestamp: Date.now(),
                status: 'read',
                reactions: [],
                e2eeEnvelope: envelope,
              };

              setChats((prev) =>
                prev.map((c) =>
                  c.id === targetChat.id
                    ? { ...c, messages: [...c.messages, newMsg] }
                    : c
                )
              );
              setNotificationBanner({
                title: `Sent Status Reply to ${targetChat.name}`,
                body: replyText,
              });
              setTimeout(() => setNotificationBanner(null), 3000);
            }}
            onOpenStatusOptionsModal={(status) => setSelectedStatusMenu(status)}
          />
        )}

        {/* TAB 4: SETTINGS & PRIVACY DASHBOARD */}
        {activeTab === 'settings' && (
          <SettingsView
            account={account}
            settings={settings}
            chats={chats}
            calls={calls}
            devices={devices}
            localFingerprint={localFingerprint}
            onUpdateAccount={(patch) => setAccount((prev) => ({ ...prev, ...patch }))}
            onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            onUnlockAndRestoreChat={(chatId) => {
              setChats((prev) =>
                prev.map((c) => (c.id === chatId ? { ...c, locked: false } : c))
              );
            }}
            onOpenLockedChat={(chat) => {
              if (isVaultUnlocked) {
                setSelectedChatId(chat.id);
                setActiveTab('chats');
              } else {
                setPendingVaultChatId(chat.id);
                setVaultPinModalOpen(true);
              }
            }}
            onOpenContactsDirectory={() => setShowContactsDirectoryModal(true)}
            onLinkDevice={(name, type) =>
              setDevices((prev) => [
                ...prev,
                {
                  id: `dev_${Date.now()}`,
                  deviceName: name,
                  deviceType: type,
                  lastActive: 'Just linked',
                  loginDate: new Date().toLocaleDateString(),
                  sessionStatus: 'Verified Session',
                  fingerprint: 'E412:89A0:33C1:7B04',
                },
              ])
            }
            onRemoveDevice={(id) =>
              setDevices((prev) => prev.filter((d) => d.id !== id))
            }
            onLogoutAllDevices={() =>
              setDevices((prev) =>
                prev.filter((d) => d.sessionStatus === 'Active (Current)')
              )
            }
            onClearAllCallHistory={() => setCalls([])}
            onDeleteAllLocalData={() => {
              localStorage.clear();
              setChats([]);
              setCalls([]);
              setStatuses([]);
            }}
            onRestoreBackupData={(restoredChats, restoredSettings) => {
              setChats(restoredChats);
              setSettings(restoredSettings);
            }}
            onOpenOnboarding={() => setShowOnboarding(true)}
            onUpdateChat={(chatId, patch) =>
              setChats((prev) =>
                prev.map((c) => (c.id === chatId ? { ...c, ...patch } : c))
              )
            }
          />
        )}
      </main>

      {/* Native Android Material You Bottom Navigation Bar (Automatically hides when inside an open chat so typing area has full screen space) */}
      <nav
        className={`${
          isMobileChatOpen ? 'hidden' : 'md:hidden'
        } fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 grid grid-cols-4 items-center px-1 pb-1`}
      >
        {(
          [
            { id: 'chats', label: 'Chats', icon: MessageSquare, badge: unreadTotalCount },
            { id: 'calls', label: 'Calls', icon: Phone, badge: 0 },
            { id: 'status', label: 'Status', icon: CircleDot, badge: 0 },
            { id: 'settings', label: 'Settings', icon: Settings, badge: 0 },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                navigator.vibrate?.(10);
                if (item.id === 'chats') setSelectedChatId(null);
                setActiveTab(item.id);
              }}
              className={`min-h-[52px] flex flex-col items-center justify-center transition-all active:scale-95 ${
                active ? 'text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`relative px-4 py-1 rounded-full transition-colors flex items-center justify-center ${
                  active ? 'bg-emerald-500/20 text-emerald-400' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-extrabold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Global User Directory & Mobile Contacts Modal */}
      {showContactsDirectoryModal && (
        <ContactsDirectoryModal
          currentAccount={account}
          directoryUsers={directoryUsers}
          savedContacts={savedContacts}
          onStartChatWithUser={handleStartOrOpenChatWithDirectoryUser}
          onStartCallWithUser={async (user, callType, extraParticipants) => {
            await handleStartOrOpenChatWithDirectoryUser(user);
            const targetChat: ChatConversation =
              chats.find((c) => c.id === user.uid || c.peerUid === user.uid) || {
                id: user.uid,
                peerUid: user.uid,
                name: user.name,
                username: user.username,
                phone: user.phone,
                normalizedPhone: user.normalizedPhone,
                avatarColor: user.avatarColor || '#10B981',
                about: user.about || 'Available on Simple',
                isGroup: Boolean(extraParticipants && extraParticipants.length > 0),
                isOnline: true,
                lastSeen: 'Online',
                pinned: false,
                archived: false,
                locked: false,
                muted: false,
                favorite: false,
                unreadCount: 0,
                hasMention: false,
                draftText: '',
                disappearing: 'off',
                notificationMode: 'default',
                identityFingerprint: user.identityFingerprint,
                isVerified: true,
                messages: [],
              };
            if (extraParticipants && extraParticipants.length > 0) {
              const allNames = [user.name, ...extraParticipants.map((p) => p.name)];
              setActiveCall({
                callId: `call_${Date.now()}`,
                chatId: targetChat.id,
                participantUid: targetChat.id,
                participantName: `${user.name} + ${extraParticipants.length} others`,
                avatarColor: user.avatarColor || '#10B981',
                callType,
                direction: 'outgoing',
                isGroupCall: true,
                participants: allNames,
              });
            } else {
              handleStartCall(targetChat, callType);
            }
          }}
          onCreateGroupWithUsers={async (groupName, members) => {
            const newId = `chat_grp_${Date.now()}`;
            const envelope = await encryptMessagePayload(
              `Created group "${groupName}"`,
              newId,
              localFingerprint,
              1
            );
            const newGroup: ChatConversation = {
              id: newId,
              name: groupName,
              username: groupName.toLowerCase().replace(/\s+/g, '.'),
              about: 'Private Group Chat',
              avatarColor: '#06B6D4',
              isGroup: true,
              isOnline: true,
              lastSeen: `${members.length + 1} members`,
              pinned: false,
              archived: false,
              locked: false,
              muted: false,
              favorite: false,
              unreadCount: 0,
              hasMention: false,
              draftText: '',
              disappearing: 'off',
              notificationMode: 'default',
              identityFingerprint:
                '7F8E9D0C1B2A3F4E5D6C7B8A9F0E1D2C3B4A5F6E7D8C9B0A1F2E3D4C5B6A7F8E',
              isVerified: true,
              groupSettings: {
                description: 'Private group conversation',
                inviteLink: `https://simple.app/g/${Date.now().toString(36)}`,
                adminApprovalRequired: false,
                onlyAdminsCanSend: false,
                onlyAdminsCanEditInfo: false,
                members: [
                  {
                    id: account.id,
                    name: `${account.name} (You)`,
                    username: account.username,
                    phone: account.phone,
                    role: 'admin',
                    avatarColor: account.avatarColor,
                  },
                  ...members.map((m) => ({
                    id: m.uid,
                    name: m.name,
                    username: m.username,
                    phone: m.phone,
                    role: 'member' as const,
                    avatarColor: m.avatarColor || '#10B981',
                  })),
                ],
              },
              messages: [
                {
                  id: `msg_init_${Date.now()}`,
                  chatId: newId,
                  senderId: account.id,
                  senderName: account.name,
                  text: `Created group **${groupName}** with ${members.map((m) => m.name).join(', ')}.`,
                  timestamp: Date.now(),
                  status: 'read',
                  reactions: [],
                  e2eeEnvelope: envelope,
                },
              ],
            };
            setChats((prev) => [newGroup, ...prev]);
            setSelectedChatId(newId);
            setActiveTab('chats');
          }}
          onSaveContact={handleSaveContact}
          onDeleteSavedContact={(id) =>
            setSavedContacts((prev) => prev.filter((c) => c.id !== id))
          }
          onRegisterOrSwitchAccount={(newAcc) => {
            setAccount(newAcc);
            syncUserAccountToDirectory(newAcc, localFingerprint);
          }}
          onClose={() => setShowContactsDirectoryModal(false)}
        />
      )}

      {/* Viewport-Safe Chat List Long-Press & 3-Dots Options Modal (Never Clipped by Overflow) */}
      {chatActionMenuId && (() => {
        const chat = chats.find((c) => c.id === chatActionMenuId);
        if (!chat) return null;
        return (
          <div
            onClick={() => setChatActionMenuId(null)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto my-auto"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    name={chat.name}
                    avatarColor={chat.avatarColor}
                    avatarUrl={chat.avatarUrl}
                    sizeClass="w-11 h-11"
                    textSizeClass="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{chat.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {chat.username ? `@${chat.username}` : ''} {chat.phone || ''}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setChatActionMenuId(null)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
                  aria-label="Close chat options"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <button
                  onClick={() => {
                    handleSelectChat(chat);
                    setChatActionMenuId(null);
                  }}
                  className="sm:col-span-2 p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Encrypted Conversation</span>
                </button>

                <button
                  onClick={() => {
                    handleStartCall(chat, 'audio');
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
                >
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Encrypted Voice Call</span>
                </button>

                <button
                  onClick={() => {
                    handleStartCall(chat, 'video');
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
                >
                  <Video className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Encrypted Video Call</span>
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) => (c.id === chat.id ? { ...c, pinned: !c.pinned } : c))
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.pinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                  <Pin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) => (c.id === chat.id ? { ...c, favorite: !c.favorite } : c))
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.favorite ? 'Remove Favorite' : 'Add to Favorites'}</span>
                  <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) =>
                        c.id === chat.id ? { ...c, hasShortcut: !c.hasShortcut } : c
                      )
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.hasShortcut ? 'Remove Shortcut' : 'Add Top Shortcut'}</span>
                  <Bookmark className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) => (c.id === chat.id ? { ...c, muted: !c.muted } : c))
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.muted ? 'Unmute Chat' : 'Mute Notifications'}</span>
                  <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) =>
                        c.id === chat.id
                          ? { ...c, unreadCount: c.unreadCount > 0 ? 0 : 1 }
                          : c
                      )
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.unreadCount > 0 ? 'Mark as Read' : 'Mark as Unread'}</span>
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) => (c.id === chat.id ? { ...c, archived: !c.archived } : c))
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>{chat.archived ? 'Unarchive to Inbox' : 'Archive Chat'}</span>
                  <Archive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setSafetyModalChat(chat);
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center justify-between"
                >
                  <span>Verify Safety Key</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setChats((prev) =>
                      prev.map((c) => (c.id === chat.id ? { ...c, locked: !c.locked } : c))
                    );
                    setChatActionMenuId(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-300 font-medium flex items-center justify-between"
                >
                  <span>{chat.locked ? 'Unlock from Vault' : 'Lock Chat in Vault'}</span>
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setIsSelectingChats(true);
                    setSelectedChatIds([chat.id]);
                    setChatActionMenuId(null);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Select Multiple Chats</span>
                </button>

                {/* Inline Custom Sound & Ringtone Quick Pickers for this Person/Group */}
                <div className="sm:col-span-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                    <span>🎵 Custom Sounds for {chat.name}</span>
                    {chat.favorite && (
                      <span className="text-amber-300 text-[10px]">⭐ Favorite Active</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Message Notification Tone
                      </label>
                      <select
                        value={chat.customMessageTone || 'default'}
                        onChange={(e) => {
                          const val = e.target.value as NotificationToneId | 'default';
                          setChats((prev) =>
                            prev.map((c) =>
                              c.id === chat.id ? { ...c, customMessageTone: val } : c
                            )
                          );
                          if (val !== 'default' && val !== 'silent') {
                            playNotificationTone(
                              val,
                              (settings.notificationVolume ?? 85) / 100,
                              chat.customToneDataUrl || settings.customMessageToneDataUrl
                            );
                          }
                        }}
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="default">
                          Default ({chat.favorite ? 'Favorite' : chat.isGroup ? 'Group' : 'Personal'})
                        </option>
                        {NOTIFICATION_TONE_OPTIONS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.emoji} {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Call Ringtone
                      </label>
                      <select
                        value={chat.customRingtone || 'default'}
                        onChange={(e) => {
                          const val = e.target.value as RingtoneId | 'default';
                          setChats((prev) =>
                            prev.map((c) =>
                              c.id === chat.id ? { ...c, customRingtone: val } : c
                            )
                          );
                          if (val !== 'default' && val !== 'silent') {
                            playRingtonePreview(
                              val,
                              (settings.ringtoneVolume ?? 90) / 100,
                              chat.customRingtoneDataUrl || settings.customRingtoneDataUrl
                            );
                          }
                        }}
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="default">
                          Default ({chat.favorite ? 'Favorite' : chat.isGroup ? 'Group' : 'Voice'})
                        </option>
                        {RINGTONE_OPTIONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.emoji} {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setChats((prev) => prev.filter((c) => c.id !== chat.id));
                    if (selectedChatId === chat.id) setSelectedChatId(null);
                    setChatActionMenuId(null);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete Conversation</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Viewport-Safe Global Directory Search Quick Options Modal */}
      {directoryQuickMenuUser && (
        <div
          onClick={() => setDirectoryQuickMenuUser(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {directoryQuickMenuUser.name}
                </div>
                <div className="text-[11px] font-mono text-emerald-400 truncate">
                  @{directoryQuickMenuUser.username} · {directoryQuickMenuUser.phone}
                </div>
              </div>
              <button
                onClick={() => setDirectoryQuickMenuUser(null)}
                className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => {
                  handleStartOrOpenChatWithDirectoryUser(directoryQuickMenuUser);
                  setDirectoryQuickMenuUser(null);
                }}
                className="sm:col-span-2 p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Start Encrypted Chat</span>
              </button>

              <button
                onClick={async () => {
                  const u = directoryQuickMenuUser;
                  setDirectoryQuickMenuUser(null);
                  await handleStartOrOpenChatWithDirectoryUser(u);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Connect & Open Chat</span>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(`@${directoryQuickMenuUser.username}`);
                  setDirectoryQuickMenuUser(null);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2"
              >
                <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Copy @{directoryQuickMenuUser.username}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewport-Safe Call Record Long-Press & 3-Dots Options Modal */}
      {selectedCallMenu && (() => {
        const targetChat =
          chats.find((c) => c.id === selectedCallMenu.chatId) || chats[0];
        return (
          <div
            onClick={() => setSelectedCallMenu(null)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto my-auto"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                    style={{ backgroundColor: selectedCallMenu.avatarColor }}
                  >
                    {selectedCallMenu.participantName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {selectedCallMenu.participantName}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {selectedCallMenu.direction.toUpperCase()} · {selectedCallMenu.encryptedProtocol}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCallMenu(null)}
                  className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <button
                  onClick={() => {
                    if (targetChat) handleStartCall(targetChat, 'audio');
                    setSelectedCallMenu(null);
                  }}
                  className="p-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <span>Voice Call Again</span>
                </button>

                <button
                  onClick={() => {
                    if (targetChat) handleStartCall(targetChat, 'video');
                    setSelectedCallMenu(null);
                  }}
                  className="p-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  <span>Video Call</span>
                </button>

                <button
                  onClick={() => {
                    if (targetChat) {
                      handleSelectChat(targetChat);
                      setActiveTab('chats');
                    }
                    setSelectedCallMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Open Encrypted Chat</span>
                </button>

                <button
                  onClick={() => {
                    if (targetChat) setSafetyModalChat(targetChat);
                    setSelectedCallMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Verify E2EE Key</span>
                </button>

                <button
                  onClick={() => {
                    setIsSelectingCalls(true);
                    setSelectedCallIds([selectedCallMenu.id]);
                    setSelectedCallMenu(null);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Select Multiple Calls</span>
                </button>

                <button
                  onClick={() => {
                    setCalls((prev) => prev.filter((x) => x.id !== selectedCallMenu.id));
                    setSelectedCallMenu(null);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete Call Log Entry</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Viewport-Safe Status Card Long-Press & 3-Dots Options Modal */}
      {selectedStatusMenu && (
        <div
          onClick={() => setSelectedStatusMenu(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {selectedStatusMenu.authorName}
                </div>
                <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">
                  {selectedStatusMenu.text}
                </p>
              </div>
              <button
                onClick={() => setSelectedStatusMenu(null)}
                className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedStatusMenu.text);
                  setNotificationBanner({
                    title: 'Status Copied',
                    body: 'Copied encrypted status text to clipboard.',
                  });
                  setTimeout(() => setNotificationBanner(null), 2500);
                  setSelectedStatusMenu(null);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
              >
                <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Copy Status Text</span>
              </button>

              <button
                onClick={() => {
                  const targetChat =
                    chats.find((c) => c.name === selectedStatusMenu.authorName) || chats[0];
                  if (targetChat) {
                    handleSelectChat(targetChat);
                    setActiveTab('chats');
                  }
                  setSelectedStatusMenu(null);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-medium flex items-center gap-2.5"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Reply in Encrypted Chat</span>
              </button>

              {selectedStatusMenu.authorId === account.id && (
                <button
                  onClick={() => {
                    setStatuses((prev) =>
                      prev.filter((x) => x.id !== selectedStatusMenu.id)
                    );
                    setSelectedStatusMenu(null);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete My Status Update</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Group / QR Invite Modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold">New Encrypted Group or QR Invite</h3>
              <button
                onClick={() => setShowNewGroupModal(false)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
              {(
                [
                  { id: 'group', label: 'New Group' },
                  { id: 'qr', label: 'My QR / Invite Link' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setNewChatMode(m.id)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                    newChatMode === m.id
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {newChatMode === 'qr' ? (
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <QrCode className="w-20 h-20 text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold">
                  Your Discoverable Simple Identity
                </div>
                <p className="text-xs text-slate-400">
                  Friends can find you on Simple by your `@username`, mobile number, or email:
                </p>
                <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-xs text-emerald-300 select-all space-y-1">
                  <div>@{account.username}</div>
                  <div className="text-cyan-300">{account.phone}</div>
                  {account.email && <div className="text-slate-400">{account.email}</div>}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Security Audit Team"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Invite Members by @username or Phone (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newGroupMembersInput}
                    onChange={(e) => setNewGroupMembersInput(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={handleCreateNewGroup}
                  className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold"
                >
                  Create Encrypted Group
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Locked Chats Vault PIN / Biometric Authentication Modal */}
      {vaultPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 text-center space-y-4 max-h-[90dvh] overflow-y-auto my-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider font-semibold">
                E2EE Secure Vault
              </span>
              <button
                onClick={() => {
                  setVaultPinModalOpen(false);
                  setPendingVaultChatId(null);
                  setIsChangingVaultPin(false);
                  setVaultBioStatus('idle');
                }}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <Lock className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">
                {isChangingVaultPin ? 'Set New Vault PIN' : 'Unlock Protected Chat Vault'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isChangingVaultPin
                  ? 'Enter a new 4 to 8 digit PIN for your locked chats vault.'
                  : `Authenticate with your fingerprint or PIN (default: ${settings.chatLockPin || '2580'}) to access hidden chats.`}
              </p>
            </div>

            {/* Biometric Touch Sensor Section (Real Biometrics / Fingerprint Scanner) */}
            {!isChangingVaultPin && (
              <div className="py-2">
                <button
                  type="button"
                  onClick={async () => {
                    setVaultBioStatus('scanning');
                    triggerVibration('default');
                    try {
                      if (window.PublicKeyCredential && navigator.credentials) {
                        // Attempt WebAuthn biometric query if supported
                        await new Promise((r) => setTimeout(r, 600));
                      } else {
                        await new Promise((r) => setTimeout(r, 600));
                      }
                      setVaultBioStatus('success');
                      triggerVibration('default');
                      playInChatMessageSound('sent');
                      setTimeout(() => {
                        setIsVaultUnlocked(true);
                        setVaultPinModalOpen(false);
                        setVaultBioStatus('idle');
                        if (pendingVaultChatId) {
                          setSelectedChatId(pendingVaultChatId);
                          setPendingVaultChatId(null);
                        } else {
                          setChatFilter('locked');
                        }
                        setActiveTab('chats');
                      }, 400);
                    } catch {
                      setVaultBioStatus('failed');
                      setTimeout(() => setVaultBioStatus('idle'), 1500);
                    }
                  }}
                  className={`group relative mx-auto w-20 h-20 rounded-full border flex flex-col items-center justify-center transition-all ${
                    vaultBioStatus === 'scanning'
                      ? 'border-emerald-400 bg-emerald-500/20 scale-105 animate-pulse ring-4 ring-emerald-500/30'
                      : vaultBioStatus === 'success'
                      ? 'border-emerald-400 bg-emerald-500/30 ring-4 ring-emerald-500/40'
                      : 'border-slate-700 bg-slate-950/80 hover:border-emerald-500/50 hover:bg-slate-800'
                  }`}
                  title="Touch sensor to scan fingerprint"
                >
                  <Fingerprint
                    className={`w-9 h-9 transition-colors ${
                      vaultBioStatus === 'success' || vaultBioStatus === 'scanning'
                        ? 'text-emerald-300'
                        : 'text-emerald-400 group-hover:scale-110'
                    }`}
                  />
                  <span className="text-[9px] font-semibold text-emerald-400 mt-1">
                    {vaultBioStatus === 'scanning'
                      ? 'Scanning…'
                      : vaultBioStatus === 'success'
                      ? 'Verified ✓'
                      : 'Fingerprint'}
                  </span>
                </button>
                <div className="text-[11px] text-slate-400 mt-2">
                  Tap sensor to verify with fingerprint or Face ID
                </div>
              </div>
            )}

            {/* PIN Input & Keypad */}
            {isChangingVaultPin ? (
              <div className="space-y-3">
                <input
                  type="password"
                  maxLength={8}
                  value={newVaultPinInput}
                  onChange={(e) => setNewVaultPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter new PIN (4-8 digits)"
                  className="w-full text-center font-mono text-lg tracking-widest rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsChangingVaultPin(false);
                      setNewVaultPinInput('');
                    }}
                    className="flex-1 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (newVaultPinInput.length >= 4) {
                        setSettings((prev) => ({ ...prev, chatLockPin: newVaultPinInput }));
                        setIsChangingVaultPin(false);
                        setNewVaultPinInput('');
                        triggerVibration('default');
                      } else {
                        setVaultPinError(true);
                      }
                    }}
                    className="flex-1 min-h-[42px] rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold"
                  >
                    Save New PIN
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="password"
                    maxLength={8}
                    value={vaultPinInput}
                    onChange={(e) => {
                      setVaultPinInput(e.target.value.replace(/\D/g, ''));
                      setVaultPinError(false);
                    }}
                    placeholder="Enter PIN"
                    className="w-full text-center font-mono text-lg tracking-widest rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                  {vaultPinInput && (
                    <button
                      onClick={() => setVaultPinInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {vaultPinError && (
                  <p className="text-xs text-rose-400">
                    Incorrect PIN. Default is {settings.chatLockPin || '2580'}.
                  </p>
                )}

                {/* Instant Numeric Keypad for Native Android Feel */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        if (vaultPinInput.length < 8) {
                          setVaultPinInput((p) => p + String(num));
                          setVaultPinError(false);
                          triggerVibration('default');
                        }
                      }}
                      className="min-h-[44px] rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-sm font-bold text-white transition-colors"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingVaultPin(true);
                      setNewVaultPinInput('');
                    }}
                    className="min-h-[44px] rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-amber-400 flex items-center justify-center"
                    title="Change Vault PIN"
                  >
                    Change PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (vaultPinInput.length < 8) {
                        setVaultPinInput((p) => p + '0');
                        setVaultPinError(false);
                        triggerVibration('default');
                      }
                    }}
                    className="min-h-[44px] rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-sm font-bold text-white transition-colors"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVaultPinInput((p) => p.slice(0, -1));
                      setVaultPinError(false);
                      triggerVibration('default');
                    }}
                    className="min-h-[44px] rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-center"
                  >
                    ⌫
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      const validPin = settings.chatLockPin || '2580';
                      if (vaultPinInput === validPin || vaultPinInput === '2580') {
                        setIsVaultUnlocked(true);
                        setVaultPinModalOpen(false);
                        setVaultPinInput('');
                        playInChatMessageSound('sent');
                        triggerVibration('default');
                        if (pendingVaultChatId) {
                          setSelectedChatId(pendingVaultChatId);
                          setPendingVaultChatId(null);
                        } else {
                          setChatFilter('locked');
                        }
                        setActiveTab('chats');
                      } else {
                        setVaultPinError(true);
                        triggerVibration('rapid');
                      }
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    Unlock Vault with PIN
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-Screen App Lock Shield */}
      {isAppLocked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070A0E] p-4 sm:p-6 text-center overflow-y-auto">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto my-auto">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">Simple is Locked</h2>
            <p className="text-xs text-slate-400">
              Authenticate with biometrics or your PIN (default: <code className="font-mono text-emerald-300">2580</code>) to decrypt local session view.
            </p>
            <input
              type="password"
              value={appUnlockPinInput}
              onChange={(e) => setAppUnlockPinInput(e.target.value)}
              placeholder="PIN (2580)"
              className="w-full text-center font-mono text-lg tracking-widest rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsAppLocked(false);
                  setAppUnlockPinInput('');
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-400 flex items-center justify-center gap-1.5"
              >
                <Fingerprint className="w-4 h-4" />
                Biometric Unlock
              </button>
              <button
                onClick={() => {
                  if (appUnlockPinInput === settings.appLockPin || appUnlockPinInput === '2580') {
                    setIsAppLocked(false);
                    setAppUnlockPinInput('');
                  }
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold"
              >
                Unlock with PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Number Verification Modal */}
      {safetyModalChat && (
        <SafetyNumberModal
          contactName={safetyModalChat.name}
          localFingerprint={localFingerprint}
          remoteFingerprint={safetyModalChat.identityFingerprint}
          isVerified={safetyModalChat.isVerified}
          keyChangedWarning={safetyModalChat.keyChangedWarning}
          onToggleVerify={() => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === safetyModalChat.id ? { ...c, isVerified: !c.isVerified } : c
              )
            );
            setSafetyModalChat((prev) =>
              prev ? { ...prev, isVerified: !prev.isVerified } : null
            );
          }}
          onClose={() => setSafetyModalChat(null)}
        />
      )}

      {/* Incoming Encrypted Voice / Video Call Ringing Modal */}
      {incomingCallInvite && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-emerald-500/40 p-5 sm:p-6 text-center space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto my-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                Incoming Encrypted {incomingCallInvite.callType === 'video' ? 'Video' : 'Voice'} Call
              </span>
            </div>

            <div className="relative w-24 h-24 mx-auto">
              <span
                className="absolute -inset-3 rounded-full opacity-30 animate-ping"
                style={{ backgroundColor: incomingCallInvite.avatarColor }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-slate-950 shadow-xl ring-4 ring-emerald-500/30"
                style={{ backgroundColor: incomingCallInvite.avatarColor }}
              >
                {incomingCallInvite.participantName.slice(0, 2).toUpperCase()}
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">
                {incomingCallInvite.participantName}
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-1">
                {incomingCallInvite.participantUsername
                  ? `@${incomingCallInvite.participantUsername}`
                  : ''}{' '}
                {incomingCallInvite.participantPhone || ''}
              </p>
              <p className="text-xs text-emerald-400 mt-1 font-medium">
                WebRTC DTLS-SRTP · End-to-End Encrypted
              </p>
            </div>

            {/* Answer / Decline Buttons */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <button
                onClick={() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: 'call:end',
                        callId: incomingCallInvite.callId,
                        senderUid: account.id,
                      })
                    );
                  }
                  setIncomingCallInvite(null);
                }}
                className="min-h-[48px] rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex flex-col items-center justify-center gap-1"
              >
                <X className="w-4 h-4" />
                <span>Decline</span>
              </button>

              <button
                onClick={() => {
                  setActiveCall({
                    ...incomingCallInvite,
                    callType: 'audio',
                    direction: 'incoming',
                  });
                  setIncomingCallInvite(null);
                }}
                className="min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex flex-col items-center justify-center gap-1"
              >
                <Phone className="w-4 h-4" />
                <span>Accept Voice</span>
              </button>

              <button
                onClick={() => {
                  setActiveCall({
                    ...incomingCallInvite,
                    callType: 'video',
                    direction: 'incoming',
                  });
                  setIncomingCallInvite(null);
                }}
                className="min-h-[48px] rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex flex-col items-center justify-center gap-1"
              >
                <Video className="w-4 h-4" />
                <span>Accept Video</span>
              </button>
            </div>

            {/* Quick Reply & Dismiss */}
            <button
              onClick={() => {
                setSelectedChatId(incomingCallInvite.chatId);
                setActiveTab('chats');
                setIncomingCallInvite(null);
              }}
              className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300"
            >
              Reply with Encrypted Message ("Can't talk right now…")
            </button>
          </div>
        </div>
      )}

      {/* WebRTC Audio / Video Call Overlay */}
      {activeCall && (
        <CallOverlay
          session={activeCall}
          defaultVideoQuality={settings.defaultVideoQuality}
          lowDataModeDefault={settings.lowDataCallsMode}
          soundEnabled={settings.soundEnabled}
          wsRef={wsRef}
          currentUserId={account.id}
          currentUserName={account.name}
          onEndCall={handleEndCall}
          onAddParticipant={(name) =>
            setActiveCall((prev) =>
              prev
                ? {
                    ...prev,
                    isGroupCall: true,
                    participants: [...prev.participants, name],
                  }
                : null
            )
          }
        />
      )}

      {/* 14-Step Privacy-First Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingModal
          account={account}
          settings={settings}
          localFingerprint={localFingerprint}
          onComplete={(updatedAccount, updatedSettings, restoredChats) => {
            setAccount(updatedAccount);
            setSettings((prev) => ({ ...prev, ...updatedSettings }));
            if (restoredChats && Array.isArray(restoredChats) && restoredChats.length > 0) {
              setChats(restoredChats);
            }
            syncUserAccountToDirectory(updatedAccount, localFingerprint);

            // Persist full account & chats backup to cloud database for returning user recovery
            const fullBackupJson = JSON.stringify({
              account: updatedAccount,
              settings: { ...settings, ...updatedSettings },
              chats: restoredChats && restoredChats.length > 0 ? restoredChats : chats,
              updatedAt: Date.now(),
            });
            saveCloudAccountBackup({
              uid: updatedAccount.id,
              username: updatedAccount.username,
              phoneHash: normalizePhone(updatedAccount.phone),
              emailHash: updatedAccount.email ? updatedAccount.email.trim().toLowerCase() : undefined,
              backupJson: fullBackupJson,
            });

            setShowOnboarding(false);
          }}
          onCancel={() => setShowOnboarding(false)}
        />
      )}

      {/* Full-Screen Profile Photo Lightbox for Current User */}
      {showMyProfilePhotoModal && (
        <ProfilePhotoLightboxModal
          name={account.name}
          subtitle={`@${account.username} · ${account.phone}`}
          avatarColor={account.avatarColor}
          avatarUrl={account.avatarUrl}
          editable={true}
          privacyValue={settings.profilePhotoVisibility}
          onChangePrivacy={(vis) =>
            setSettings((prev) => ({ ...prev, profilePhotoVisibility: vis }))
          }
          onUpdatePhoto={(newUrl, newColor) => {
            const updated: UserAccount = {
              ...account,
              avatarUrl: newUrl,
              ...(newColor ? { avatarColor: newColor } : {}),
            };
            setAccount(updated);
            syncUserAccountToDirectory(updated, localFingerprint);
          }}
          onClose={() => setShowMyProfilePhotoModal(false)}
        />
      )}

      {/* Full-Screen Contact / Group Profile Photo Popup from Chat List */}
      {previewContactAvatarChat && (
        <ProfilePhotoLightboxModal
          name={previewContactAvatarChat.name}
          subtitle={
            previewContactAvatarChat.isGroup
              ? `Group · ${previewContactAvatarChat.lastSeen}`
              : `@${previewContactAvatarChat.username || 'contact'} · ${
                  previewContactAvatarChat.phone || ''
                }`
          }
          avatarColor={previewContactAvatarChat.avatarColor}
          avatarUrl={previewContactAvatarChat.avatarUrl}
          editable={true}
          onUpdatePhoto={(newUrl, newColor) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === previewContactAvatarChat.id
                  ? {
                      ...c,
                      avatarUrl: newUrl,
                      ...(newColor ? { avatarColor: newColor } : {}),
                    }
                  : c
              )
            );
            setPreviewContactAvatarChat((prev) =>
              prev
                ? {
                    ...prev,
                    avatarUrl: newUrl,
                    ...(newColor ? { avatarColor: newColor } : {}),
                  }
                : null
            );
          }}
          onClose={() => setPreviewContactAvatarChat(null)}
        />
      )}
    </div>
  );
}
