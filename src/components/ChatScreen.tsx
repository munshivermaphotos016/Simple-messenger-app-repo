import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Phone,
  Video,
  Search,
  MoreVertical,
  ShieldCheck,
  Clock,
  Lock,
  Unlock,
  Pin,
  Star,
  Reply,
  Forward,
  Copy,
  Edit3,
  Trash2,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Send,
  Pause,
  Play,
  X,
  FileText,
  MapPin,
  UserCheck,
  Info,
  Languages,
  Users,
  BarChart2,
  Download,
  Check,
  CheckCheck,
  AlertCircle,
  Share2,
  Flag,
  Ban,
  Bookmark,
  Upload,
  Plus,
  Maximize2,
  Minimize2,
  CheckSquare,
  Square,
  Bell,
  Volume2,
  Music,
  Palette,
  Image,
  Eye,
  RefreshCw,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { ProfilePhotoLightboxModal, UserAvatar } from './ProfilePhotoModal';
import { MediaEditorModal } from './MediaEditorModal';
import {
  AppSettings,
  AttachmentItem,
  CHAT_WALLPAPER_PRESETS,
  ChatConversation,
  ChatPoll,
  DisappearingDuration,
  MediaQualityOption,
  MessageItem,
  PerChatNotificationMode,
} from '../types/simple';
import {
  NOTIFICATION_TONE_OPTIONS,
  NotificationToneId,
  RINGTONE_OPTIONS,
  RingtoneId,
  VIBRATION_PATTERN_OPTIONS,
  VibrationPatternId,
  playNotificationTone,
  playRingtonePreview,
  resolveCallRingtone,
  resolveChatNotificationSound,
  triggerVibration,
} from '../utils/soundEffects';
import { EmojiPickerPanel } from './EmojiPickerPanel';
import { CARTOON_3D_STICKERS, STYLED_3D_SCENES } from '../utils/cartoonAvatars';

interface ChatScreenProps {
  chat: ChatConversation;
  currentUserId: string;
  currentUserName: string;
  settings: AppSettings;
  isBlocked: boolean;
  onToggleBlockContact: () => void;
  onBackToMobileList: () => void;
  onSendMessage: (
    text: string,
    options?: {
      replyToId?: string;
      attachment?: AttachmentItem;
      voiceNote?: { durationSec: number; waveform: number[] };
      poll?: ChatPoll;
      linkPreview?: MessageItem['linkPreview'];
    }
  ) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onToggleStarMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onTranslateMessage: (messageId: string) => void;
  onVotePoll: (messageId: string, optionId: string) => void;
  onForwardMessage: (message: MessageItem, targetChatId: string) => void;
  allChats: ChatConversation[];
  onStartCall: (callType: 'audio' | 'video') => void;
  onOpenSafetyNumber: () => void;
  onUpdateChatConfig: (patch: Partial<ChatConversation>) => void;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onClearChat: () => void;
  onExportChat: () => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '💯', '🚀'];

// Detect if a message is pure emojis (1 to 4 emojis) so we render it as a Jumbo Animated Emoji
function isPureEmojiMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 24) return false;
  // Remove whitespace and variation selectors / zero-width joiners / skin tones
  const stripped = trimmed.replace(/[\s\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/gu, '');
  if (!stripped) return false;
  // Check if all remaining code points are in emoji / symbol ranges
  const chars = Array.from(stripped);
  if (chars.length < 1 || chars.length > 5) return false;
  return chars.every((ch) => {
    const cp = ch.codePointAt(0) || 0;
    return (
      (cp >= 0x1f000 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      cp === 0x2764 ||
      cp === 0x2b50
    );
  });
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chat,
  currentUserId,
  settings,
  isBlocked,
  onToggleBlockContact,
  onBackToMobileList,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleStarMessage,
  onTogglePinMessage,
  onTranslateMessage,
  onVotePoll,
  onForwardMessage,
  allChats,
  onStartCall,
  onOpenSafetyNumber,
  onUpdateChatConfig,
  onUpdateSettings,
  onClearChat,
  onExportChat,
}) => {
  const [composerText, setComposerText] = useState(chat.draftText || '');
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [editingMsg, setEditingMsg] = useState<MessageItem | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [showSelectionMoreMenu, setShowSelectionMoreMenu] = useState<boolean>(false);
  const [showBatchReactionBar, setShowBatchReactionBar] = useState<boolean>(false);
  const [selectedMsgMenu, setSelectedMsgMenu] = useState<string | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [inspectEnvelopeMsg, setInspectEnvelopeMsg] = useState<MessageItem | null>(null);
  const [deleteConfirmMsgs, setDeleteConfirmMsgs] = useState<MessageItem[]>([]);
  const [forwardingMsgs, setForwardingMsgs] = useState<MessageItem[]>([]);
  const [statusFeedbackToast, setStatusFeedbackToast] = useState<string | null>(null);
  const [showPeerProfileLightbox, setShowPeerProfileLightbox] = useState<boolean>(false);

  const selectedMessages = chat.messages.filter((m) =>
    selectedMessageIds.includes(m.id) && !m.deletedForEveryone
  );
  const selectedMessage = selectedMessages.length === 1 ? selectedMessages[0] : null;
  const hasSelection = isMultiSelectMode || selectedMessageIds.length > 0;

  const toggleSelectMessageId = (msgId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
    );
  };

  const clearSelection = () => {
    setSelectedMessageIds([]);
    setIsMultiSelectMode(false);
    setShowSelectionMoreMenu(false);
    setShowBatchReactionBar(false);
  };

  // Slide-to-Reply Gesture State (Touch & Mouse Pointer)
  const [slidingMsgId, setSlidingMsgId] = useState<string | null>(null);
  const [slideOffsetPx, setSlideOffsetPx] = useState<number>(0);
  const slideGestureRef = useRef<{
    msg: MessageItem | null;
    startX: number;
    startY: number;
    isHorizontal: boolean | null;
    thresholdHapticFired: boolean;
    longPressTimer: number | null;
  }>({
    msg: null,
    startX: 0,
    startY: 0,
    isHorizontal: null,
    thresholdHapticFired: false,
    longPressTimer: null,
  });

  // Edge-Swipe Back Gesture State (Swipe right from left screen edge to go back to Chat List)
  const edgeSwipeRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });
  const [edgeSwipeBackPx, setEdgeSwipeBackPx] = useState<number>(0);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false);

  // Auto-resize textarea height as user types so text is always fully visible
  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = isComposerExpanded ? 240 : 140;
    const nextH = Math.min(Math.max(el.scrollHeight, isComposerExpanded ? 110 : 38), maxH);
    el.style.height = `${nextH}px`;
  }, [composerText, isComposerExpanded]);

  // In-chat search
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchFilter, setChatSearchFilter] = useState<'all' | 'starred' | 'media' | 'links' | 'docs'>('all');

  // Attachment & Media Quality Drawer + Real File Input
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [selectedMediaQuality, setSelectedMediaQuality] = useState<MediaQualityOption>(
    settings.defaultMediaQuality
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Pro Photo & Video Editor Studio Modal State
  const [proMediaEditor, setProMediaEditor] = useState<{
    isOpen: boolean;
    mediaType: 'photo' | 'video';
    url?: string;
    caption?: string;
    trimStart?: number;
    trimEnd?: number;
  }>({
    isOpen: false,
    mediaType: 'photo',
  });

  // Full-Screen Media Lightbox (Photos, Videos, Stickers)
  const [activeLightboxMedia, setActiveLightboxMedia] = useState<{
    url: string;
    type: 'photo' | 'video' | 'sticker';
    name: string;
    senderName: string;
    timestamp: number;
    caption?: string;
    sizeBytes?: number;
    videoMeta?: AttachmentItem['videoMeta'];
  } | null>(null);
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);

  // Camera Snapshot Modal with Real Live WebRTC Hardware Stream
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraCaption, setCameraCaption] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedCameraDataUrl, setCapturedCameraDataUrl] = useState<string | null>(null);
  const [cameraStreamError, setCameraStreamError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!showCameraModal) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      return;
    }

    let active = true;
    setCameraStreamError(null);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          cameraStreamRef.current = stream;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          if (active) {
            setCameraStreamError('Hardware camera unavailable in current frame; use Device Camera button or Studio canvas.');
          }
        });
    } else {
      setCameraStreamError('Camera API unavailable; use Device Camera button below.');
    }

    return () => {
      active = false;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [showCameraModal, cameraFacingMode]);

  const captureCameraFrameToDataUrl = (): string => {
    if (capturedCameraDataUrl) return capturedCameraDataUrl;
    const videoEl = cameraVideoRef.current;
    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (cameraFacingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.92);
      }
    }
    return STYLED_3D_SCENES.aurora_peaks;
  };

  // Emoji & Sticker Picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Voice Note Recording & Real Web Audio Playback State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceProgressPct, setVoiceProgressPct] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);

  // Group Poll Creator & Group Info Drawer
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOption1, setPollOption1] = useState('');
  const [pollOption2, setPollOption2] = useState('');
  const [showChatInfoDrawer, setShowChatInfoDrawer] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [newGroupMemberName, setNewGroupMemberName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setStatusFeedbackToast(msg);
    setTimeout(() => setStatusFeedbackToast(null), 3000);
  };

  useEffect(() => {
    setComposerText(chat.draftText || '');
    setReplyingTo(null);
    setEditingMsg(null);
    setSelectedMessageIds([]);
    setIsMultiSelectMode(false);
    setSelectedMsgMenu(null);
    setSlidingMsgId(null);
    setSlideOffsetPx(0);
  }, [chat.id]);

  // Keyboard shortcuts: Escape clears selected messages or active reply; 'r' replies when 1 message is selected
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hasSelection) {
          clearSelection();
        } else if (selectedMsgMenu) {
          setSelectedMsgMenu(null);
        } else if (replyingTo || editingMsg) {
          setReplyingTo(null);
          setEditingMsg(null);
        }
      } else if (
        (e.key === 'r' || e.key === 'R') &&
        selectedMessage &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        activateReplyForMessage(selectedMessage);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSelection, selectedMessage, selectedMsgMenu, replyingTo, editingMsg]);

  const activateReplyForMessage = (msg: MessageItem) => {
    if (msg.deletedForEveryone) return;
    setReplyingTo(msg);
    clearSelection();
    setSelectedMsgMenu(null);
    setHighlightedMsgId(msg.id);
    setTimeout(() => setHighlightedMsgId(null), 1400);
    setTimeout(() => {
      composerInputRef.current?.focus();
    }, 50);
  };

  const scrollToQuotedMessage = (targetId: string) => {
    const el = document.getElementById(`msg-row-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetId);
      setTimeout(() => setHighlightedMsgId(null), 1800);
    }
  };

  // Start Slide-to-Reply or Long-Press Selection on a Message Row
  const handleMsgDragStart = (msg: MessageItem, clientX: number, clientY: number) => {
    if (msg.deletedForEveryone) return;
    if (slideGestureRef.current.longPressTimer) {
      window.clearTimeout(slideGestureRef.current.longPressTimer);
    }
    const timer = window.setTimeout(() => {
      if (!slideGestureRef.current.isHorizontal) {
        navigator.vibrate?.(18);
        setIsMultiSelectMode(true);
        toggleSelectMessageId(msg.id);
      }
    }, 430);

    slideGestureRef.current = {
      msg,
      startX: clientX,
      startY: clientY,
      isHorizontal: null,
      thresholdHapticFired: false,
      longPressTimer: timer,
    };
    setSlidingMsgId(msg.id);
    setSlideOffsetPx(0);
  };

  const handleMsgDragMove = (clientX: number, clientY: number) => {
    const g = slideGestureRef.current;
    if (!g.msg) return;

    const dx = clientX - g.startX;
    const dy = clientY - g.startY;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (g.longPressTimer) {
        window.clearTimeout(g.longPressTimer);
        g.longPressTimer = null;
      }
    }

    if (g.isHorizontal === null) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        g.isHorizontal = true;
      } else if (Math.abs(dy) > 12) {
        g.isHorizontal = false;
      }
    }

    if (g.isHorizontal) {
      // Allow sliding right on any message (or sliding left on sent messages, converted to positive pull distance)
      const isMe = g.msg.senderId === currentUserId;
      const rawPull = dx > 0 ? dx : isMe && dx < 0 ? Math.abs(dx) * 0.85 : 0;
      // Smooth elastic damping above 48px
      const damped =
        rawPull <= 48 ? rawPull : 48 + Math.min(28, (rawPull - 48) * 0.45);
      setSlideOffsetPx(damped);

      if (damped >= 46 && !g.thresholdHapticFired) {
        g.thresholdHapticFired = true;
        navigator.vibrate?.(12);
      } else if (damped < 42 && g.thresholdHapticFired) {
        g.thresholdHapticFired = false;
      }
    }
  };

  const handleMsgDragEnd = () => {
    const g = slideGestureRef.current;
    if (g.longPressTimer) {
      window.clearTimeout(g.longPressTimer);
      g.longPressTimer = null;
    }
    if (g.msg && g.isHorizontal && slideOffsetPx >= 46) {
      activateReplyForMessage(g.msg);
    }
    slideGestureRef.current.msg = null;
    slideGestureRef.current.isHorizontal = null;
    setSlideOffsetPx(0);
    setTimeout(() => setSlidingMsgId(null), 180);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length, chat.id]);

  // Voice note recording timer
  useEffect(() => {
    if (!isRecordingVoice || isRecordingPaused) return;
    const t = setInterval(() => {
      setRecordingSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [isRecordingVoice, isRecordingPaused]);

  // Voice note playback animation & Web Audio API feedback
  useEffect(() => {
    if (!playingVoiceId) {
      setVoiceProgressPct(0);
      return;
    }
    const targetMsg = chat.messages.find((m) => m.id === playingVoiceId);
    const totalSec = targetMsg?.voiceNote?.durationSec || 5;
    const stepMs = 100 / playbackSpeed;
    let currentPct = 0;

    // Play a soft Web Audio API synthesized voice-note chime if sound is enabled
    if (settings.soundEnabled) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320 * playbackSpeed, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch {
        // Ignore audio context restriction
      }
    }

    const interval = setInterval(() => {
      currentPct += 100 / (totalSec * 10);
      if (currentPct >= 100) {
        setPlayingVoiceId(null);
        setVoiceProgressPct(0);
        clearInterval(interval);
      } else {
        setVoiceProgressPct(currentPct);
      }
    }, stepMs);

    return () => clearInterval(interval);
  }, [playingVoiceId, playbackSpeed, chat.messages, settings.soundEnabled]);

  const handleComposerChange = (val: string) => {
    setComposerText(val);
    onUpdateChatConfig({ draftText: val });
  };

  const handleSendText = () => {
    const trimmed = composerText.trim();
    if (!trimmed) return;

    if (editingMsg) {
      onEditMessage(editingMsg.id, trimmed);
      setEditingMsg(null);
      handleComposerChange('');
      return;
    }

    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    let linkPreview: MessageItem['linkPreview'] | undefined;
    if (urlMatch) {
      try {
        const parsedUrl = new URL(urlMatch[0]);
        linkPreview = {
          url: parsedUrl.href,
          domain: parsedUrl.hostname,
          title: `Encrypted Link Preview · ${parsedUrl.hostname}`,
          description: 'Fetched locally via privacy proxy without leaking client IP to target server.',
        };
      } catch {
        // ignore invalid url
      }
    }

    onSendMessage(trimmed, {
      replyToId: replyingTo?.id,
      linkPreview,
    });
    handleComposerChange('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleSendVoiceNote = () => {
    const dur = Math.max(2, recordingSec);
    const waveform = Array.from({ length: 24 }, (_, idx) => 25 + ((idx * 19 + dur * 13) % 70));
    onSendMessage('Encrypted Voice Message', {
      replyToId: replyingTo?.id,
      voiceNote: { durationSec: dur, waveform },
    });
    setIsRecordingVoice(false);
    setIsRecordingPaused(false);
    setRecordingSec(0);
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const isMediaVisibleInGallery = () => {
    if (chat.mediaVisibilityInGallery === 'always') return true;
    if (chat.mediaVisibilityInGallery === 'never') return false;
    return Boolean(settings.mediaVisibilityInGallery);
  };

  const handleDownloadMediaInChat = (msg: MessageItem) => {
    if (!msg.attachment || downloadingMediaId === msg.attachment.id) return;
    const attId = msg.attachment.id;
    setDownloadingMediaId(attId);

    setTimeout(() => {
      onUpdateChatConfig({
        messages: chat.messages.map((m) =>
          m.id === msg.id && m.attachment
            ? {
                ...m,
                attachment: {
                  ...m.attachment,
                  isDownloaded: true,
                  uploadProgress: 100,
                },
              }
            : m
        ),
      });
      setDownloadingMediaId(null);

      if (settings.soundEnabled !== false) {
        playNotificationTone('crystal_ping', 0.35);
      }

      const showInGallery = isMediaVisibleInGallery();
      if (showInGallery) {
        showToast(`Downloaded ${msg.attachment?.name} & saved to device Gallery 📸`);
      } else {
        showToast(`Downloaded ${msg.attachment?.name} (kept private, hidden from Gallery 🔒)`);
      }
    }, 650);
  };

  const handleSendAttachment = (
    type: AttachmentItem['type'],
    defaultName: string,
    rawSize: number,
    extra?: Partial<AttachmentItem>
  ) => {
    const multiplier =
      selectedMediaQuality === 'compress' ? 0.35 : selectedMediaQuality === 'hd' ? 0.7 : 1;
    const finalBytes = Math.round(rawSize * multiplier);

    if (finalBytes > settings.maxFileSizeMb * 1024 * 1024) {
      showToast(`File exceeds max configured limit (${settings.maxFileSizeMb} MB).`);
      return;
    }

    const defaultPhotoUrls = [
      STYLED_3D_SCENES.neon_city,
      STYLED_3D_SCENES.aurora_peaks,
      STYLED_3D_SCENES.cyber_studio,
    ];
    const pickedPhotoUrl =
      defaultPhotoUrls[Math.floor(Math.random() * defaultPhotoUrls.length)];
    const randomSticker =
      CARTOON_3D_STICKERS[Math.floor(Math.random() * CARTOON_3D_STICKERS.length)];

    const attachment: AttachmentItem = {
      id: `att_${Date.now()}`,
      type,
      name: defaultName,
      sizeBytes: finalBytes,
      quality: selectedMediaQuality,
      uploadProgress: 100,
      isDownloaded: true,
      url:
        extra?.url ||
        (type === 'photo'
          ? pickedPhotoUrl
          : type === 'video'
          ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
          : type === 'sticker'
          ? randomSticker.url
          : undefined),
      thumbnailUrl:
        extra?.thumbnailUrl ||
        (type === 'video'
          ? STYLED_3D_SCENES.cyber_studio
          : undefined),
      durationSec: extra?.durationSec ?? (type === 'video' ? 15 : undefined),
      caption: extra?.caption ?? (type === 'sticker' ? randomSticker.title : undefined),
      stickerEmoji: extra?.stickerEmoji ?? (type === 'sticker' ? randomSticker.emoji : undefined),
      locationCoords:
        type === 'location'
          ? { lat: 47.3769, lng: 8.5417, label: 'Zürich Privacy Lab (47.3769° N, 8.5417° E)' }
          : undefined,
      contactCard:
        type === 'contact'
          ? { name: 'Sora Takahashi', username: 'sora.compose', phone: '+81 3-5555-0192' }
          : undefined,
      ...extra,
    };

    const labelText =
      extra?.caption ||
      (type === 'photo'
        ? `📷 Photo: ${defaultName}`
        : type === 'video'
        ? `🎬 Video: ${defaultName}`
        : type === 'sticker'
        ? `${attachment.stickerEmoji || '✨'} Sticker`
        : `📎 ${defaultName}`);

    onSendMessage(labelText, {
      replyToId: replyingTo?.id,
      attachment,
    });
    setShowAttachSheet(false);
  };

  const handleRealFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const type: AttachmentItem['type'] =
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'].includes(ext)
        ? 'photo'
        : ['mp4', 'mov', 'webm', 'mkv'].includes(ext)
        ? 'video'
        : ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)
        ? 'audio'
        : ext === 'pdf'
        ? 'pdf'
        : ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
        ? 'zip'
        : 'document';

    if (type === 'photo' || type === 'video') {
      if (type === 'video') {
        const objUrl = URL.createObjectURL(file);
        setShowAttachSheet(false);
        setProMediaEditor({
          isOpen: true,
          mediaType: 'video',
          url: objUrl,
          caption: '',
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          setShowAttachSheet(false);
          setProMediaEditor({
            isOpen: true,
            mediaType: 'photo',
            url: dataUrl,
            caption: '',
          });
        };
        reader.readAsDataURL(file);
      }
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      handleSendAttachment(type, file.name, file.size || 245000, {
        url: dataUrl,
        thumbnailUrl: undefined,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveAttachmentToDisk = (att: AttachmentItem, saveToGalleryExplicit?: boolean) => {
    if (att.url && att.url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = att.url;
      a.download = att.name;
      a.click();
    } else if (att.url && att.url.startsWith('http')) {
      fetch(att.url)
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = att.name;
          a.click();
          URL.revokeObjectURL(blobUrl);
        })
        .catch(() => {
          const content = `Simple End-to-End Encrypted Media Export\nFilename: ${att.name}\nSource: ${att.url || 'Encrypted Local Store'}\nSize: ${att.sizeBytes} bytes`;
          const blob = new Blob([content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = att.name;
          a.click();
          URL.revokeObjectURL(url);
        });
    } else {
      const content = `Simple End-to-End Encrypted Media Export\nFilename: ${att.name}\nSize: ${att.sizeBytes} bytes\nQuality: ${att.quality}\nVerified AES-256-GCM Decrypted File`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(url);
    }

    if (saveToGalleryExplicit || isMediaVisibleInGallery()) {
      showToast(`Saved ${att.name} to Device Gallery & Downloads 📸`);
    } else {
      showToast(`Saved ${att.name} to device storage 📥`);
    }
  };

  const handleCreatePoll = () => {
    if (!pollQuestion.trim() || !pollOption1.trim() || !pollOption2.trim()) return;
    const poll: ChatPoll = {
      id: `poll_${Date.now()}`,
      question: pollQuestion.trim(),
      allowMultiple: false,
      options: [
        { id: 'opt_a', text: pollOption1.trim(), voterIds: [currentUserId] },
        { id: 'opt_b', text: pollOption2.trim(), voterIds: [] },
      ],
    };
    onSendMessage(`Poll: ${poll.question}`, { poll });
    setPollQuestion('');
    setPollOption1('');
    setPollOption2('');
    setShowPollModal(false);
  };

  const cyclePlaybackSpeed = () => {
    if (playbackSpeed === 1) setPlaybackSpeed(1.5);
    else if (playbackSpeed === 1.5) setPlaybackSpeed(2);
    else if (playbackSpeed === 2) setPlaybackSpeed(0.5);
    else setPlaybackSpeed(1);
  };

  // Rich formatting parser (**bold**, *italic*, ~~strike~~, `code`, @mentions, #hashtags)
  const renderFormattedText = (raw: string) => {
    const lines = raw.split('\n');
    return lines.map((line, lIdx) => {
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
      const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_]+)/g);
      return (
        <div key={lIdx} className={isBullet ? 'pl-3 flex items-start gap-1.5' : ''}>
          {tokens.map((tok, tIdx) => {
            if (tok.startsWith('**') && tok.endsWith('**')) {
              return <strong key={tIdx} className="font-bold">{tok.slice(2, -2)}</strong>;
            }
            if (tok.startsWith('*') && tok.endsWith('*')) {
              return <em key={tIdx} className="italic">{tok.slice(1, -1)}</em>;
            }
            if (tok.startsWith('~~') && tok.endsWith('~~')) {
              return <span key={tIdx} className="line-through opacity-75">{tok.slice(2, -2)}</span>;
            }
            if (tok.startsWith('`') && tok.endsWith('`')) {
              return (
                <code
                  key={tIdx}
                  className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-[12px] text-emerald-300"
                >
                  {tok.slice(1, -1)}
                </code>
              );
            }
            if (tok.startsWith('@') || tok.startsWith('#')) {
              return (
                <span key={tIdx} className="font-semibold text-emerald-300 underline decoration-emerald-500/40">
                  {tok}
                </span>
              );
            }
            return <React.Fragment key={tIdx}>{tok}</React.Fragment>;
          })}
        </div>
      );
    });
  };

  const pinnedMessages = chat.messages.filter((m) => m.pinned && !m.deletedForEveryone);

  const filteredMessages = chat.messages.filter((m) => {
    if (chatSearchFilter === 'starred' && !m.starred) return false;
    if (chatSearchFilter === 'media' && !m.attachment && !m.voiceNote) return false;
    if (chatSearchFilter === 'links' && !m.linkPreview && !m.text.includes('http')) return false;
    if (
      chatSearchFilter === 'docs' &&
      (!m.attachment || !['pdf', 'document', 'zip'].includes(m.attachment.type))
    )
      return false;
    if (!chatSearchQuery.trim()) return true;
    const q = chatSearchQuery.toLowerCase();
    return (
      m.text.toLowerCase().includes(q) ||
      m.senderName.toLowerCase().includes(q) ||
      (m.attachment?.name.toLowerCase().includes(q) ?? false)
    );
  });

  const canSendInGroup =
    !chat.isGroup ||
    !chat.groupSettings?.onlyAdminsCanSend ||
    chat.groupSettings.members.some((m) => m.id === currentUserId && m.role === 'admin');

  const activeWallpaperPreset =
    (chat.customWallpaperStyle && chat.customWallpaperStyle !== 'default'
      ? CHAT_WALLPAPER_PRESETS.find((w) => w.id === chat.customWallpaperStyle)
      : null) ||
    CHAT_WALLPAPER_PRESETS.find((w) => w.id === settings.wallpaperStyle) ||
    CHAT_WALLPAPER_PRESETS[0];
  const wallpaperBgClass = activeWallpaperPreset.bgClass;

  const effectiveWallpaperImageUrl =
    chat.customWallpaperPhotoUrl ||
    (chat.customWallpaperStyle && chat.customWallpaperStyle !== 'default'
      ? activeWallpaperPreset.imageUrl
      : settings.customWallpaperPhotoUrl || activeWallpaperPreset.imageUrl);

  const effectiveWallpaperBlur =
    chat.customWallpaperPhotoUrl !== undefined
      ? chat.customWallpaperBlur ?? 0
      : settings.wallpaperBlur ?? 0;

  const effectiveWallpaperOpacity =
    chat.customWallpaperPhotoUrl !== undefined
      ? chat.customWallpaperOpacity ?? 80
      : settings.wallpaperOpacity ?? 75;

  // Reciprocal online privacy check: if user hides their own online status from everyone, or hides last seen from nobody
  const isMyOnlineHidden =
    settings.showOnlineStatus === false ||
    settings.onlineStatusVisibility === 'nobody' ||
    (settings.onlineStatusVisibility === 'same_as_last_seen' &&
      settings.lastSeenVisibility === 'nobody');
  const canSeePeerOnline = !isBlocked && !isMyOnlineHidden && chat.isOnline;
  const canSeePeerLastSeen =
    !isBlocked && settings.lastSeenVisibility !== 'nobody';

  return (
    <div
      className="flex flex-col h-full w-full min-h-0 min-w-0 relative overflow-hidden select-none sm:select-text"
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t && t.clientX <= 32) {
          edgeSwipeRef.current = { startX: t.clientX, startY: t.clientY, active: true };
          setEdgeSwipeBackPx(0);
        } else {
          edgeSwipeRef.current.active = false;
        }
      }}
      onTouchMove={(e) => {
        if (!edgeSwipeRef.current.active) return;
        const t = e.touches[0];
        if (!t) return;
        const dx = t.clientX - edgeSwipeRef.current.startX;
        const dy = Math.abs(t.clientY - edgeSwipeRef.current.startY);
        if (dx > 12 && dx > dy * 1.4) {
          setEdgeSwipeBackPx(Math.min(90, dx));
        }
      }}
      onTouchEnd={() => {
        if (edgeSwipeRef.current.active && edgeSwipeBackPx >= 64) {
          navigator.vibrate?.(15);
          onBackToMobileList();
        }
        edgeSwipeRef.current.active = false;
        setEdgeSwipeBackPx(0);
      }}
    >
      {/* Edge-Swipe Back Visual Indicator Pill (Android Back Gesture) */}
      {edgeSwipeBackPx > 12 && (
        <div
          className="fixed left-2 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full bg-emerald-500 text-slate-950 shadow-xl flex items-center justify-center pointer-events-none transition-transform"
          style={{
            transform: `translate(${Math.min(48, edgeSwipeBackPx * 0.55)}px, -50%) scale(${Math.min(
              1.1,
              0.6 + edgeSwipeBackPx / 120
            )})`,
          }}
        >
          <ArrowLeft className="w-5 h-5" />
        </div>
      )}

      {/* Hidden native file input for uploading real files */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleRealFileUpload}
      />

      {/* Top Chat Header OR Contextual Selected-Messages Action Bar (Single & Multi-Select) */}
      {hasSelection ? (
        <header className="relative min-h-[64px] px-2.5 sm:px-5 py-1.5 border-b border-emerald-500/40 bg-emerald-950/95 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 z-30 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              onClick={clearSelection}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-emerald-200 hover:bg-emerald-900/60"
              aria-label="Clear selected messages"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                {selectedMessages.length} selected
              </div>
              <div className="text-[10px] sm:text-[11px] text-emerald-300 whitespace-nowrap">
                Tap messages to add/remove
              </div>
            </div>

            <button
              onClick={() => {
                const selectableIds = filteredMessages
                  .filter((m) => !m.deletedForEveryone)
                  .map((m) => m.id);
                if (
                  selectableIds.length > 0 &&
                  selectableIds.every((id) => selectedMessageIds.includes(id))
                ) {
                  setSelectedMessageIds([]);
                } else {
                  setSelectedMessageIds(selectableIds);
                }
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-900/70 hover:bg-emerald-800/80 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center gap-1 whitespace-nowrap"
              title="Select All or Deselect All messages"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">
                {filteredMessages
                  .filter((m) => !m.deletedForEveryone)
                  .every((m) => selectedMessageIds.includes(m.id)) &&
                selectedMessages.length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 py-0.5">
            {selectedMessages.length > 0 && (
              <>
                {selectedMessage && (
                  <button
                    onClick={() => activateReplyForMessage(selectedMessage)}
                    className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0"
                    title="Reply to selected message"
                  >
                    <Reply className="w-4 h-4" />
                    <span className="hidden sm:inline">Reply</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    selectedMessages.forEach((m) => onToggleStarMessage(m.id));
                    showToast(
                      selectedMessages.length === 1
                        ? selectedMessage?.starred
                          ? 'Removed star'
                          : 'Message starred'
                        : `Updated star on ${selectedMessages.length} messages`
                    );
                    clearSelection();
                  }}
                  className="hidden sm:flex min-h-[38px] min-w-[38px] px-2 items-center justify-center gap-1 rounded-xl text-slate-200 hover:bg-emerald-900/60 text-xs font-medium shrink-0"
                  title="Star / Unstar selected messages"
                >
                  <Star
                    className={`w-4 h-4 ${
                      selectedMessages.every((m) => m.starred)
                        ? 'text-amber-400 fill-amber-400'
                        : ''
                    }`}
                  />
                </button>

                <button
                  onClick={() => {
                    const textToCopy =
                      selectedMessages.length === 1
                        ? selectedMessages[0].text
                        : selectedMessages
                            .map(
                              (m) =>
                                `[${new Date(m.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}] ${m.senderName}: ${m.text}`
                            )
                            .join('\n');
                    navigator.clipboard.writeText(textToCopy);
                    showToast(
                      selectedMessages.length === 1
                        ? 'Message copied'
                          : `Copied ${selectedMessages.length} messages`
                    );
                    clearSelection();
                  }}
                  className="hidden sm:flex min-h-[38px] min-w-[38px] px-2 items-center justify-center gap-1 rounded-xl text-slate-200 hover:bg-emerald-900/60 text-xs font-medium shrink-0"
                  title="Copy selected message(s)"
                >
                  <Copy className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setForwardingMsgs(selectedMessages);
                    clearSelection();
                  }}
                  className="hidden sm:flex min-h-[38px] min-w-[38px] px-2 items-center justify-center gap-1 rounded-xl text-slate-200 hover:bg-emerald-900/60 text-xs font-medium shrink-0"
                  title="Forward selected message(s)"
                >
                  <Forward className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setDeleteConfirmMsgs(selectedMessages);
                    clearSelection();
                  }}
                  className="min-h-[38px] min-w-[38px] px-2 flex items-center justify-center gap-1 rounded-xl text-rose-300 hover:bg-rose-500/20 text-xs font-medium shrink-0"
                  title="Delete selected message(s)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}

            {/* 3-Dots Top Action Menu Button for Single or Multiple Selected Messages */}
            <div className="relative">
              <button
                onClick={() => setShowSelectionMoreMenu((v) => !v)}
                className={`min-h-[38px] min-w-[38px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 shrink-0 transition-colors ${
                  showSelectionMoreMenu
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-900/90 border-emerald-500/40 text-emerald-200 hover:bg-slate-800'
                }`}
                title="All actions for selected messages"
                aria-label="More actions for selected messages"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showSelectionMoreMenu && (
                <div
                  onClick={() => setShowSelectionMoreMenu(false)}
                  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-3.5 text-xs space-y-1 my-auto"
                  >
                    <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1.5 sm:hidden" />
                    <div className="px-2 py-1.5 text-xs font-bold text-emerald-400 border-b border-slate-800/80 flex items-center justify-between">
                      <span>Message Actions ({selectedMessages.length} selected)</span>
                      <button
                        onClick={() => setShowSelectionMoreMenu(false)}
                        className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        const selectableIds = filteredMessages
                          .filter((m) => !m.deletedForEveryone)
                          .map((m) => m.id);
                        if (
                          selectableIds.length > 0 &&
                          selectableIds.every((id) => selectedMessageIds.includes(id))
                        ) {
                          setSelectedMessageIds([]);
                        } else {
                          setSelectedMessageIds(selectableIds);
                        }
                        setShowSelectionMoreMenu(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                    >
                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        {filteredMessages
                          .filter((m) => !m.deletedForEveryone)
                          .every((m) => selectedMessageIds.includes(m.id)) &&
                        selectedMessages.length > 0
                          ? 'Deselect All Messages'
                          : `Select All (${
                              filteredMessages.filter((m) => !m.deletedForEveryone).length
                            })`}
                      </span>
                    </button>

                    {selectedMessages.length > 0 && (
                      <>
                        <button
                          onClick={() => {
                            if (selectedMessage) {
                              activateReplyForMessage(selectedMessage);
                            } else {
                              activateReplyForMessage(selectedMessages[0]);
                              const quotedSummary = selectedMessages
                                .slice(1)
                                .map((m) => `> ${m.senderName}: ${m.text.slice(0, 60)}`)
                                .join('\n');
                              setComposerText((prev) =>
                                prev ? `${prev}\n${quotedSummary}\n` : `${quotedSummary}\n`
                              );
                              clearSelection();
                            }
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Reply className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {selectedMessages.length === 1
                              ? 'Reply to Message'
                              : `Reply & Quote Selected (${selectedMessages.length})`}
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setShowBatchReactionBar((b) => !b);
                            setShowSelectionMoreMenu(false);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Smile className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>React with Emoji ({selectedMessages.length})</span>
                        </button>

                        <button
                          onClick={() => {
                            setForwardingMsgs(selectedMessages);
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Forward className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>Forward Selected ({selectedMessages.length})</span>
                        </button>

                        <button
                          onClick={() => {
                            const textToCopy =
                              selectedMessages.length === 1
                                ? selectedMessages[0].text
                                : selectedMessages
                                    .map(
                                      (m) =>
                                        `[${new Date(m.timestamp).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}] ${m.senderName}: ${m.text}`
                                    )
                                    .join('\n');
                            navigator.clipboard.writeText(textToCopy);
                            showToast(
                              selectedMessages.length === 1
                                ? 'Message copied'
                                : `Copied ${selectedMessages.length} messages`
                            );
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Copy className="w-4 h-4 text-slate-300 shrink-0" />
                          <span>Copy Text ({selectedMessages.length})</span>
                        </button>

                        <button
                          onClick={() => {
                            selectedMessages.forEach((m) => onToggleStarMessage(m.id));
                            showToast(
                              selectedMessages.length === 1
                                ? selectedMessage?.starred
                                  ? 'Removed star'
                                  : 'Message starred'
                                : `Updated star on ${selectedMessages.length} messages`
                            );
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Star className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            {selectedMessages.every((m) => m.starred)
                              ? `Unstar Selected (${selectedMessages.length})`
                              : `Star Selected (${selectedMessages.length})`}
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            selectedMessages.forEach((m) => onTogglePinMessage(m.id));
                            showToast(
                              selectedMessages.length === 1
                                ? selectedMessage?.pinned
                                  ? 'Message unpinned'
                                  : 'Message pinned'
                                : `Updated pin on ${selectedMessages.length} messages`
                            );
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Pin className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {selectedMessages.every((m) => m.pinned)
                              ? `Unpin Selected (${selectedMessages.length})`
                              : `Pin Selected (${selectedMessages.length})`}
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            selectedMessages.forEach((m) => onTranslateMessage(m.id));
                            showToast(
                              selectedMessages.length === 1
                                ? 'Message translated'
                                : `Translated ${selectedMessages.length} messages`
                            );
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Languages className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span>Translate Selected ({selectedMessages.length})</span>
                        </button>

                        <button
                          onClick={async () => {
                            const sharePayload = selectedMessages
                              .map((m) => `${m.senderName}: ${m.text}`)
                              .join('\n\n');
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: `Chat with ${chat.name}`,
                                  text: sharePayload,
                                });
                              } catch {
                                navigator.clipboard.writeText(sharePayload);
                                showToast('Copied selected messages for sharing');
                              }
                            } else {
                              navigator.clipboard.writeText(sharePayload);
                              showToast('Copied selected messages for sharing');
                            }
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Upload className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>Share / Export Selected ({selectedMessages.length})</span>
                        </button>

                        {selectedMessage && selectedMessage.senderId === currentUserId && (
                          <button
                            onClick={() => {
                              setEditingMsg(selectedMessage);
                              setComposerText(selectedMessage.text);
                              clearSelection();
                              setTimeout(() => composerInputRef.current?.focus(), 50);
                            }}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-amber-300"
                          >
                            <Edit3 className="w-4 h-4 shrink-0" />
                            <span>Edit Message</span>
                          </button>
                        )}

                        {selectedMessage && (
                          <button
                            onClick={() => {
                              setInspectEnvelopeMsg(selectedMessage);
                              clearSelection();
                            }}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                          >
                            <Info className="w-4 h-4 text-sky-400 shrink-0" />
                            <span>Message Delivery & Read Info</span>
                          </button>
                        )}

                        <div className="border-t border-slate-800 my-1" />

                        <button
                          onClick={() => {
                            setDeleteConfirmMsgs(selectedMessages);
                            clearSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-rose-500/15 flex items-center gap-2.5 text-left text-rose-400 font-semibold"
                        >
                          <Trash2 className="w-4 h-4 shrink-0" />
                          <span>Delete Selected ({selectedMessages.length})</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header
          onContextMenu={(e) => {
            e.preventDefault();
            navigator.vibrate?.(15);
            setShowHeaderMenu(true);
          }}
          className="min-h-[64px] px-2.5 sm:px-5 py-1.5 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 z-20"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onBackToMobileList}
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 shrink-0"
              aria-label="Back to chat list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div
              onClick={() => setShowChatInfoDrawer(true)}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left group cursor-pointer"
              title="Tap for Contact & Conversation Controls (or tap avatar for full-screen Profile Photo)"
            >
              <div
                className="relative shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPeerProfileLightbox(true);
                }}
              >
                <UserAvatar
                  name={chat.name}
                  avatarUrl={chat.avatarUrl}
                  avatarColor={chat.avatarColor}
                  sizeClass="w-10 h-10"
                  isGroup={chat.isGroup}
                  title={`Tap to view ${chat.name}'s profile photo`}
                />
                {canSeePeerOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate group-hover:text-emerald-400 transition-colors">
                    {chat.name}
                  </span>
                  {chat.isVerified && (
                    <ShieldCheck
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      aria-label="Verified safety number"
                    />
                  )}
                  {chat.locked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate font-mono">
                  {chat.username && <span className="truncate">@{chat.username}</span>}
                  {chat.phone && !settings.hideRecentAppContent && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="text-cyan-400 hidden sm:inline truncate">{chat.phone}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-sans truncate">
                    {isBlocked
                      ? 'Blocked'
                      : chat.isTyping
                      ? 'Typing…'
                      : canSeePeerOnline
                      ? 'Online'
                      : canSeePeerLastSeen
                      ? chat.lastSeen
                      : 'Online status hidden (Privacy)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Header Actions — never clipped on mobile or desktop */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 pr-0.5 sm:pr-0">
            {chat.locked && (
              <button
                onClick={() => {
                  onUpdateChatConfig({ locked: false });
                  showToast(`Unlocked "${chat.name}" & restored to Main Inbox!`);
                }}
                className="min-h-[36px] px-2 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                title="Remove from Locked Vault and restore to main chat list"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Restore</span>
              </button>
            )}

            <button
              onClick={() => setShowThemeModal(true)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Personal Chat Theme & Photo Wallpaper"
              aria-label="Personal chat theme"
            >
              <Palette className="w-4 h-4 text-emerald-400" />
            </button>

            <button
              onClick={onOpenSafetyNumber}
              className="hidden md:flex min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-xs text-slate-300 items-center gap-1.5 whitespace-nowrap"
              title="Verify Security Code"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline">Security Code</span>
            </button>

            <button
              onClick={() => onStartCall('audio')}
              disabled={isBlocked}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 disabled:opacity-40 transition-colors"
              aria-label="Start encrypted audio call"
              title="Voice Call"
            >
              <Phone className="w-4 h-4" />
            </button>

            <button
              onClick={() => onStartCall('video')}
              disabled={isBlocked}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 disabled:opacity-40 transition-colors"
              aria-label="Start encrypted video call"
              title="Video Call"
            >
              <Video className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowChatSearch((s) => !s)}
              className="hidden xs:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              aria-label="Search in conversation"
              title="Search in conversation"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowHeaderMenu(true)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              aria-label="Conversation 3-dots options"
              title="Conversation options (3 dots)"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* Locked Chat Banner with 1-Tap Restore to Inbox */}
      {chat.locked && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              This chat is protected inside your <strong>Locked Chats Vault</strong>. Notifications are hidden.
            </span>
          </div>
          <button
            onClick={() => {
              onUpdateChatConfig({ locked: false });
              showToast(`Moved "${chat.name}" back to Main Chat List!`);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold whitespace-nowrap"
          >
            Unlock & Move to Inbox
          </button>
        </div>
      )}

      {/* Batch Emoji Reaction Strip for Selected Messages */}
      {hasSelection && showBatchReactionBar && selectedMessages.length > 0 && (
        <div className="px-4 py-2 bg-emerald-950/90 border-b border-emerald-500/30 flex items-center justify-between gap-2 z-20 animate-in fade-in duration-150">
          <span className="text-xs font-semibold text-emerald-200">
            React to {selectedMessages.length} selected message{selectedMessages.length > 1 ? 's' : ''}:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  selectedMessages.forEach((m) => onReactMessage(m.id, emoji));
                  showToast(`Reacted ${emoji} to ${selectedMessages.length} message${selectedMessages.length > 1 ? 's' : ''}`);
                  clearSelection();
                }}
                className="w-8 h-8 rounded-full bg-slate-900/90 hover:bg-slate-800 hover:scale-110 transition-transform flex items-center justify-center text-base"
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setShowBatchReactionBar(false)}
              className="px-2 py-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {statusFeedbackToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/50 text-xs font-medium text-emerald-300 shadow-xl">
          {statusFeedbackToast}
        </div>
      )}

      {/* In-Chat Local Decrypted Search Bar */}
      {showChatSearch && (
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-2 z-10">
          <input
            type="text"
            value={chatSearchQuery}
            onChange={(e) => setChatSearchQuery(e.target.value)}
            placeholder="Search messages, sender, or files in this chat…"
            className="flex-1 min-w-[180px] rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
          <div className="flex items-center gap-1">
            {(['all', 'starred', 'media', 'links', 'docs'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setChatSearchFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize ${
                  chatSearchFilter === f
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowChatSearch(false);
              setChatSearchQuery('');
              setChatSearchFilter('all');
            }}
            className="p-1.5 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Pin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 font-medium shrink-0">Pinned:</span>
            <span className="text-slate-200 truncate">
              {pinnedMessages[pinnedMessages.length - 1].text}
            </span>
          </div>
          <button
            onClick={() => onTogglePinMessage(pinnedMessages[pinnedMessages.length - 1].id)}
            className="text-[11px] text-slate-400 hover:text-white shrink-0"
          >
            Unpin
          </button>
        </div>
      )}

      {/* Scrollable Messages Viewport with Stationary Theme / Custom Wallpaper Background */}
      <div className={`flex-1 min-h-0 relative flex flex-col overflow-hidden ${wallpaperBgClass}`}>
        {effectiveWallpaperImageUrl && (
          <div
            className="absolute inset-0 pointer-events-none bg-cover bg-center z-0 transition-all duration-300"
            style={{
              backgroundImage: `url(${effectiveWallpaperImageUrl})`,
              filter: `blur(${effectiveWallpaperBlur}px)`,
              opacity: effectiveWallpaperOpacity / 100,
            }}
          />
        )}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 relative z-10">
        {/* Top E2EE & Identity Info Banner */}
        <div className="max-w-md mx-auto my-2 rounded-2xl bg-slate-900/80 backdrop-blur-xs border border-slate-800/90 p-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span>End-to-End Encrypted Session</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Connected with <strong>{chat.name}</strong>
            {chat.username ? ` (@${chat.username})` : ''}
            {chat.phone ? ` · ${chat.phone}` : ''}.
            {chat.disappearing !== 'off' &&
              ` Disappearing timer (${
                chat.disappearing === 'custom'
                  ? `${chat.customDisappearingHours || 12}h`
                  : chat.disappearing
              }) is active.`}
          </p>
          <p className="text-[10px] text-emerald-400/90 font-medium pt-0.5">
            Tip: Slide any message right to Reply · Hold or tap to Select
          </p>
        </div>

        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          const repliedMessage = msg.replyToId
            ? chat.messages.find((m) => m.id === msg.replyToId)
            : undefined;
          const isThisSliding = slidingMsgId === msg.id;
          const currentOffset = isThisSliding ? slideOffsetPx : 0;
          const isThresholdReady = currentOffset >= 46;
          const isSelected = selectedMessageIds.includes(msg.id);
          const isHighlighted = highlightedMsgId === msg.id;

          return (
            <div
              key={msg.id}
              id={`msg-row-${msg.id}`}
              onDoubleClick={() => {
                if (!hasSelection) activateReplyForMessage(msg);
              }}
              onContextMenu={(e) => {
                if (msg.deletedForEveryone) return;
                e.preventDefault();
                navigator.vibrate?.(15);
                setIsMultiSelectMode(true);
                toggleSelectMessageId(msg.id);
              }}
              onClick={() => {
                if (hasSelection && !slideGestureRef.current.isHorizontal && !msg.deletedForEveryone) {
                  toggleSelectMessageId(msg.id);
                }
              }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) handleMsgDragStart(msg, t.clientX, t.clientY);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (t) handleMsgDragMove(t.clientX, t.clientY);
              }}
              onTouchEnd={handleMsgDragEnd}
              onTouchCancel={handleMsgDragEnd}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button === 0) {
                  handleMsgDragStart(msg, e.clientX, e.clientY);
                }
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'mouse' && e.buttons === 1) {
                  handleMsgDragMove(e.clientX, e.clientY);
                }
              }}
              onPointerUp={(e) => {
                if (e.pointerType === 'mouse') {
                  handleMsgDragEnd();
                }
              }}
              onPointerCancel={handleMsgDragEnd}
              className={`flex flex-col ${
                isMe ? 'items-end' : 'items-start'
              } group relative rounded-2xl transition-colors duration-300 ${
                hasSelection ? 'pl-8 sm:pl-9 cursor-pointer' : ''
              } ${
                isSelected
                  ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40 -mx-2 px-2 py-1'
                  : isHighlighted
                  ? 'bg-emerald-500/20 ring-1 ring-emerald-400/60 -mx-2 px-2 py-1'
                  : ''
              }`}
              style={{ touchAction: 'pan-y' }}
            >
              {/* Multi-Select Checkbox Indicator on Left Side of Message Row */}
              {hasSelection && !msg.deletedForEveryone && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectMessageId(msg.id);
                  }}
                  className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : 'bg-slate-900/90 border-slate-600 text-transparent hover:border-emerald-400'
                  }`}
                  aria-label="Select message"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              )}
              {/* Slide-to-Reply Circular Icon Indicator Revealed Behind Message */}
              <div
                className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center pointer-events-none transition-all duration-150 ${
                  isThresholdReady
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                    : 'bg-slate-800/90 text-emerald-400 border border-slate-700'
                }`}
                style={{
                  opacity: currentOffset > 6 ? Math.min(1, currentOffset / 36) : 0,
                  transform: `translateY(-50%) scale(${
                    currentOffset > 6 ? Math.min(1.15, 0.55 + currentOffset / 75) : 0.4
                  })`,
                }}
                aria-hidden="true"
              >
                <Reply className="w-4 h-4" />
              </div>

              {/* Floating Emoji Reaction Pill when Single Message is Selected */}
              {isSelected && selectedMessages.length === 1 && !msg.deletedForEveryone && (
                <div className="mb-1.5 z-30 max-w-full overflow-x-auto no-scrollbar rounded-full bg-slate-900 border border-slate-700 px-2.5 py-1 shadow-xl flex items-center gap-1 sm:gap-1.5 animate-in zoom-in-95 duration-150">
                  {QUICK_REACTIONS.slice(0, 7).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReactMessage(msg.id, emoji);
                        clearSelection();
                      }}
                      className="w-7 h-7 rounded-full hover:bg-slate-800 hover:scale-125 transition-transform flex items-center justify-center text-base shrink-0"
                    >
                      {emoji}
                    </button>
                  ))}
                  {/* '+' Button to React with ANY of the 300+ Emojis */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionPickerMsgId(msg.id);
                      clearSelection();
                    }}
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-emerald-500/20 text-emerald-400 border border-slate-700 flex items-center justify-center shrink-0"
                    title="Choose from all 300+ emojis"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      activateReplyForMessage(msg);
                    }}
                    className="ml-0.5 px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-bold flex items-center gap-1 shrink-0"
                  >
                    <Reply className="w-3 h-3" />
                    Reply
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMsgMenu(msg.id);
                      clearSelection();
                    }}
                    className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                  >
                    <MoreVertical className="w-3 h-3 text-emerald-400" />
                    Options
                  </button>
                </div>
              )}

              <div
                style={{
                  transform: `translateX(${currentOffset}px)`,
                  transition:
                    currentOffset === 0
                      ? 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)'
                      : 'none',
                }}
                className={`max-w-[85%] sm:max-w-[72%] rounded-2xl cursor-grab active:cursor-grabbing ${
                  settings.chatDensity === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5'
                } ${
                  isMe
                    ? 'bg-emerald-600/25 border border-emerald-500/35 text-slate-100 rounded-br-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-sm'
                }`}
              >
                {/* Group sender name */}
                {chat.isGroup && !isMe && (
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1">
                    {msg.senderName}
                  </div>
                )}

                {/* Forwarded indicator */}
                {msg.forwarded && (
                  <div className="text-[11px] italic text-slate-400 flex items-center gap-1 mb-1">
                    <Forward className="w-3 h-3" />
                    Forwarded message
                  </div>
                )}

                {/* Reported indicator */}
                {msg.reported && (
                  <div className="text-[11px] text-amber-400 flex items-center gap-1 mb-1">
                    <Flag className="w-3 h-3" />
                    Reported for review
                  </div>
                )}

                {/* Clickable Quoted Reply Preview Block */}
                {repliedMessage && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToQuotedMessage(repliedMessage.id);
                    }}
                    className="w-full text-left mb-2 pl-2.5 pr-2 py-1.5 border-l-4 border-emerald-400 bg-black/30 hover:bg-black/45 rounded-r-xl text-xs transition-colors"
                  >
                    <div className="font-semibold text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                      <span>{repliedMessage.senderName}</span>
                      <span className="text-[10px] text-slate-400 font-normal">Tap to view</span>
                    </div>
                    <div className="text-slate-300 truncate">{repliedMessage.text}</div>
                  </button>
                )}

                {/* Deleted for everyone tombstones */}
                {msg.deletedForEveryone ? (
                  <div className="text-xs italic text-slate-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    This message was deleted for everyone.
                  </div>
                ) : (
                  <>
                    {/* Voice Note Player with Real Progress Animation */}
                    {msg.voiceNote && (
                      <div className="my-1 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-3 min-w-[235px]">
                        <button
                          onClick={() =>
                            setPlayingVoiceId((id) => (id === msg.id ? null : msg.id))
                          }
                          className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0"
                          aria-label="Play or pause encrypted voice message"
                        >
                          {playingVoiceId === msg.id ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 flex items-end gap-[3px] h-7">
                          {msg.voiceNote.waveform.map((bar, idx) => {
                            const barPct = (idx / msg.voiceNote!.waveform.length) * 100;
                            const isPlayed =
                              playingVoiceId === msg.id && barPct <= voiceProgressPct;
                            return (
                              <div
                                key={idx}
                                className={`flex-1 rounded-full transition-colors ${
                                  isPlayed ? 'bg-emerald-400' : 'bg-slate-600'
                                }`}
                                style={{ height: `${Math.max(18, bar)}%` }}
                              />
                            );
                          })}
                        </div>
                        <button
                          onClick={cyclePlaybackSpeed}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-mono text-emerald-300 tabular-nums"
                        >
                          {playbackSpeed}x
                        </button>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          0:{String(msg.voiceNote.durationSec).padStart(2, '0')}
                        </span>
                      </div>
                    )}

                    {/* Inline Media & File Attachment Renderer */}
                    {msg.attachment && (
                      <div className="my-1.5 space-y-1.5">
                        {/* 1. PHOTO / IMAGE IN CHAT */}
                        {msg.attachment.type === 'photo' && (
                          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/90 max-w-[310px] sm:max-w-[350px] group">
                            {msg.attachment.isDownloaded === false ? (
                              <div className="relative aspect-[4/3] w-[270px] sm:w-[310px] overflow-hidden bg-slate-900 flex items-center justify-center">
                                {(msg.attachment.thumbnailUrl || msg.attachment.url) && (
                                  <img
                                    src={msg.attachment.thumbnailUrl || msg.attachment.url}
                                    alt={msg.attachment.name}
                                    className="w-full h-full object-cover scale-110 blur-md brightness-50"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadMediaInChat(msg);
                                  }}
                                  className="relative z-10 px-4 py-2.5 rounded-full bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center gap-2 shadow-xl backdrop-blur-md transition-transform active:scale-95"
                                >
                                  {downloadingMediaId === msg.attachment.id ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                                      <span className="text-xs font-semibold">Downloading…</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4 text-emerald-400" />
                                      <span className="text-xs font-semibold font-mono">
                                        {formatBytes(msg.attachment.sizeBytes)}
                                      </span>
                                    </>
                                  )}
                                </button>
                                <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] text-slate-200 font-mono bg-black/50 px-2 py-0.5 rounded-lg backdrop-blur-xs">
                                  <span className="truncate">{msg.attachment.name}</span>
                                  <span className="uppercase text-emerald-300 ml-1.5 shrink-0">
                                    {msg.attachment.quality}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveLightboxMedia({
                                    url:
                                      msg.attachment!.url ||
                                      msg.attachment!.thumbnailUrl ||
                                      STYLED_3D_SCENES.neon_city,
                                    type: 'photo',
                                    name: msg.attachment!.name,
                                    senderName: msg.senderName,
                                    timestamp: msg.timestamp,
                                    caption: msg.attachment!.caption || msg.text,
                                    sizeBytes: msg.attachment!.sizeBytes,
                                  });
                                }}
                                className="relative cursor-pointer overflow-hidden"
                              >
                                <img
                                  src={
                                    msg.attachment.url ||
                                    msg.attachment.thumbnailUrl ||
                                    STYLED_3D_SCENES.neon_city
                                  }
                                  alt={msg.attachment.name}
                                  className="w-full max-h-[300px] object-cover hover:scale-[1.02] transition-transform duration-200"
                                />
                                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                                  {(msg.attachment.quality === 'hd' ||
                                    msg.attachment.quality === 'original') && (
                                    <span className="px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[10px] font-bold text-white border border-white/15">
                                      HD
                                    </span>
                                  )}
                                  {isMediaVisibleInGallery() && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/80 text-slate-950 text-[9px] font-bold">
                                      In Gallery
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="absolute top-2 right-2 flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setProMediaEditor({
                                        isOpen: true,
                                        mediaType: 'photo',
                                        url:
                                          msg.attachment!.url ||
                                          msg.attachment!.thumbnailUrl ||
                                          STYLED_3D_SCENES.neon_city,
                                        caption: msg.attachment!.caption || '',
                                      })
                                    }
                                    className="px-2 py-1 rounded-full bg-black/70 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-white/15 shadow text-[10px] font-bold flex items-center gap-1"
                                    title="Open photo in Pro Media Studio to edit, annotate, or redact"
                                  >
                                    <Wand2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveAttachmentToDisk(msg.attachment!, true)}
                                    className="p-1.5 rounded-full bg-black/65 hover:bg-black/85 text-white border border-white/15 shadow"
                                    title="Save photo to device gallery"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {msg.attachment.caption && (
                                  <div className="px-3 py-2 bg-slate-950/90 text-xs text-slate-100 border-t border-slate-800/80">
                                    {msg.attachment.caption}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. VIDEO IN CHAT */}
                        {msg.attachment.type === 'video' && (
                          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/90 max-w-[310px] sm:max-w-[350px]">
                            {msg.attachment.isDownloaded === false ? (
                              <div className="relative aspect-video w-[270px] sm:w-[320px] overflow-hidden bg-slate-900 flex items-center justify-center">
                                {msg.attachment.thumbnailUrl && (
                                  <img
                                    src={msg.attachment.thumbnailUrl}
                                    alt={msg.attachment.name}
                                    className="w-full h-full object-cover scale-105 blur-xs brightness-50"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadMediaInChat(msg);
                                  }}
                                  className="relative z-10 px-4 py-2.5 rounded-full bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center gap-2 shadow-xl backdrop-blur-md"
                                >
                                  {downloadingMediaId === msg.attachment.id ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                                      <span className="text-xs font-semibold">Downloading…</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4 text-emerald-400" />
                                      <span className="text-xs font-semibold font-mono">
                                        {formatBytes(msg.attachment.sizeBytes)}
                                      </span>
                                    </>
                                  )}
                                </button>
                                <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/65 text-[10px] font-mono text-white">
                                  <Video className="w-3 h-3 text-emerald-400" />
                                  <span>
                                    0:{String(msg.attachment.durationSec || 24).padStart(2, '0')}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0">
                                <div className="relative aspect-video w-[270px] sm:w-[320px] bg-black overflow-hidden">
                                  <video
                                    src={
                                      msg.attachment.url ||
                                      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                                    }
                                    poster={msg.attachment.thumbnailUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    muted={Boolean(msg.attachment.videoMeta?.muted)}
                                    onLoadedMetadata={(e) => {
                                      const vm = msg.attachment?.videoMeta;
                                      if (!vm) return;
                                      if (vm.playbackRate) e.currentTarget.playbackRate = vm.playbackRate;
                                      if (typeof vm.muted === 'boolean') e.currentTarget.muted = vm.muted;
                                      if (vm.trimStart && vm.trimStart > 0) {
                                        e.currentTarget.currentTime = vm.trimStart;
                                      }
                                    }}
                                    onTimeUpdate={(e) => {
                                      const vm = msg.attachment?.videoMeta;
                                      if (!vm) return;
                                      if (vm.trimEnd && e.currentTarget.currentTime >= vm.trimEnd) {
                                        e.currentTarget.pause();
                                        e.currentTarget.currentTime = vm.trimStart || 0;
                                      } else if (
                                        vm.trimStart &&
                                        e.currentTarget.currentTime < vm.trimStart - 0.25
                                      ) {
                                        e.currentTarget.currentTime = vm.trimStart;
                                      }
                                    }}
                                    style={{
                                      filter:
                                        msg.attachment.videoMeta?.filterCss &&
                                        msg.attachment.videoMeta.filterCss !== 'none'
                                          ? msg.attachment.videoMeta.filterCss
                                          : undefined,
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                  {/* Render Stickers, Emojis & Text Overlays on Sent Video */}
                                  {msg.attachment.videoMeta?.overlays &&
                                    msg.attachment.videoMeta.overlays.length > 0 && (
                                      <div className="pointer-events-none absolute inset-0 overflow-hidden z-[5]">
                                        {msg.attachment.videoMeta.overlays.map((ov) => (
                                          <div
                                            key={ov.id}
                                            style={{
                                              left: `${ov.x}%`,
                                              top: `${ov.y}%`,
                                              transform: `translate(-50%, -50%) scale(${
                                                ov.scale * 0.72
                                              }) rotate(${ov.rotation || 0}deg) ${
                                                ov.flipH ? 'scaleX(-1)' : ''
                                              }`,
                                            }}
                                            className="absolute select-none"
                                          >
                                            {ov.stickerUrl ? (
                                              <img
                                                src={ov.stickerUrl}
                                                alt={ov.text}
                                                className="w-16 h-16 object-contain drop-shadow-xl"
                                              />
                                            ) : ov.kind === 'sticker' ? (
                                              <span className="text-4xl drop-shadow-xl block leading-none">
                                                {ov.text}
                                              </span>
                                            ) : (
                                              <span
                                                style={{
                                                  color: ov.color,
                                                  backgroundColor:
                                                    ov.bgStyle === 'pill'
                                                      ? 'rgba(2,6,23,0.82)'
                                                      : undefined,
                                                }}
                                                className="px-2.5 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap shadow-md block"
                                              >
                                                {ov.text}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  {/* Trimmed Range Badge on Video Bubble */}
                                  {msg.attachment.videoMeta &&
                                    (msg.attachment.videoMeta.trimStart > 0 ||
                                      (msg.attachment.videoMeta.originalDuration &&
                                        msg.attachment.videoMeta.trimEnd <
                                          msg.attachment.videoMeta.originalDuration - 0.1)) && (
                                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 border border-emerald-500/40 text-[10px] font-mono text-emerald-300 flex items-center gap-1 pointer-events-none z-10">
                                        <Scissors className="w-2.5 h-2.5" />
                                        <span>
                                          {msg.attachment.videoMeta.trimStart.toFixed(1)}s–
                                          {msg.attachment.videoMeta.trimEnd.toFixed(1)}s
                                        </span>
                                      </div>
                                    )}
                                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProMediaEditor({
                                          isOpen: true,
                                          mediaType: 'video',
                                          url:
                                            msg.attachment!.url ||
                                            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                                          caption: msg.attachment!.caption || '',
                                          trimStart: msg.attachment!.videoMeta?.trimStart,
                                          trimEnd: msg.attachment!.videoMeta?.trimEnd,
                                        });
                                      }}
                                      className="px-2 py-1 rounded-full bg-black/75 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-white/15 text-[10px] font-bold flex items-center gap-1"
                                      title="Trim or edit video in Pro Media Studio"
                                    >
                                      <Scissors className="w-3 h-3" />
                                      <span>Trim / Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveLightboxMedia({
                                          url:
                                            msg.attachment!.url ||
                                            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                                          type: 'video',
                                          name: msg.attachment!.name,
                                          senderName: msg.senderName,
                                          timestamp: msg.timestamp,
                                          caption: msg.attachment!.caption || msg.text,
                                          sizeBytes: msg.attachment!.sizeBytes,
                                          videoMeta: msg.attachment!.videoMeta,
                                        });
                                      }}
                                      className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/15"
                                      title="Fullscreen Video Player"
                                    >
                                      <Maximize2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSaveAttachmentToDisk(msg.attachment!, true);
                                      }}
                                      className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/15"
                                      title="Save video to device gallery"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="px-3 py-1.5 bg-slate-950/90 flex items-center justify-between text-[11px] text-slate-300 border-t border-slate-800/80">
                                  <span className="truncate font-medium">{msg.attachment.name}</span>
                                  <span className="font-mono text-[10px] text-emerald-400 shrink-0 ml-2">
                                    {formatBytes(msg.attachment.sizeBytes)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 3. STICKER IN CHAT (Floating Sticker Style) */}
                        {msg.attachment.type === 'sticker' && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msg.attachment?.url) {
                                setActiveLightboxMedia({
                                  url: msg.attachment.url,
                                  type: 'sticker',
                                  name: msg.attachment.name,
                                  senderName: msg.senderName,
                                  timestamp: msg.timestamp,
                                  caption: msg.attachment.caption,
                                  sizeBytes: msg.attachment.sizeBytes,
                                });
                              }
                            }}
                            className="inline-flex flex-col items-center p-3 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-slate-900/80 to-cyan-500/15 border border-emerald-500/30 shadow-lg cursor-pointer hover:scale-105 transition-transform"
                          >
                            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
                              {msg.attachment.url ? (
                                <img
                                  src={msg.attachment.url}
                                  alt={msg.attachment.name}
                                  className="w-full h-full object-cover rounded-2xl shadow-md"
                                />
                              ) : null}
                              <span className="absolute -bottom-1 -right-1 text-3xl drop-shadow-md">
                                {msg.attachment.stickerEmoji || '✨'}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 text-emerald-300 border border-emerald-500/30">
                                {msg.attachment.caption || 'Verified Sticker'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveAttachmentToDisk(msg.attachment!, true);
                                }}
                                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                title="Save Sticker"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 4. DOCUMENTS, PDFs, ZIPs, AUDIO & OTHER FILES (File Card) */}
                        {(msg.attachment.type === 'pdf' ||
                          msg.attachment.type === 'document' ||
                          msg.attachment.type === 'zip' ||
                          msg.attachment.type === 'audio' ||
                          msg.attachment.type === 'location' ||
                          msg.attachment.type === 'contact') && (
                          <div className="p-3 rounded-xl bg-slate-950/85 border border-slate-800 flex items-center justify-between gap-3 min-w-[240px] max-w-[340px]">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold text-[10px] border ${
                                  msg.attachment.type === 'pdf'
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : msg.attachment.type === 'zip'
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : msg.attachment.type === 'audio'
                                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                                    : msg.attachment.type === 'location'
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : msg.attachment.type === 'contact'
                                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                                    : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                                }`}
                              >
                                {msg.attachment.type === 'location' ? (
                                  <MapPin className="w-5 h-5" />
                                ) : msg.attachment.type === 'contact' ? (
                                  <UserCheck className="w-5 h-5" />
                                ) : msg.attachment.type === 'audio' ? (
                                  <Music className="w-5 h-5" />
                                ) : (
                                  <>
                                    <FileText className="w-4 h-4" />
                                    <span className="text-[8px] uppercase">
                                      {msg.attachment.type === 'pdf'
                                        ? 'PDF'
                                        : msg.attachment.type === 'zip'
                                        ? 'ZIP'
                                        : 'DOC'}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">
                                  {msg.attachment.name}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {formatBytes(msg.attachment.sizeBytes)} ·{' '}
                                  {msg.attachment.type.toUpperCase()}
                                </div>
                                {msg.attachment.locationCoords && (
                                  <div className="text-[11px] text-emerald-300 mt-0.5 truncate">
                                    📍 {msg.attachment.locationCoords.label}
                                  </div>
                                )}
                                {msg.attachment.contactCard && (
                                  <div className="text-[11px] text-cyan-300 mt-0.5 font-mono truncate">
                                    @{msg.attachment.contactCard.username}{' '}
                                    {msg.attachment.contactCard.phone || ''}
                                  </div>
                                )}
                              </div>
                            </div>

                            {msg.attachment.isDownloaded === false ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadMediaInChat(msg);
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold flex items-center gap-1.5 shrink-0"
                              >
                                {downloadingMediaId === msg.attachment.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                <span>Download</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveAttachmentToDisk(msg.attachment!, true);
                                }}
                                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 flex items-center gap-1 shrink-0 border border-slate-700"
                                title="Save file to device"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Group Poll Card */}
                    {msg.poll && (
                      <div className="my-1.5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 min-w-[240px]">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          <BarChart2 className="w-4 h-4" />
                          <span>{msg.poll.question}</span>
                        </div>
                        <div className="space-y-1.5">
                          {msg.poll.options.map((opt) => {
                            const voted = opt.voterIds.includes(currentUserId);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => onVotePoll(msg.id, opt.id)}
                                className={`w-full p-2 rounded-lg border text-left text-xs flex items-center justify-between transition-colors ${
                                  voted
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-white font-medium'
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <span>{opt.text}</span>
                                <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                                  {opt.voterIds.length} vote{opt.voterIds.length === 1 ? '' : 's'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Formatted Message Text (with Jumbo Animated Emojis!) */}
                    {isPureEmojiMessage(msg.text) ? (
                      <div className="py-1.5 px-1 text-4xl sm:text-5xl leading-tight tracking-wide select-text">
                        <span className="jumbo-emoji-animate">{msg.text}</span>
                      </div>
                    ) : (
                      <div
                        className={`leading-relaxed break-words ${
                          settings.fontSize === 'small'
                            ? 'text-xs'
                            : settings.fontSize === 'large'
                            ? 'text-base'
                            : 'text-[14px]'
                        }`}
                      >
                        {renderFormattedText(msg.text)}
                      </div>
                    )}

                    {/* Local Translation Output */}
                    {msg.translatedText && (
                      <div className="mt-2 pt-2 border-t border-slate-700/60 text-xs text-emerald-300 italic">
                        [On-Device Translation]: {msg.translatedText}
                      </div>
                    )}

                    {/* Automatic Link Preview */}
                    {msg.linkPreview && (
                      <a
                        href={msg.linkPreview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block p-2.5 rounded-xl bg-slate-950/75 border border-slate-800 hover:border-emerald-500/40 transition-colors"
                      >
                        <div className="text-[11px] font-mono text-emerald-400">
                          {msg.linkPreview.domain}
                        </div>
                        <div className="text-xs font-semibold text-white mt-0.5">
                          {msg.linkPreview.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {msg.linkPreview.description}
                        </div>
                      </a>
                    )}
                  </>
                )}

                {/* Bottom Metadata Row */}
                <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                  <button
                    onClick={() => setReplyingTo(msg)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-1 text-slate-400 hover:text-emerald-400"
                    title="Quick Reply (or double-click bubble)"
                  >
                    <Reply className="w-3 h-3 inline" />
                  </button>
                  {msg.pinned && <Pin className="w-3 h-3 text-emerald-400" />}
                  {msg.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  {msg.editedAt && <span>edited</span>}
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isMe && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectEnvelopeMsg(msg);
                      }}
                      className="inline-flex items-center gap-0.5 px-0.5 rounded hover:bg-black/25 transition-colors"
                      title={
                        msg.status === 'queued'
                          ? 'Queued — Waiting for network connection'
                          : msg.status === 'sent'
                          ? 'Sent (1 tick) — Tap for Message Delivery Info'
                          : msg.status === 'delivered' || (!settings.readReceipts && !chat.isGroup)
                          ? !settings.readReceipts && !chat.isGroup && msg.status === 'read'
                            ? 'Delivered (2 ticks) — Read receipts hidden by your privacy setting'
                            : 'Delivered to recipient device (2 ticks) — Tap for Message Info'
                          : 'Read by recipient (2 blue ticks) — Tap for Message Info'
                      }
                      aria-label={`Message status: ${
                        msg.status === 'read' && !settings.readReceipts && !chat.isGroup
                          ? 'delivered'
                          : msg.status
                      }`}
                    >
                      {msg.status === 'queued' ? (
                        <Clock className="w-3.5 h-3.5 text-amber-400 inline" />
                      ) : msg.status === 'sent' ? (
                        <Check className="w-3.5 h-3.5 text-slate-400 inline stroke-[2.5]" />
                      ) : msg.status === 'read' && (settings.readReceipts || chat.isGroup) ? (
                        <CheckCheck className="w-4 h-4 text-sky-400 inline stroke-[2.6] drop-shadow-[0_0_5px_rgba(56,189,248,0.45)]" />
                      ) : (
                        <CheckCheck className="w-4 h-4 text-slate-300 inline stroke-[2.4]" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setSelectedMsgMenu((cur) => (cur === msg.id ? null : msg.id))
                    }
                    className="ml-1 px-1.5 py-0.5 rounded hover:bg-black/30 text-slate-300"
                    aria-label="Message actions"
                  >
                    •••
                  </button>
                </div>
              </div>

              {/* Reactions Row */}
              {msg.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {msg.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      onClick={() => onReactMessage(msg.id, r.emoji)}
                      className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-xs flex items-center gap-1"
                    >
                      <span>{r.emoji}</span>
                      <span className="font-mono text-[10px] text-slate-300 tabular-nums">
                        {r.userIds.length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply or Edit Preview Bar Above Composer */}
      {(replyingTo || editingMsg) && (
        <div className="px-3 sm:px-4 py-2 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-2 text-xs animate-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => {
              const targetId = editingMsg?.id || replyingTo?.id;
              if (targetId) scrollToQuotedMessage(targetId);
            }}
            className="flex-1 min-w-0 text-left pl-3 pr-2 py-1.5 rounded-r-xl border-l-4 border-emerald-400 bg-slate-950/80 hover:bg-slate-950 transition-colors"
          >
            <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <Reply className="w-3.5 h-3.5 shrink-0" />
              <span>
                {editingMsg
                  ? 'Editing Message'
                  : replyingTo?.senderId === currentUserId
                  ? 'Replying to Yourself'
                  : `Replying to ${replyingTo?.senderName}`}
              </span>
            </div>
            <p className="text-slate-300 truncate mt-0.5">
              {editingMsg
                ? editingMsg.text
                : replyingTo?.voiceNote
                ? `🎤 Voice message (0:${String(replyingTo.voiceNote.durationSec).padStart(2, '0')})`
                : replyingTo?.attachment
                ? `📎 ${replyingTo.attachment.name}`
                : replyingTo?.text}
            </p>
          </button>
          <button
            onClick={() => {
              setReplyingTo(null);
              setEditingMsg(null);
            }}
            className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-800/80 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Consolidated Composer Options Popup (Attachments, Camera, Poll, Emojis & Formatting All Together) */}
      {(showAttachSheet || showEmojiPicker) && (
        <div className="px-3 sm:px-4 py-3 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 space-y-3 animate-in slide-in-from-bottom-2 duration-150 max-h-[60vh] overflow-y-auto">
          {/* Header with Tabs: Attachments & Tools vs Emoji & Text Style */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowAttachSheet(true);
                  setShowEmojiPicker(false);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showAttachSheet
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Attach, Camera & Tools</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker(true);
                  setShowAttachSheet(false);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showEmojiPicker
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Emojis & Formatting</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAttachSheet(false);
                setShowEmojiPicker(false);
              }}
              className="min-h-[30px] min-w-[30px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              aria-label="Close options tray"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {showAttachSheet && (
            <div className="space-y-3">
              {/* Circular Icon Grid for All Attachments & Actions */}
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachSheet(false);
                    setShowCameraModal(true);
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachSheet(false);
                    setProMediaEditor({
                      isOpen: true,
                      mediaType: 'photo',
                      url: STYLED_3D_SCENES.aurora_peaks,
                    });
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-emerald-500/40 hover:border-emerald-400 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Image className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-300">Photo Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachSheet(false);
                    setProMediaEditor({
                      isOpen: true,
                      mediaType: 'video',
                      url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
                    });
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-cyan-500/40 hover:border-cyan-400 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-cyan-300">Video Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const pick =
                      CARTOON_3D_STICKERS[Math.floor(Math.random() * CARTOON_3D_STICKERS.length)];
                    handleSendAttachment('sticker', `${pick.id}.svg`, 68000, {
                      stickerEmoji: pick.emoji,
                      caption: pick.title,
                      url: pick.url,
                    });
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">3D Sticker</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendAttachment('pdf', 'ZeroKnowledge_Spec.pdf', 1250000)}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Document</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Device File</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const lat = Number(pos.coords.latitude.toFixed(5));
                          const lng = Number(pos.coords.longitude.toFixed(5));
                          handleSendAttachment('location', 'Live GPS Coordinates', 2048, {
                            locationCoords: {
                              lat,
                              lng,
                              label: `Live GPS Location (${lat}°, ${lng}°)`,
                            },
                          });
                        },
                        () => {
                          handleSendAttachment('location', 'Encrypted Coordinates', 2048);
                        },
                        { timeout: 4000 }
                      );
                    } else {
                      handleSendAttachment('location', 'Encrypted Coordinates', 2048);
                    }
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Location</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendAttachment('contact', 'Contact_Card_Sora.vcf', 4096)}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Contact</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachSheet(false);
                    setShowPollModal(true);
                  }}
                  className="p-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 text-xs flex flex-col items-center gap-1.5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200">Poll</span>
                </button>
              </div>

              {/* Compact Media Quality Selector Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
                <span className="text-slate-400 font-medium">Encryption Media Quality:</span>
                <div className="flex items-center gap-1">
                  {(['compress', 'hd', 'original'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSelectedMediaQuality(q)}
                      className={`px-2.5 py-1 rounded-lg font-medium uppercase ${
                        selectedMediaQuality === q
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showEmojiPicker && (
            <div className="space-y-2.5">
              {/* Expressive Emoji & 3D Cartoon Sticker Studio */}
              <EmojiPickerPanel
                onSelectEmoji={(em) => {
                  handleComposerChange(composerText + em);
                  composerInputRef.current?.focus();
                }}
                onSendComboSticker={(comboText) => {
                  onSendMessage(comboText, {
                    replyToId: replyingTo?.id,
                  });
                  setReplyingTo(null);
                  setShowEmojiPicker(false);
                }}
                onSend3DSticker={(stk) => {
                  handleSendAttachment('sticker', `${stk.title}.svg`, 64000, {
                    url: stk.url,
                    caption: stk.title,
                    stickerEmoji: stk.emoji,
                  });
                  setReplyingTo(null);
                  setShowEmojiPicker(false);
                }}
              />

              {/* Quick Markdown Text Formatting Bar */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono pt-1.5 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400 font-sans mr-1">Text Style:</span>
                <button
                  type="button"
                  onClick={() => {
                    handleComposerChange(composerText + ' **bold** ');
                    composerInputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  **Bold**
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleComposerChange(composerText + ' *italic* ');
                    composerInputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  *Italic*
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleComposerChange(composerText + ' ~~strike~~ ');
                    composerInputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  ~~Strike~~
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleComposerChange(composerText + ' `code` ');
                    composerInputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  `Code`
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Message Composer — Wide, Fully Open Multi-Line Typing Pill */}
      <div className="px-2 sm:px-3.5 py-2 bg-slate-950 border-t border-slate-800/90 shrink-0">
        {isBlocked ? (
          <div className="py-2 flex items-center justify-between px-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
            <span>You blocked {chat.name}. Messaging and calling are disabled.</span>
            <button
              onClick={onToggleBlockContact}
              className="px-3 py-1 rounded-lg bg-rose-500 text-white font-semibold"
            >
              Unblock Contact
            </button>
          </div>
        ) : !canSendInGroup ? (
          <div className="py-2 text-center text-xs text-slate-400">
            Only group admins can send messages in this group.
          </div>
        ) : isRecordingVoice ? (
          <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 py-2 rounded-3xl bg-slate-900 border border-emerald-500/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="text-xs font-mono tabular-nums text-white truncate">
                Recording 0:{String(recordingSec).padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsRecordingPaused((p) => !p)}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-800 text-xs text-slate-200"
              >
                {isRecordingPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={() => {
                  setIsRecordingVoice(false);
                  setRecordingSec(0);
                }}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSendVoiceNote}
                className="min-h-[36px] px-3.5 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 sm:gap-2">
            {/* Unified Rounded Input Pill — Maximum Width for Seeing What You Type */}
            <div className="flex-1 min-w-0 flex items-end gap-1 bg-slate-900 border border-slate-800 focus-within:border-emerald-500/70 rounded-3xl px-2 sm:px-3 py-1 shadow-inner transition-colors">
              {/* Left Emoji Toggle Inside Pill */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker((s) => !s);
                  setShowAttachSheet(false);
                }}
                className={`h-9 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  showEmojiPicker
                    ? 'text-emerald-400 bg-emerald-500/15'
                    : 'text-slate-400 hover:text-white'
                }`}
                aria-label="Emoji and text formatting"
                title="Emojis & Text Formatting"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Wide, Multi-Line Auto-Expanding Typing Area */}
              <textarea
                ref={composerInputRef}
                rows={1}
                value={composerText}
                onChange={(e) => handleComposerChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && settings.enterKeySends && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                placeholder="Message"
                className="flex-1 min-w-0 w-full bg-transparent py-1.5 px-1 text-[15px] sm:text-base leading-snug text-white placeholder:text-slate-400 focus:outline-none resize-none overflow-y-auto"
                style={{
                  minHeight: isComposerExpanded ? '110px' : '38px',
                  maxHeight: isComposerExpanded ? '240px' : '140px',
                }}
              />

              {/* Right Consolidated Action Button(s) Inside Pill */}
              <div className="flex items-center gap-0.5 shrink-0 pb-0.5">
                {/* When typing a message, show a 1-tap Expand/Collapse toggle so user can view huge drafts */}
                {composerText.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsComposerExpanded((v) => !v)}
                    className="h-8 w-8 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 flex items-center justify-center transition-colors"
                    title={isComposerExpanded ? 'Compact typing box' : 'Expand typing area'}
                    aria-label="Toggle full typing area height"
                  >
                    {isComposerExpanded ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                )}

                {/* Consolidated '+' / Paperclip Button — Opens All Attachments, Camera, Poll, Location & Files Together */}
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachSheet((s) => !s);
                    setShowEmojiPicker(false);
                  }}
                  className={`h-8 w-8 rounded-full flex items-center justify-center transition-transform ${
                    showAttachSheet
                      ? 'bg-emerald-500 text-slate-950 rotate-45'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  aria-label="All attachments and options"
                  title="Attach Photo, Camera, File, Location, Contact or Poll"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Camera & Pro Media Studio buttons only show when input is empty, hiding automatically as soon as you type to give 100% space to your text */}
                {!composerText.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setProMediaEditor({
                          isOpen: true,
                          mediaType: 'photo',
                          url: STYLED_3D_SCENES.aurora_peaks,
                        })
                      }
                      className="h-8 w-8 rounded-full text-emerald-400 hover:text-emerald-300 hover:bg-slate-800/80 flex items-center justify-center transition-colors"
                      aria-label="Open Pro Photo & Video Studio"
                      title="Pro Photo & Video Editor Studio"
                    >
                      <Wand2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCameraModal(true)}
                      className="h-8 w-8 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/80 flex items-center justify-center transition-colors"
                      aria-label="Capture encrypted camera photo"
                      title="Camera"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Right Circular Send / Voice Note Button */}
            {composerText.trim() ? (
              <button
                type="button"
                onClick={handleSendText}
                className="h-11 w-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20 transition-transform active:scale-95"
                aria-label="Send encrypted message"
                title="Send message"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRecordingSec(0);
                  setIsRecordingVoice(true);
                }}
                className="h-11 w-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20 transition-transform active:scale-95"
                aria-label="Record encrypted voice note"
                title="Record voice message"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Camera Snapshot Modal with Live WebRTC Viewfinder & Native Android Camera Capture */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4 max-h-[92dvh] overflow-y-auto my-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                <Camera className="w-4 h-4 text-emerald-400" />
                Encrypted Camera Capture
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCapturedCameraDataUrl(null);
                    setCameraFacingMode((f) => (f === 'user' ? 'environment' : 'user'));
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{cameraFacingMode === 'user' ? 'Front' : 'Rear'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCapturedCameraDataUrl(null);
                    setShowCameraModal(false);
                  }}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative aspect-[4/3] rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col items-center justify-center">
              {capturedCameraDataUrl ? (
                <img
                  src={capturedCameraDataUrl}
                  alt="Captured frame"
                  className="w-full h-full object-cover"
                />
              ) : !cameraStreamError ? (
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    cameraFacingMode === 'user' ? '-scale-x-100' : ''
                  }`}
                />
              ) : (
                <div className="p-4 text-center space-y-2">
                  <Camera className="w-10 h-10 text-emerald-400 mx-auto" />
                  <p className="text-xs text-slate-300">{cameraStreamError}</p>
                </div>
              )}

              {/* Bottom Shutter & Device Camera Trigger */}
              <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
                {!capturedCameraDataUrl && !cameraStreamError && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = captureCameraFrameToDataUrl();
                      setCapturedCameraDataUrl(url);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-extrabold shadow-lg"
                  >
                    📸 Freeze Frame
                  </button>
                )}
                {capturedCameraDataUrl && (
                  <button
                    type="button"
                    onClick={() => setCapturedCameraDataUrl(null)}
                    className="px-3 py-1.5 rounded-full bg-black/75 text-white text-xs font-semibold border border-white/20"
                  >
                    Retake
                  </button>
                )}
                <label className="ml-auto px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-emerald-300 text-xs font-semibold border border-emerald-500/40 cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Android Camera / Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCapturedCameraDataUrl(String(reader.result || ''));
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <input
              type="text"
              value={cameraCaption}
              onChange={(e) => setCameraCaption(e.target.value)}
              placeholder="Add a photo caption…"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const frameUrl = captureCameraFrameToDataUrl();
                  setCapturedCameraDataUrl(null);
                  setShowCameraModal(false);
                  setProMediaEditor({
                    isOpen: true,
                    mediaType: 'photo',
                    url: frameUrl,
                    caption: cameraCaption.trim(),
                  });
                }}
                className="min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Edit in Studio</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const frameUrl = captureCameraFrameToDataUrl();
                  handleSendAttachment(
                    'photo',
                    cameraCaption.trim()
                      ? `${cameraCaption.trim()}.jpg`
                      : `Simple_Camera_${Date.now()}.jpg`,
                    1850000,
                    {
                      url: frameUrl,
                      thumbnailUrl: frameUrl,
                      caption: cameraCaption.trim() || undefined,
                    }
                  );
                  setCameraCaption('');
                  setCapturedCameraDataUrl(null);
                  setShowCameraModal(false);
                }}
                className="min-h-[42px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
              >
                Capture & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Single or Multiple Messages) */}
      {deleteConfirmMsgs.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4 max-h-[90dvh] overflow-y-auto my-auto">
            <h3 className="text-base font-bold">
              {deleteConfirmMsgs.length === 1
                ? 'Delete Message?'
                : `Delete ${deleteConfirmMsgs.length} Selected Messages?`}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Choose whether to delete {deleteConfirmMsgs.length === 1 ? 'this message' : 'these messages'} only from your device (<strong>Delete for Me</strong>) or remove {deleteConfirmMsgs.length === 1 ? 'it' : 'them'} for everyone in this chat (<strong>Delete for Everyone</strong>).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmMsgs([])}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteConfirmMsgs.forEach((m) => onDeleteMessage(m.id, false));
                  showToast(
                    deleteConfirmMsgs.length === 1
                      ? 'Message deleted for you'
                      : `Deleted ${deleteConfirmMsgs.length} messages for you`
                  );
                  setDeleteConfirmMsgs([]);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium"
              >
                Delete for Me
              </button>
              <button
                onClick={() => {
                  deleteConfirmMsgs.forEach((m) => onDeleteMessage(m.id, true));
                  showToast(
                    deleteConfirmMsgs.length === 1
                      ? 'Message deleted for everyone'
                      : `Deleted ${deleteConfirmMsgs.length} messages for everyone`
                  );
                  setDeleteConfirmMsgs([]);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                Delete for Everyone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Delivery & Read Receipt Info Modal */}
      {inspectEnvelopeMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4 max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Message Info
              </h3>
              <button onClick={() => setInspectEnvelopeMsg(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Visual Message Delivery & Read Receipt Timeline */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="font-semibold text-slate-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-slate-400 stroke-[2.5]" />
                  <span>Sent (1 Tick)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {new Date(inspectEnvelopeMsg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-slate-300 stroke-[2.4]" />
                  <span>Delivered (2 Ticks)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-300">
                  {inspectEnvelopeMsg.status === 'delivered' || inspectEnvelopeMsg.status === 'read'
                    ? new Date(
                        inspectEnvelopeMsg.deliveredAt || inspectEnvelopeMsg.timestamp + 900
                      ).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'Waiting for recipient device…'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-sky-400 flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-sky-400 stroke-[2.6]" />
                  <span>Read (2 Blue Ticks)</span>
                </span>
                <span className="font-mono text-[11px] text-sky-300">
                  {!settings.readReceipts && !chat.isGroup ? (
                    <span className="text-amber-300">Hidden (Read Receipts Off)</span>
                  ) : inspectEnvelopeMsg.status === 'read' ? (
                    new Date(
                      inspectEnvelopeMsg.readAt || inspectEnvelopeMsg.timestamp + 2200
                    ).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  ) : (
                    <span className="text-slate-500">Not read yet</span>
                  )}
                </span>
              </div>
            </div>

            {/* Real End-to-End Cryptographic Envelope & Cipher Verification */}
            {inspectEnvelopeMsg.e2eeEnvelope && (
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-400">
                    Cryptographic Envelope ({inspectEnvelopeMsg.e2eeEnvelope.cipherSuite})
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Ratchet Step #{inspectEnvelopeMsg.e2eeEnvelope.ratchetStep}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-800 truncate">
                  IV: {inspectEnvelopeMsg.e2eeEnvelope.ivHex}
                </div>
                <div className="font-mono text-[10px] text-cyan-300 bg-slate-900 p-2 rounded-lg border border-slate-800 truncate">
                  SHA-256: {inspectEnvelopeMsg.e2eeEnvelope.sha256Digest}
                </div>
              </div>
            )}

            {/* Quick Privacy Toggle for Read Receipts */}
            {onUpdateSettings && (
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer text-xs">
                <div>
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <CheckCheck className="w-4 h-4 text-sky-400" />
                    <span>Read Receipts Privacy (Blue Ticks)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {settings.readReceipts
                      ? 'Enabled — Showing two blue ticks when messages are read.'
                      : 'Disabled — Blue read ticks are hidden for 1-to-1 privacy.'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.readReceipts}
                  onChange={(e) => onUpdateSettings({ readReceipts: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 shrink-0"
                />
              </label>
            )}

            <div className="space-y-1.5 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">From:</span>
                <span className="font-medium text-white">
                  {inspectEnvelopeMsg.senderName}{' '}
                  {inspectEnvelopeMsg.senderUsername
                    ? `(@${inspectEnvelopeMsg.senderUsername})`
                    : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Security:</span>
                <span className="text-emerald-400 font-medium">End-to-End Encrypted 🔒</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forward Message(s) Modal */}
      {forwardingMsgs.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-3 max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {forwardingMsgs.length === 1
                  ? 'Forward Message To…'
                  : `Forward ${forwardingMsgs.length} Messages To…`}
              </h3>
              <button onClick={() => setForwardingMsgs([])}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {allChats.map((target) => (
                <button
                  key={target.id}
                  onClick={() => {
                    forwardingMsgs.forEach((m) => onForwardMessage(m, target.id));
                    showToast(
                      forwardingMsgs.length === 1
                        ? `Forwarded message to ${target.name}`
                        : `Forwarded ${forwardingMsgs.length} messages to ${target.name}`
                    );
                    setForwardingMsgs([]);
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-left text-xs font-medium flex items-center justify-between"
                >
                  <span>
                    {target.name} {target.phone ? `(${target.phone})` : ''}
                  </span>
                  <Forward className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Poll Modal */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-3 max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Create Poll</h3>
              <button onClick={() => setShowPollModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask a question…"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={pollOption1}
              onChange={(e) => setPollOption1(e.target.value)}
              placeholder="Option 1…"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={pollOption2}
              onChange={(e) => setPollOption2(e.target.value)}
              placeholder="Option 2…"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs"
            />
            <button
              onClick={handleCreatePoll}
              className="w-full min-h-[40px] rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold"
            >
              Send Poll
            </button>
          </div>
        </div>
      )}

      {/* Per-Person / Global Custom Theme & Photo Wallpaper Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Palette className="w-4 h-4 text-emerald-400" />
                  <span>Chat Theme Background & Custom Wallpaper</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose from the 4 Featured Chat Theme Images (Image 1 is default for all chats), or upload your own personal custom photo.
                </p>
              </div>
              <button
                onClick={() => setShowThemeModal(false)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Message Preview Card with Chosen Theme & Photo */}
            <div className={`rounded-2xl border border-slate-800 p-3.5 space-y-2 relative overflow-hidden bg-slate-950 ${wallpaperBgClass}`}>
              {effectiveWallpaperImageUrl && (
                <div
                  className="absolute inset-0 pointer-events-none bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${effectiveWallpaperImageUrl})`,
                    filter: `blur(${effectiveWallpaperBlur}px)`,
                    opacity: effectiveWallpaperOpacity / 100,
                  }}
                />
              )}
              <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-300 pb-1 border-b border-white/10">
                <span>LIVE PREVIEW · {chat.name.toUpperCase()}</span>
                <span className="text-emerald-400 font-semibold">
                  {chat.customWallpaperPhotoUrl
                    ? 'Custom Photo (This Chat)'
                    : settings.customWallpaperPhotoUrl
                    ? 'Custom Photo (All Chats)'
                    : activeWallpaperPreset.label}
                </span>
              </div>
              <div className="relative z-10 space-y-1.5 text-xs">
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-900/90 border border-slate-800 px-3 py-1.5 text-slate-200 shadow">
                    How does this chat background theme look?
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-emerald-500 text-slate-950 font-medium px-3 py-1.5 shadow">
                    Crisp, personal, and easy on the eyes! ✨
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Featured Chat Theme Background Images (4 Images, 1st is Default for All Chats) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" />
                  <span>Featured Chat Theme Background Images</span>
                </label>
                <span className="text-[10px] text-slate-400">Tap to apply to this chat or all chats</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {CHAT_WALLPAPER_PRESETS.filter((p) => p.category === 'Theme Image').map((preset, idx) => {
                  const isActiveHere =
                    !chat.customWallpaperPhotoUrl &&
                    ((chat.customWallpaperStyle && chat.customWallpaperStyle !== 'default'
                      ? chat.customWallpaperStyle === preset.id
                      : !settings.customWallpaperPhotoUrl && settings.wallpaperStyle === preset.id));
                  return (
                    <div
                      key={preset.id}
                      className={`p-2 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                        isActiveHere
                          ? 'border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/50'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateChatConfig({
                            customWallpaperStyle: preset.id,
                            customWallpaperPhotoUrl: undefined,
                          });
                          if (onUpdateSettings) {
                            onUpdateSettings({
                              wallpaperStyle: preset.id,
                              customWallpaperPhotoUrl: undefined,
                            });
                          }
                          showToast(`Set "${preset.label}" as chat theme background!`);
                        }}
                        className="relative h-24 w-full rounded-xl overflow-hidden border border-white/10 group text-left"
                      >
                        <img
                          src={preset.imageUrl}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent flex flex-col justify-between p-1.5">
                          <span className="self-start px-1.5 py-0.5 rounded bg-black/65 text-[9px] font-mono text-emerald-300">
                            {idx === 0 ? '★ Default #1' : `Theme #${idx + 1}`}
                          </span>
                          <span className="text-[10px] font-bold text-white leading-tight line-clamp-1">
                            {preset.label.replace(' (Default)', '')}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateChatConfig({
                              customWallpaperStyle: preset.id,
                              customWallpaperPhotoUrl: undefined,
                            });
                            showToast(`Applied Theme #${idx + 1} to ${chat.name}`);
                          }}
                          className="flex-1 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-medium text-slate-300 border border-slate-800"
                        >
                          This Chat
                        </button>
                        {onUpdateSettings && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateSettings({
                                wallpaperStyle: preset.id,
                                customWallpaperPhotoUrl: undefined,
                              });
                              onUpdateChatConfig({
                                customWallpaperStyle: 'default',
                                customWallpaperPhotoUrl: undefined,
                              });
                              showToast(`Set Theme #${idx + 1} as Default for All Chats!`);
                            }}
                            className="flex-1 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30"
                          >
                            All Chats
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Personal Custom Photo Wallpaper Upload & Sliders */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Set Personal Custom Image as Chat Background</span>
                </label>
                {(chat.customWallpaperPhotoUrl || settings.customWallpaperPhotoUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateChatConfig({ customWallpaperPhotoUrl: undefined });
                      if (onUpdateSettings) {
                        onUpdateSettings({ customWallpaperPhotoUrl: undefined });
                      }
                      showToast('Personal custom image removed — reverted to theme wallpaper.');
                    }}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Remove Custom Image
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Custom Image (This Chat)…</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = String(reader.result || '');
                        onUpdateChatConfig({
                          customWallpaperPhotoUrl: dataUrl,
                        });
                        showToast(`Set personal custom background for ${chat.name}`);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>

                {onUpdateSettings && (
                  <label className="cursor-pointer px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Custom Image (All Chats)…</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = String(reader.result || '');
                          onUpdateSettings({
                            customWallpaperPhotoUrl: dataUrl,
                          });
                          onUpdateChatConfig({
                            customWallpaperPhotoUrl: undefined,
                          });
                          showToast('Set personal custom image as background for ALL chats!');
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
              </div>

              <input
                type="url"
                value={chat.customWallpaperPhotoUrl || settings.customWallpaperPhotoUrl || ''}
                onChange={(e) => {
                  const val = e.target.value.trim() || undefined;
                  onUpdateChatConfig({ customWallpaperPhotoUrl: val });
                }}
                placeholder="Or paste custom image URL (https://...)"
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Background Blur</span>
                    <span className="font-mono text-cyan-400">{effectiveWallpaperBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={effectiveWallpaperBlur}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (chat.customWallpaperPhotoUrl !== undefined) {
                        onUpdateChatConfig({ customWallpaperBlur: val });
                      } else if (onUpdateSettings) {
                        onUpdateSettings({ wallpaperBlur: val });
                      }
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Background Brightness / Opacity</span>
                    <span className="font-mono text-cyan-400">{effectiveWallpaperOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={effectiveWallpaperOpacity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (chat.customWallpaperPhotoUrl !== undefined) {
                        onUpdateChatConfig({ customWallpaperOpacity: val });
                      } else if (onUpdateSettings) {
                        onUpdateSettings({ wallpaperOpacity: val });
                      }
                    }}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 3. Abstract Gradients & Minimal Surfaces */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-white">
                Abstract Gradients & Minimal Surfaces
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                {CHAT_WALLPAPER_PRESETS.filter((p) => p.category !== 'Theme Image').map((preset) => {
                  const isSel = chat.customWallpaperStyle === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onUpdateChatConfig({
                          customWallpaperStyle: preset.id,
                          customWallpaperPhotoUrl: undefined,
                        });
                        showToast(`Applied ${preset.label} theme to ${chat.name}`);
                      }}
                      className={`p-2 rounded-xl border text-left text-xs ${
                        isSel
                          ? 'border-emerald-400 bg-emerald-500/15 text-white font-semibold'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div
                        className={`h-8 rounded-lg border border-white/10 mb-1 ${preset.swatchClass}`}
                      />
                      <div className="truncate font-medium">{preset.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onUpdateChatConfig({
                    customWallpaperStyle: 'default',
                    customWallpaperPhotoUrl: undefined,
                    customWallpaperBlur: undefined,
                    customWallpaperOpacity: undefined,
                  });
                  if (onUpdateSettings) {
                    onUpdateSettings({
                      wallpaperStyle: 'theme_img_1',
                      customWallpaperPhotoUrl: undefined,
                      wallpaperBlur: 0,
                      wallpaperOpacity: 75,
                    });
                  }
                  showToast('Reset to Default Theme Image #1 for all chats');
                  setShowThemeModal(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-rose-300"
              >
                Reset to Default Image #1
              </button>
              <button
                type="button"
                onClick={() => setShowThemeModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full 300+ Emoji Reaction Picker Modal for Any Message */}
      {reactionPickerMsgId && (
        <div
          onClick={() => setReactionPickerMsgId(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 shadow-2xl space-y-3 max-h-[88dvh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Smile className="w-4 h-4" />
                <span>React with Any Emoji</span>
              </div>
              <button
                onClick={() => setReactionPickerMsgId(null)}
                className="min-h-[32px] min-w-[32px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <EmojiPickerPanel
              compact
              onSelectEmoji={(emoji) => {
                onReactMessage(reactionPickerMsgId, emoji);
                setReactionPickerMsgId(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Viewport-Safe Message Options Modal / Bottom Sheet (Never Clipped on Any Device) */}
      {selectedMsgMenu && (() => {
        const msg = chat.messages.find((m) => m.id === selectedMsgMenu);
        if (!msg || msg.deletedForEveryone) return null;
        const isMe = msg.senderId === currentUserId;
        return (
          <div
            onClick={() => setSelectedMsgMenu(null)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] overflow-y-auto my-auto"
            >
              {/* Message Snippet Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <span>{msg.senderName}</span>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 line-clamp-2 mt-0.5 break-words">
                    {msg.text}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedMsgMenu(null)}
                  className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
                  aria-label="Close message options"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Emoji Reactions Bar + Full 300+ Emoji Picker Button */}
              <div className="flex items-center justify-between gap-1 bg-slate-950 border border-slate-800 rounded-2xl px-2.5 py-2 overflow-x-auto no-scrollbar">
                {QUICK_REACTIONS.slice(0, 7).map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onReactMessage(msg.id, emoji);
                      setSelectedMsgMenu(null);
                    }}
                    className="w-9 h-9 rounded-xl hover:bg-slate-800 hover:scale-110 transition-transform flex items-center justify-center text-lg shrink-0"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const targetId = msg.id;
                    setSelectedMsgMenu(null);
                    setReactionPickerMsgId(targetId);
                  }}
                  className="px-2.5 h-9 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 shrink-0"
                  title="React with any of 300+ emojis"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>All</span>
                </button>
              </div>

              {/* All Message Actions Grid */}
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  onClick={() => {
                    activateReplyForMessage(msg);
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Reply className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Reply</span>
                </button>

                <button
                  onClick={() => {
                    setForwardingMsgs([msg]);
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Forward className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Forward</span>
                </button>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.text);
                    showToast('Copied message text to clipboard');
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Copy className="w-4 h-4 text-slate-300 shrink-0" />
                  <span>Copy Text</span>
                </button>

                <button
                  onClick={() => {
                    setIsMultiSelectMode(true);
                    setSelectedMessageIds([msg.id]);
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-emerald-300"
                >
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Select Messages</span>
                </button>

                {isMe && (
                  <button
                    onClick={() => {
                      setEditingMsg(msg);
                      setComposerText(msg.text);
                      setSelectedMsgMenu(null);
                      setTimeout(() => composerInputRef.current?.focus(), 50);
                    }}
                    className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-amber-300"
                  >
                    <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Edit Message</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    onToggleStarMessage(msg.id);
                    showToast(msg.starred ? 'Removed star' : 'Message starred');
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Star className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{msg.starred ? 'Unstar Message' : 'Star Message'}</span>
                </button>

                <button
                  onClick={() => {
                    onTogglePinMessage(msg.id);
                    showToast(msg.pinned ? 'Message unpinned' : 'Message pinned');
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Pin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{msg.pinned ? 'Unpin Message' : 'Pin to Top'}</span>
                </button>

                <button
                  onClick={() => {
                    onTranslateMessage(msg.id);
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Languages className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Translate Message</span>
                </button>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `[${msg.senderName}]: ${msg.text}`
                    );
                    showToast('Formatted share snippet copied');
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Share2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Share Message</span>
                </button>

                <button
                  onClick={() => {
                    setInspectEnvelopeMsg(msg);
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-white"
                >
                  <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Message Info</span>
                </button>

                <button
                  onClick={() => {
                    onUpdateChatConfig({
                      messages: chat.messages.map((m) =>
                        m.id === msg.id ? { ...m, reported: true } : m
                      ),
                    });
                    showToast('Message flagged locally. You can also block this contact.');
                    setSelectedMsgMenu(null);
                  }}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800 border border-slate-800/80 flex items-center gap-2.5 text-left font-medium text-amber-300"
                >
                  <Flag className="w-4 h-4 shrink-0" />
                  <span>Report Message</span>
                </button>

                <button
                  onClick={() => {
                    setDeleteConfirmMsgs([msg]);
                    setSelectedMsgMenu(null);
                  }}
                  className="col-span-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 flex items-center justify-center gap-2 font-semibold"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete Message…</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Viewport-Safe Chat Header 3-Dots & Long-Press Quick Options Modal */}
      {showHeaderMenu && (
        <div
          onClick={() => setShowHeaderMenu(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-4 sm:p-5 shadow-2xl space-y-3 max-h-[88vh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                  style={{ backgroundColor: chat.avatarColor }}
                >
                  {chat.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{chat.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {chat.username ? `@${chat.username}` : ''} {chat.phone || ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowHeaderMenu(false)}
                className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowChatInfoDrawer(true);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Contact & Chat Info</span>
              </button>

              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowChatInfoDrawer(true);
                }}
                className="p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-2.5 text-left font-semibold text-emerald-300"
              >
                <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Custom Sounds & Ringtone</span>
              </button>

              <button
                onClick={() => {
                  onUpdateChatConfig({ favorite: !chat.favorite });
                  showToast(
                    chat.favorite
                      ? `Removed ${chat.name} from Favorites`
                      : `Marked ${chat.name} as Favorite (uses Favorite Sound & Ringtone)`
                  );
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-amber-300"
              >
                <Star
                  className={`w-4 h-4 text-amber-400 shrink-0 ${
                    chat.favorite ? 'fill-amber-400' : ''
                  }`}
                />
                <span>{chat.favorite ? 'Unmark Favorite' : 'Mark as Favorite ⭐'}</span>
              </button>

              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowThemeModal(true);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-emerald-300"
              >
                <Palette className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Chat Theme & Photo Wallpaper</span>
              </button>

              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setIsMultiSelectMode(true);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-emerald-300"
              >
                <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Select Messages</span>
              </button>

              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowChatSearch(true);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <Search className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Search in Conversation</span>
              </button>

              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  onOpenSafetyNumber();
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Verify Security Code</span>
              </button>

              <button
                onClick={() => {
                  onUpdateChatConfig({ muted: !chat.muted });
                  showToast(chat.muted ? 'Notifications unmuted' : 'Conversation muted');
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{chat.muted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
              </button>

              <button
                onClick={() => {
                  const nextDur: DisappearingDuration =
                    chat.disappearing === 'off' ? '24h' : 'off';
                  onUpdateChatConfig({ disappearing: nextDur });
                  showToast(
                    nextDur === 'off'
                      ? 'Disappearing messages turned OFF'
                      : 'Disappearing messages set to 24h'
                  );
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Disappearing ({chat.disappearing === 'off' ? 'Off → 24h' : `${chat.disappearing} → Off`})
                </span>
              </button>

              <button
                onClick={() => {
                  onUpdateChatConfig({ locked: !chat.locked });
                  showToast(
                    chat.locked
                      ? 'Unlocked & restored to Main Inbox'
                      : 'Moved to Locked Chats Vault'
                  );
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-amber-300"
              >
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{chat.locked ? 'Unlock from Vault' : 'Lock Chat in Vault'}</span>
              </button>

              <button
                onClick={() => {
                  onExportChat();
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-white"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Export Chat Transcript</span>
              </button>

              <button
                onClick={() => {
                  onClearChat();
                  setShowHeaderMenu(false);
                }}
                className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center gap-2.5 text-left font-medium text-rose-300"
              >
                <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Clear Messages</span>
              </button>

              {!chat.isGroup && (
                <button
                  onClick={() => {
                    onToggleBlockContact();
                    setShowHeaderMenu(false);
                  }}
                  className="sm:col-span-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 flex items-center justify-center gap-2 font-semibold"
                >
                  <Ban className="w-4 h-4 shrink-0" />
                  <span>{isBlocked ? `Unblock ${chat.name}` : `Block ${chat.name}`}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right Slide-Over Chat Privacy, Disappearing Timer & Group Admin Drawer */}
      {showChatInfoDrawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-5 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold">Contact & Conversation Controls</h3>
              <button
                onClick={() => setShowChatInfoDrawer(false)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contact Identity Details with Large Profile Photo */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <UserAvatar
                    name={chat.name}
                    avatarUrl={chat.avatarUrl}
                    avatarColor={chat.avatarColor}
                    sizeClass="w-16 h-16"
                    textClass="text-lg"
                    isGroup={chat.isGroup}
                    showCameraBadge
                    onClick={() => setShowPeerProfileLightbox(true)}
                    title="Tap to view or change photo"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{chat.name}</div>
                    {chat.username && (
                      <div className="font-mono text-emerald-400 truncate">@{chat.username}</div>
                    )}
                    {chat.phone && (
                      <div className="font-mono text-cyan-300 truncate">Mobile: {chat.phone}</div>
                    )}
                    {chat.email && (
                      <div className="font-mono text-slate-400 truncate">Email: {chat.email}</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPeerProfileLightbox(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{chat.isGroup ? 'Group Icon' : 'Photo'}</span>
                </button>
              </div>
              <div className="text-slate-300 pt-2 border-t border-slate-800/80">{chat.about}</div>
            </div>

            {/* Disappearing Messages Config (including Custom hours) */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Disappearing Messages Timer
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['off', '24h', '7d', '30d', 'custom'] as DisappearingDuration[]).map((dur) => (
                  <button
                    key={dur}
                    onClick={() => onUpdateChatConfig({ disappearing: dur })}
                    className={`py-2 rounded-xl text-xs font-medium border ${
                      chat.disappearing === dur
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {dur.toUpperCase()}
                  </button>
                ))}
              </div>
              {chat.disappearing === 'custom' && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-300">Custom Expiry (Hours):</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={chat.customDisappearingHours || 12}
                    onChange={(e) =>
                      onUpdateChatConfig({
                        customDisappearingHours: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="w-24 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-mono text-emerald-300"
                  />
                </div>
              )}
              <p className="text-[11px] text-slate-400">
                Note: Disappearing messages cannot prevent a participant from capturing screenshots or photographing the screen before expiration.
              </p>
            </div>

            {/* Per-Chat Custom Theme & Photo Wallpaper Card */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Palette className="w-4 h-4" />
                  <span>Chat Theme & Wallpaper</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowThemeModal(true)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Customize</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Choose a custom theme preset or upload a personal photo with adjustable blur and opacity just for {chat.name}.
              </p>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-emerald-300">
                  {chat.customWallpaperPhotoUrl ? '🖼️ Custom Photo Active' : (CHAT_WALLPAPER_PRESETS.find((p) => p.id === (chat.customWallpaperStyle || settings.wallpaperStyle))?.label || 'Default')}
                </span>
                {chat.customWallpaperPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateChatConfig({ customWallpaperPhotoUrl: undefined });
                      showToast('Removed custom photo wallpaper');
                    }}
                    className="text-rose-400 hover:underline"
                  >
                    Reset Photo
                  </button>
                )}
              </div>
            </div>

            {/* Per-Chat Custom Sounds, Ringtones & Favorite Tone Controls */}
            {(() => {
              const resolvedMsg = resolveChatNotificationSound(chat, settings);
              const resolvedVoiceRing = resolveCallRingtone(chat, 'audio', chat.isGroup, settings);
              const resolvedVideoRing = resolveCallRingtone(chat, 'video', chat.isGroup, settings);
              const vol = (settings.notificationVolume ?? 85) / 100;
              const ringVol = (settings.ringtoneVolume ?? 90) / 100;

              return (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                      <Volume2 className="w-4 h-4" />
                      <span>Custom Sounds & Ringtones ({chat.isGroup ? 'Group' : 'Person'})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextFav = !chat.favorite;
                        onUpdateChatConfig({ favorite: nextFav });
                        showToast(
                          nextFav
                            ? `${chat.name} marked as Favorite ⭐ (uses Favorite tones)`
                            : `${chat.name} removed from Favorites`
                        );
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                        chat.favorite
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Star className={`w-3 h-3 ${chat.favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      <span>{chat.favorite ? 'Favorite ⭐' : 'Mark Favorite'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Set a unique message tone, voice call ringtone, or video call ringtone just for{' '}
                    <strong className="text-slate-200">{chat.name}</strong>, or leave on Default to use your{' '}
                    {chat.favorite
                      ? 'Favorite Contact'
                      : chat.isGroup
                      ? 'Group Chat'
                      : 'Personal Chat'}{' '}
                    sound.
                  </p>

                  {/* 1. Custom Message Sound for this Person/Group */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Message Notification Sound</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          playNotificationTone(
                            resolvedMsg.toneId,
                            vol,
                            resolvedMsg.customDataUrl
                          )
                        }
                        className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    </div>
                    <select
                      value={chat.customMessageTone || 'default'}
                      onChange={(e) => {
                        const val = e.target.value as NotificationToneId | 'default';
                        onUpdateChatConfig({
                          customMessageTone: val,
                          notificationMode: val === 'silent' ? 'silent' : 'default',
                        });
                        if (val !== 'default' && val !== 'silent') {
                          playNotificationTone(val, vol, chat.customToneDataUrl);
                        }
                      }}
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                    >
                      <option value="default">
                        Use {chat.favorite ? 'Favorite' : chat.isGroup ? 'Group' : 'Personal'} Default (
                        {
                          NOTIFICATION_TONE_OPTIONS.find(
                            (t) =>
                              t.id ===
                              (chat.favorite
                                ? settings.favoriteMessageTone || 'sparkle_pop'
                                : chat.isGroup
                                ? settings.groupNotificationTone || 'bamboo_pop'
                                : settings.messageNotificationTone || 'note_drop')
                          )?.label
                        }
                        )
                      </option>
                      {NOTIFICATION_TONE_OPTIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.emoji} {t.label} — {t.description}
                        </option>
                      ))}
                    </select>

                    {/* Upload Custom Audio File for Message Tone */}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] text-slate-400">
                        Active: <strong className="text-emerald-300">{resolvedMsg.sourceLabel}</strong>
                      </span>
                      <label className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                        <Upload className="w-3 h-3" />
                        <span>{chat.customToneDataUrl ? 'Change Audio File' : 'Upload MP3/WAV'}</span>
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
                              onUpdateChatConfig({
                                customToneDataUrl: dataUrl,
                                customMessageTone: 'custom_uploaded',
                              });
                              playNotificationTone('custom_uploaded', vol, dataUrl);
                              showToast(`Custom message sound uploaded for ${chat.name}`);
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 2. Custom Voice Call Ringtone for this Person/Group */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Voice Call Ringtone</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          playRingtonePreview(
                            resolvedVoiceRing.ringtoneId,
                            ringVol,
                            resolvedVoiceRing.customDataUrl
                          )
                        }
                        className="px-2 py-0.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold flex items-center gap-1"
                      >
                        <Music className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    </div>
                    <select
                      value={chat.customRingtone || 'default'}
                      onChange={(e) => {
                        const val = e.target.value as RingtoneId | 'default';
                        onUpdateChatConfig({ customRingtone: val });
                        if (val !== 'default' && val !== 'silent') {
                          playRingtonePreview(val, ringVol, chat.customRingtoneDataUrl);
                        }
                      }}
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                    >
                      <option value="default">
                        Use {chat.favorite ? 'Favorite' : chat.isGroup ? 'Group Call' : 'Voice Call'} Default (
                        {
                          RINGTONE_OPTIONS.find(
                            (r) =>
                              r.id ===
                              (chat.favorite
                                ? settings.favoriteCallRingtone || 'vip_fanfare'
                                : chat.isGroup
                                ? settings.groupCallRingtone || 'marimba_pulse'
                                : settings.callRingtone || 'classic_chime')
                          )?.label
                        }
                        )
                      </option>
                      {RINGTONE_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.emoji} {r.label} — {r.description}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] text-slate-400">
                        Active: <strong className="text-cyan-300">{resolvedVoiceRing.sourceLabel}</strong>
                      </span>
                      <label className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                        <Upload className="w-3 h-3" />
                        <span>{chat.customRingtoneDataUrl ? 'Change Ringtone File' : 'Upload Ringtone'}</span>
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
                              onUpdateChatConfig({
                                customRingtoneDataUrl: dataUrl,
                                customRingtone: 'custom_uploaded',
                              });
                              playRingtonePreview('custom_uploaded', ringVol, dataUrl);
                              showToast(`Custom call ringtone uploaded for ${chat.name}`);
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* 3. Custom Video Call Ringtone for this Person/Group */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Video Call Ringtone</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          playRingtonePreview(
                            resolvedVideoRing.ringtoneId,
                            ringVol,
                            resolvedVideoRing.customDataUrl
                          )
                        }
                        className="px-2 py-0.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold flex items-center gap-1"
                      >
                        <Music className="w-3 h-3" />
                        <span>Preview</span>
                      </button>
                    </div>
                    <select
                      value={chat.customVideoCallRingtone || 'default'}
                      onChange={(e) => {
                        const val = e.target.value as RingtoneId | 'default';
                        onUpdateChatConfig({ customVideoCallRingtone: val });
                        if (val !== 'default' && val !== 'silent') {
                          playRingtonePreview(val, ringVol, chat.customRingtoneDataUrl);
                        }
                      }}
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                    >
                      <option value="default">
                        Use {chat.favorite ? 'Favorite' : chat.isGroup ? 'Group Call' : 'Video Call'} Default (
                        {
                          RINGTONE_OPTIONS.find(
                            (r) =>
                              r.id ===
                              (chat.favorite
                                ? settings.favoriteCallRingtone || 'vip_fanfare'
                                : chat.isGroup
                                ? settings.groupCallRingtone || 'marimba_pulse'
                                : settings.videoCallRingtone || 'facetime_chime')
                          )?.label
                        }
                        )
                      </option>
                      {RINGTONE_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.emoji} {r.label} — {r.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Custom Vibration Pattern & Privacy Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Vibration Pattern
                      </label>
                      <select
                        value={chat.customVibrationPattern || 'default'}
                        onChange={(e) => {
                          const val = e.target.value as VibrationPatternId | 'default';
                          onUpdateChatConfig({ customVibrationPattern: val });
                          if (val !== 'default' && val !== 'off') {
                            triggerVibration(val);
                          }
                        }}
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                      >
                        <option value="default">Default Pattern</option>
                        {VIBRATION_PATTERN_OPTIONS.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Alert Behavior
                      </label>
                      <select
                        value={chat.notificationMode}
                        onChange={(e) =>
                          onUpdateChatConfig({
                            notificationMode: e.target.value as PerChatNotificationMode,
                          })
                        }
                        className="w-full rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-2 text-xs text-white"
                      >
                        <option value="default">Standard Alert</option>
                        <option value="priority">Priority Alert</option>
                        <option value="hide_preview">Hide Message Text</option>
                        <option value="silent">Silent (No Sound)</option>
                        <option value="vibrate">Vibrate Only</option>
                        <option value="no_vibration">Sound Without Vibration</option>
                        <option value="disabled">Turn Off Alerts</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Read Receipts Privacy & Message Status Tick Legend */}
            {onUpdateSettings && (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <CheckCheck className="w-4 h-4 text-sky-400" />
                      <span>Read Receipts (Two Blue Ticks)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Toggle visibility of blue read ticks in 1-to-1 chats for privacy.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.readReceipts}
                    onChange={(e) => onUpdateSettings({ readReceipts: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-emerald-500 shrink-0"
                  />
                </label>

                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono">
                  <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center gap-1 text-slate-400">
                    <Check className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                    <span>Sent</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                    <CheckCheck className="w-3.5 h-3.5 text-slate-300 stroke-[2.4]" />
                    <span>Delivered</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center gap-1 text-sky-400">
                    <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.6]" />
                    <span>Read</span>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Vault Lock, Quick Shortcut & Mute */}
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <label className="flex items-center justify-between py-1.5 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold">
                    {chat.locked ? 'Locked in Protected Vault' : 'Move to Locked Chats Vault'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Requires PIN / Biometric auth. You can always retrieve it from the Vault banner at the top of the Chat List.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={chat.locked}
                  onChange={(e) => onUpdateChatConfig({ locked: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between py-1.5 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold">Add Quick Shortcut to Top Bar</div>
                  <div className="text-[11px] text-slate-400">
                    Pins a 1-tap avatar shortcut above your chat list.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(chat.hasShortcut)}
                  onChange={(e) => onUpdateChatConfig({ hasShortcut: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between py-1.5 cursor-pointer">
                <span className="text-xs font-semibold">Mute Conversation</span>
                <input
                  type="checkbox"
                  checked={chat.muted}
                  onChange={(e) => onUpdateChatConfig({ muted: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            {/* Group Admin Controls */}
            {chat.isGroup && chat.groupSettings && (
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <Users className="w-4 h-4" />
                  <span>Group Admin & Member Controls</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="text-slate-400">Encrypted Invite Link:</div>
                  <div className="font-mono text-emerald-300 select-all">
                    {chat.groupSettings.inviteLink}
                  </div>
                </div>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>Require Admin Approval for New Members</span>
                  <input
                    type="checkbox"
                    checked={chat.groupSettings.adminApprovalRequired}
                    onChange={(e) =>
                      onUpdateChatConfig({
                        groupSettings: {
                          ...chat.groupSettings!,
                          adminApprovalRequired: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>Restrict Sending Messages to Admins Only</span>
                  <input
                    type="checkbox"
                    checked={chat.groupSettings.onlyAdminsCanSend}
                    onChange={(e) =>
                      onUpdateChatConfig({
                        groupSettings: {
                          ...chat.groupSettings!,
                          onlyAdminsCanSend: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                </label>

                <div className="space-y-1.5 pt-2">
                  <div className="text-xs font-semibold">
                    Group Members ({chat.groupSettings.members.length})
                  </div>
                  {chat.groupSettings.members.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium">{mem.name}</span>
                        <span className="text-slate-500 ml-1.5">· {mem.role}</span>
                      </div>
                      {mem.id !== currentUserId && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              onUpdateChatConfig({
                                groupSettings: {
                                  ...chat.groupSettings!,
                                  members: chat.groupSettings!.members.map((x) =>
                                    x.id === mem.id
                                      ? {
                                          ...x,
                                          role: x.role === 'admin' ? 'member' : 'admin',
                                        }
                                      : x
                                  ),
                                },
                              })
                            }
                            className="text-emerald-400 hover:underline text-[11px]"
                          >
                            {mem.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            onClick={() =>
                              onUpdateChatConfig({
                                groupSettings: {
                                  ...chat.groupSettings!,
                                  members: chat.groupSettings!.members.filter(
                                    (x) => x.id !== mem.id
                                  ),
                                },
                              })
                            }
                            className="text-rose-400 hover:underline text-[11px]"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={newGroupMemberName}
                      onChange={(e) => setNewGroupMemberName(e.target.value)}
                      placeholder="Add member by name or phone…"
                      className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => {
                        if (newGroupMemberName.trim()) {
                          onUpdateChatConfig({
                            groupSettings: {
                              ...chat.groupSettings!,
                              members: [
                                ...chat.groupSettings!.members,
                                {
                                  id: `mem_${Date.now()}`,
                                  name: newGroupMemberName.trim(),
                                  username: newGroupMemberName
                                    .trim()
                                    .toLowerCase()
                                    .replace(/\s+/g, '.'),
                                  role: 'member',
                                  avatarColor: '#10B981',
                                },
                              ],
                            },
                          });
                          setNewGroupMemberName('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Per-Chat Media Visibility in Phone Gallery */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Image className="w-4 h-4" />
                  <span>Media Visibility in Gallery</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                  {isMediaVisibleInGallery() ? 'Shown in Gallery' : 'Hidden (.nomedia)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Show newly downloaded media from this chat in your device’s gallery?
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      id: 'default',
                      label: `Default (${settings.mediaVisibilityInGallery ? 'Yes' : 'No'})`,
                    },
                    { id: 'always', label: 'Yes (Show)' },
                    { id: 'never', label: 'No (Hide)' },
                  ] as const
                ).map((opt) => {
                  const active = (chat.mediaVisibilityInGallery || 'default') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onUpdateChatConfig({ mediaVisibilityInGallery: opt.id });
                        showToast(`Media visibility set to: ${opt.label}`);
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chat Export, Block Contact & Clear History Actions */}
            <div className="border-t border-slate-800 pt-4 space-y-2">
              <button
                onClick={onExportChat}
                className="w-full min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Export Chat History
              </button>

              {!chat.isGroup && (
                <button
                  onClick={onToggleBlockContact}
                  className="w-full min-h-[40px] rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  {isBlocked ? `Unblock ${chat.name}` : `Block ${chat.name}`}
                </button>
              )}

              <button
                onClick={() => {
                  onClearChat();
                  setShowChatInfoDrawer(false);
                }}
                className="w-full min-h-[40px] rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear Conversation History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Media Viewer Lightbox (Photos, Videos & Stickers) */}
      {activeLightboxMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setActiveLightboxMedia(null)}
        >
          {/* Top Bar */}
          <div
            className="flex items-center justify-between gap-3 pb-3 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setActiveLightboxMedia(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {activeLightboxMedia.senderName}
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {activeLightboxMedia.name} ·{' '}
                  {new Date(activeLightboxMedia.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(activeLightboxMedia.type === 'photo' || activeLightboxMedia.type === 'video') && (
                <button
                  type="button"
                  onClick={() => {
                    const media = activeLightboxMedia;
                    setActiveLightboxMedia(null);
                    setProMediaEditor({
                      isOpen: true,
                      mediaType: media.type === 'video' ? 'video' : 'photo',
                      url: media.url,
                      caption: media.caption || '',
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-lg"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>Edit & Send</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleSaveAttachmentToDisk(
                    {
                      id: `lightbox_${Date.now()}`,
                      type: activeLightboxMedia.type,
                      name: activeLightboxMedia.name,
                      sizeBytes: activeLightboxMedia.sizeBytes || 1024000,
                      quality: 'hd',
                      uploadProgress: 100,
                      url: activeLightboxMedia.url,
                    },
                    true
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg"
              >
                <Download className="w-4 h-4" />
                <span>Save to Gallery</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveLightboxMedia(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Media Viewport */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden my-3"
            onClick={(e) => e.stopPropagation()}
          >
            {activeLightboxMedia.type === 'video' ? (
              <div className="relative inline-block max-h-[75dvh] max-w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <video
                  src={activeLightboxMedia.url}
                  controls
                  autoPlay
                  playsInline
                  muted={Boolean(activeLightboxMedia.videoMeta?.muted)}
                  onLoadedMetadata={(e) => {
                    const vm = activeLightboxMedia.videoMeta;
                    if (!vm) return;
                    if (vm.playbackRate) e.currentTarget.playbackRate = vm.playbackRate;
                    if (typeof vm.muted === 'boolean') e.currentTarget.muted = vm.muted;
                    if (vm.trimStart && vm.trimStart > 0) {
                      e.currentTarget.currentTime = vm.trimStart;
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const vm = activeLightboxMedia.videoMeta;
                    if (!vm) return;
                    if (vm.trimEnd && e.currentTarget.currentTime >= vm.trimEnd) {
                      e.currentTarget.currentTime = vm.trimStart || 0;
                    }
                  }}
                  style={{
                    filter:
                      activeLightboxMedia.videoMeta?.filterCss &&
                      activeLightboxMedia.videoMeta.filterCss !== 'none'
                        ? activeLightboxMedia.videoMeta.filterCss
                        : undefined,
                  }}
                  className="max-h-[75dvh] max-w-full block"
                />
                {activeLightboxMedia.videoMeta?.overlays &&
                  activeLightboxMedia.videoMeta.overlays.length > 0 && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
                      {activeLightboxMedia.videoMeta.overlays.map((ov) => (
                        <div
                          key={ov.id}
                          style={{
                            left: `${ov.x}%`,
                            top: `${ov.y}%`,
                            transform: `translate(-50%, -50%) scale(${ov.scale}) rotate(${
                              ov.rotation || 0
                            }deg) ${ov.flipH ? 'scaleX(-1)' : ''}`,
                          }}
                          className="absolute select-none"
                        >
                          {ov.stickerUrl ? (
                            <img
                              src={ov.stickerUrl}
                              alt={ov.text}
                              className="w-24 h-24 object-contain drop-shadow-2xl"
                            />
                          ) : ov.kind === 'sticker' ? (
                            <span className="text-5xl drop-shadow-2xl block leading-none">
                              {ov.text}
                            </span>
                          ) : (
                            <span
                              style={{
                                color: ov.color,
                                backgroundColor:
                                  ov.bgStyle === 'pill' ? 'rgba(2,6,23,0.85)' : undefined,
                              }}
                              className="px-3 py-1 rounded-xl text-base font-extrabold whitespace-nowrap shadow-xl block"
                            >
                              {ov.text}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ) : (
              <img
                src={activeLightboxMedia.url}
                alt={activeLightboxMedia.name}
                className="max-h-[75dvh] max-w-full object-contain rounded-2xl shadow-2xl"
              />
            )}
          </div>

          {/* Bottom Caption & Gallery Status Bar */}
          <div
            className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center sm:text-left">
              {activeLightboxMedia.caption && (
                <p className="text-sm text-white font-medium mb-0.5">
                  {activeLightboxMedia.caption}
                </p>
              )}
              <span className="text-[11px] text-slate-400 font-mono">
                End-to-End Encrypted Media ·{' '}
                {isMediaVisibleInGallery()
                  ? 'Visible in Phone Gallery'
                  : 'Private (.nomedia isolated from Gallery)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Profile Photo Lightbox & Custom Contact/Group Photo Editor */}
      {showPeerProfileLightbox && (
        <ProfilePhotoLightboxModal
          name={chat.name}
          username={chat.username}
          about={chat.about}
          avatarUrl={chat.avatarUrl}
          avatarColor={chat.avatarColor}
          canEditPhoto
          onUpdateAvatarUrl={(url) => {
            onUpdateChatConfig({ avatarUrl: url });
            showToast(
              url
                ? `Updated ${chat.isGroup ? 'group icon' : 'profile photo'} for ${chat.name}`
                : `Removed custom photo for ${chat.name}`
            );
          }}
          onUpdateAvatarColor={(col) => onUpdateChatConfig({ avatarColor: col })}
          onClose={() => setShowPeerProfileLightbox(false)}
        />
      )}

      {/* Pro Media Editor Studio Modal for Sending Edited Photos & Videos in Chat */}
      <MediaEditorModal
        isOpen={proMediaEditor.isOpen}
        initialMediaType={proMediaEditor.mediaType}
        initialMediaUrl={proMediaEditor.url}
        initialCaption={proMediaEditor.caption}
        initialTrimStart={proMediaEditor.trimStart}
        initialTrimEnd={proMediaEditor.trimEnd}
        mode="chat"
        recipientName={chat.name}
        onClose={() => setProMediaEditor((prev) => ({ ...prev, isOpen: false }))}
        onApply={(res) => {
          setSelectedMediaQuality(res.quality);
          const trimRatio =
            res.mediaType === 'video' &&
            res.videoMeta &&
            res.videoMeta.originalDuration &&
            res.videoMeta.originalDuration > 0
              ? Math.max(
                  0.08,
                  (res.videoMeta.trimEnd - res.videoMeta.trimStart) /
                    res.videoMeta.originalDuration
                )
              : 1;
          const rawBytes =
            res.mediaType === 'video' ? Math.round(11400000 * trimRatio) : 2850000;

          handleSendAttachment(
            res.mediaType,
            res.mediaType === 'video'
              ? `Trimmed_Video_${Date.now()}.mp4`
              : `Edited_Photo_${Date.now()}.jpg`,
            rawBytes,
            {
              url: res.url,
              thumbnailUrl: res.thumbnailUrl || (res.mediaType === 'photo' ? res.url : undefined),
              caption: res.caption || (res.viewOnce ? '🔒 View-Once Encrypted Media' : undefined),
              quality: res.quality,
              durationSec: res.durationSec,
              videoMeta: res.videoMeta,
            }
          );
          const trimSummary =
            res.mediaType === 'video' && res.videoMeta
              ? ` · ${res.videoMeta.trimStart.toFixed(1)}s–${res.videoMeta.trimEnd.toFixed(1)}s`
              : '';
          showToast(
            `Sent ${res.mediaType === 'video' ? 'trimmed video' : 'edited photo'} (${res.quality.toUpperCase()}${trimSummary})${
              res.viewOnce ? ' · View Once' : ''
            } ✨`
          );
        }}
      />
    </div>
  );
};
