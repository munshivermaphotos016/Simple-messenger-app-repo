import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Edit3,
  Eye,
  Heart,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  MoreVertical,
  Palette,
  Pause,
  Play,
  Plus,
  Send,
  Share2,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Type,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { AppSettings, ChatConversation, StatusPost, UserAccount } from '../types/simple';
import { EmojiPickerPanel } from './EmojiPickerPanel';
import { UserAvatar } from './ProfilePhotoModal';
import { MediaEditorModal } from './MediaEditorModal';
import { STYLED_3D_SCENES } from '../utils/cartoonAvatars';

interface StatusSectionViewProps {
  account: UserAccount;
  settings: AppSettings;
  statuses: StatusPost[];
  chats: ChatConversation[];
  onAddStatus: (post: StatusPost) => void;
  onDeleteStatus: (statusId: string) => void;
  onMarkStatusViewed: (statusId: string) => void;
  onReactToStatus: (statusId: string, emoji: string) => void;
  onReplyToStatusInChat: (status: StatusPost, replyText: string) => void;
  onOpenStatusOptionsModal?: (status: StatusPost) => void;
}

const STATUS_BG_PALETTES = [
  {
    id: 'emerald',
    label: 'Emerald',
    css: 'linear-gradient(135deg, #064E3B 0%, #059669 50%, #022C22 100%)',
  },
  {
    id: 'indigo',
    label: 'Midnight',
    css: 'linear-gradient(135deg, #1E1B4B 0%, #4F46E5 50%, #0F172A 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css: 'linear-gradient(135deg, #881337 0%, #E11D48 50%, #4C0519 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    css: 'linear-gradient(135deg, #083344 0%, #0891B2 50%, #0F172A 100%)',
  },
  {
    id: 'amber',
    label: 'Gold',
    css: 'linear-gradient(135deg, #78350F 0%, #D97706 50%, #451A03 100%)',
  },
  {
    id: 'violet',
    label: 'Purple',
    css: 'linear-gradient(135deg, #4A044E 0%, #9333EA 50%, #1E1B4B 100%)',
  },
  {
    id: 'slate',
    label: 'Dark Slate',
    css: 'linear-gradient(135deg, #0F172A 0%, #334155 50%, #020617 100%)',
  },
];

const SAMPLE_MEDIA_GALLERY: Array<{
  id: string;
  type: 'photo' | 'video';
  label: string;
  url: string;
  defaultCaption: string;
}> = [
  {
    id: 'sample_photo_1',
    type: 'photo',
    label: '3D Aurora Peaks',
    url: STYLED_3D_SCENES.aurora_peaks,
    defaultCaption: 'Peaceful evening under the aurora 🏔️✨',
  },
  {
    id: 'sample_photo_2',
    type: 'photo',
    label: '3D Neon Horizon',
    url: STYLED_3D_SCENES.neon_city,
    defaultCaption: 'Late night synthwave vibes 🌃🚀',
  },
  {
    id: 'sample_photo_3',
    type: 'photo',
    label: '3D Tropical Sunset',
    url: STYLED_3D_SCENES.tropical_beach,
    defaultCaption: 'Weekend getaway by the ocean 🌊🌴',
  },
  {
    id: 'sample_video_1',
    type: 'video',
    label: 'Ocean Waves (Video)',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
    defaultCaption: 'Listening to the ocean waves 🌊🔊',
  },
  {
    id: 'sample_video_2',
    type: 'video',
    label: 'Forest Stream (Video)',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
    defaultCaption: 'Morning hike through the forest 🌲☀️',
  },
];

const QUICK_STATUS_REACTIONS = ['❤️', '😂', '🔥', '👏', '😍', '🎉', '💯', '🙏'];

function formatStatusRelativeTime(ts: number): string {
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `Today, ${hrs}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface AuthorStatusGroup {
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarColor: string;
  authorAvatarUrl?: string;
  posts: StatusPost[];
  hasUnviewed: boolean;
  latestTimestamp: number;
}

export const StatusSectionView: React.FC<StatusSectionViewProps> = ({
  account,
  statuses,
  onAddStatus,
  onDeleteStatus,
  onMarkStatusViewed,
  onReactToStatus,
  onReplyToStatusInChat,
}) => {
  // Full-Screen Story Viewer State
  const [viewerGroup, setViewerGroup] = useState<AuthorStatusGroup | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [viewerProgress, setViewerProgress] = useState<number>(0);
  const [isViewerPaused, setIsViewerPaused] = useState<boolean>(false);
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(false);
  const [replyInput, setReplyInput] = useState<string>('');
  const [flyingEmoji, setFlyingEmoji] = useState<string | null>(null);

  // Status Creator Modal ('text' or 'media' for Photo/Video + Text)
  const [creatorOpen, setCreatorOpen] = useState<boolean>(false);
  const [creatorType, setCreatorType] = useState<'text' | 'photo' | 'video'>('text');
  const [statusText, setStatusText] = useState<string>('');
  const [statusCaption, setStatusCaption] = useState<string>('');
  const [mediaUrl, setMediaUrl] = useState<string>(SAMPLE_MEDIA_GALLERY[0].url);
  const [bgIndex, setBgIndex] = useState<number>(0);
  const [fontStyle, setFontStyle] = useState<'sans' | 'serif' | 'mono' | 'bold'>('sans');
  const [privacy, setPrivacy] = useState<StatusPost['privacy']>('all_contacts');
  const [expiryDuration, setExpiryDuration] = useState<'24h' | '6h' | '1h' | 'view_once'>('24h');
  const [showCreatorEmoji, setShowCreatorEmoji] = useState<boolean>(false);
  const [showProMediaStudio, setShowProMediaStudio] = useState<boolean>(false);

  // Manage My Statuses Expansion & Multi-Select State
  const [showMyStatusList, setShowMyStatusList] = useState<boolean>(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([]);
  const [showSelectionMoreMenu, setShowSelectionMoreMenu] = useState<boolean>(false);
  const [mutedAuthorIds, setMutedAuthorIds] = useState<string[]>([]);
  const [showMutedSection, setShowMutedSection] = useState<boolean>(false);
  const [activeOptionsPost, setActiveOptionsPost] = useState<StatusPost | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const triggerToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 2600);
  };

  // Separate My Statuses vs Contact Statuses
  const myPosts = statuses.filter(
    (s) => s.authorId === account.id || s.authorName.includes('(You)')
  );
  const contactPosts = statuses.filter(
    (s) => s.authorId !== account.id && !s.authorName.includes('(You)')
  );

  // Group Contact Statuses by Author
  const authorGroupsMap = new Map<string, AuthorStatusGroup>();
  contactPosts.forEach((post) => {
    const existing = authorGroupsMap.get(post.authorId);
    if (!existing) {
      authorGroupsMap.set(post.authorId, {
        authorId: post.authorId,
        authorName: post.authorName,
        authorUsername: post.authorUsername,
        authorAvatarColor: post.authorAvatarColor,
        authorAvatarUrl: post.authorAvatarUrl,
        posts: [post],
        hasUnviewed: !post.viewedByMe,
        latestTimestamp: post.createdAt,
      });
    } else {
      existing.posts.push(post);
      if (!existing.authorAvatarUrl && post.authorAvatarUrl) {
        existing.authorAvatarUrl = post.authorAvatarUrl;
      }
      if (!post.viewedByMe) existing.hasUnviewed = true;
      if (post.createdAt > existing.latestTimestamp) {
        existing.latestTimestamp = post.createdAt;
      }
    }
  });

  const allContactGroups = Array.from(authorGroupsMap.values()).sort(
    (a, b) => b.latestTimestamp - a.latestTimestamp
  );

  const activeContactGroups = allContactGroups.filter(
    (g) => !mutedAuthorIds.includes(g.authorId)
  );
  const mutedContactGroups = allContactGroups.filter((g) =>
    mutedAuthorIds.includes(g.authorId)
  );

  const recentGroups = activeContactGroups.filter((g) => g.hasUnviewed);
  const viewedGroups = activeContactGroups.filter((g) => !g.hasUnviewed);

  const myGroup: AuthorStatusGroup = {
    authorId: account.id,
    authorName: `${account.name} (My Status)`,
    authorUsername: account.username,
    authorAvatarColor: account.avatarColor,
    authorAvatarUrl: account.avatarUrl,
    posts: myPosts,
    hasUnviewed: false,
    latestTimestamp: myPosts[0]?.createdAt || Date.now(),
  };

  const openStoryViewer = (group: AuthorStatusGroup, startIdx = 0) => {
    if (group.posts.length === 0) {
      openCreator('photo');
      return;
    }
    const safeIdx = Math.min(Math.max(0, startIdx), group.posts.length - 1);
    setViewerGroup(group);
    setViewerIndex(safeIdx);
    setViewerProgress(0);
    setIsViewerPaused(false);
    setReplyInput('');
    const targetPost = group.posts[safeIdx];
    if (targetPost && !targetPost.viewedByMe) {
      onMarkStatusViewed(targetPost.id);
    }
  };

  const openCreator = (mode: 'text' | 'photo' | 'video') => {
    setCreatorType(mode);
    setStatusText('');
    setStatusCaption('');
    if (mode === 'photo') {
      setMediaUrl(SAMPLE_MEDIA_GALLERY[0].url);
    } else if (mode === 'video') {
      setMediaUrl(SAMPLE_MEDIA_GALLERY[3].url);
    }
    setShowCreatorEmoji(false);
    setCreatorOpen(true);
  };

  // Upload real image or video from user's device
  const handleMediaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const objectUrl = URL.createObjectURL(file);
    setCreatorType(isVideo ? 'video' : 'photo');
    setMediaUrl(objectUrl);
    if (!statusText.trim()) {
      setStatusText(file.name.replace(/\.[^/.]+$/, ''));
    }
    setCreatorOpen(true);
    e.target.value = '';
  };

  // Auto-advance Full-Screen Story Viewer
  useEffect(() => {
    if (!viewerGroup || isViewerPaused) return;
    const currentPost = viewerGroup.posts[viewerIndex];
    if (!currentPost) return;

    const interval = window.setInterval(() => {
      setViewerProgress((prev) => {
        if (prev >= 100) {
          if (viewerIndex < viewerGroup.posts.length - 1) {
            const nextIdx = viewerIndex + 1;
            setViewerIndex(nextIdx);
            const nextPost = viewerGroup.posts[nextIdx];
            if (nextPost && !nextPost.viewedByMe) {
              onMarkStatusViewed(nextPost.id);
            }
            return 0;
          } else {
            setViewerGroup(null);
            return 0;
          }
        }
        return prev + 2;
      });
    }, 110);

    return () => window.clearInterval(interval);
  }, [viewerGroup, viewerIndex, isViewerPaused]);

  const handlePublishStatus = () => {
    const isMedia = creatorType === 'photo' || creatorType === 'video';
    const primaryText = statusText.trim() || (isMedia ? statusCaption.trim() || 'New Status' : '');
    if (!primaryText && !isMedia) return;

    const hoursMap = { '24h': 24, '6h': 6, '1h': 1, view_once: 1 };
    const expiryMs = hoursMap[expiryDuration] * 3600 * 1000;

    const newPost: StatusPost = {
      id: `st_${Date.now()}`,
      authorId: account.id,
      authorName: `${account.name} (You)`,
      authorUsername: account.username,
      authorAvatarColor: account.avatarColor,
      authorAvatarUrl: account.avatarUrl,
      contentType: creatorType,
      text: primaryText,
      caption: isMedia ? statusCaption.trim() : undefined,
      mediaUrl: isMedia ? mediaUrl : undefined,
      fontStyle,
      backgroundColor: STATUS_BG_PALETTES[bgIndex % STATUS_BG_PALETTES.length].css,
      privacy,
      expiryDuration,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiryMs,
      viewedByMe: true,
      viewsCount: 1,
      reactions: [],
      likedByMe: false,
    };

    onAddStatus(newPost);
    setCreatorOpen(false);
    setStatusText('');
    setStatusCaption('');
    triggerToast('Status posted!');
  };

  // Multi-select helpers
  const toggleSelectStatus = (id: string) => {
    setSelectedStatusIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAuthorGroup = (group: AuthorStatusGroup) => {
    const ids = group.posts.map((p) => p.id);
    const allSelected = ids.every((id) => selectedStatusIds.includes(id));
    if (allSelected) {
      setSelectedStatusIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedStatusIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleSelectAllStatuses = () => {
    const allIds = statuses.map((s) => s.id);
    if (selectedStatusIds.length === allIds.length) {
      setSelectedStatusIds([]);
    } else {
      setSelectedStatusIds(allIds);
    }
  };

  const handleBatchMarkViewed = () => {
    selectedStatusIds.forEach((id) => onMarkStatusViewed(id));
    triggerToast(`Marked ${selectedStatusIds.length} status updates as viewed`);
    setSelectedStatusIds([]);
    setIsMultiSelectMode(false);
  };

  const handleBatchCopyStatuses = () => {
    const selectedPosts = statuses.filter((s) => selectedStatusIds.includes(s.id));
    const text = selectedPosts
      .map((s) => `[${s.authorName}]: ${s.text}${s.caption ? ` — ${s.caption}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    triggerToast(`Copied ${selectedPosts.length} status updates`);
    setSelectedStatusIds([]);
    setIsMultiSelectMode(false);
  };

  const handleBatchMuteAuthors = () => {
    const selectedPosts = statuses.filter((s) => selectedStatusIds.includes(s.id));
    const authorIds = Array.from(
      new Set(
        selectedPosts
          .map((s) => s.authorId)
          .filter((aid) => aid !== account.id)
      )
    );
    setMutedAuthorIds((prev) => Array.from(new Set([...prev, ...authorIds])));
    triggerToast(`Muted status updates from ${authorIds.length} contact(s)`);
    setSelectedStatusIds([]);
    setIsMultiSelectMode(false);
  };

  const handleBatchDeleteStatuses = () => {
    const count = selectedStatusIds.length;
    selectedStatusIds.forEach((id) => onDeleteStatus(id));
    triggerToast(`Deleted ${count} status update(s)`);
    setSelectedStatusIds([]);
    setIsMultiSelectMode(false);
  };

  const fontClassMap: Record<NonNullable<StatusPost['fontStyle']>, string> = {
    sans: 'font-sans font-semibold',
    serif: 'font-serif italic font-semibold',
    mono: 'font-mono font-medium',
    bold: 'font-display font-extrabold tracking-tight',
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#0A0E14] relative pb-28">
      {/* Hidden File Input for Uploading Real Image or Video to Status */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleMediaFileUpload}
      />

      {/* Toast Notification */}
      {toastText && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 border border-emerald-500/50 text-xs font-semibold text-emerald-300 shadow-2xl">
          {toastText}
        </div>
      )}

      <div className="max-w-2xl mx-auto w-full p-3.5 sm:p-6 space-y-4">
        {/* Top Bar: Clean Status Header OR Multi-Select Action Bar */}
        {isMultiSelectMode || selectedStatusIds.length > 0 ? (
          <div className="p-2.5 sm:p-3 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-20 backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedStatusIds([]);
                  setIsMultiSelectMode(false);
                }}
                className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-emerald-900/60 flex items-center justify-center text-emerald-200"
                title="Exit selection"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                {selectedStatusIds.length} selected
              </span>
              <button
                onClick={handleSelectAllStatuses}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-[11px] font-semibold text-emerald-300 whitespace-nowrap"
              >
                {selectedStatusIds.length === statuses.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleBatchMarkViewed}
                disabled={selectedStatusIds.length === 0}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Viewed</span>
              </button>
              <button
                onClick={handleBatchCopyStatuses}
                disabled={selectedStatusIds.length === 0}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium flex items-center gap-1 disabled:opacity-40"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                <span>Copy</span>
              </button>
              <button
                onClick={handleBatchMuteAuthors}
                disabled={selectedStatusIds.length === 0}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium flex items-center gap-1 disabled:opacity-40"
              >
                <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                <span>Mute</span>
              </button>
              <button
                onClick={handleBatchDeleteStatuses}
                disabled={selectedStatusIds.length === 0}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              {/* 3-Dots Top Action Menu Button (Opens Viewport-Safe Bottom Sheet / Modal) */}
              <button
                onClick={() => setShowSelectionMoreMenu(true)}
                className={`min-h-[34px] min-w-[34px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center transition-colors ${
                  showSelectionMoreMenu
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-900 border-emerald-500/40 text-emerald-200 hover:bg-slate-800'
                }`}
                title="All actions for selected statuses"
                aria-label="More actions for selected statuses"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-white">Status</h2>
              <p className="text-xs text-slate-400">
                Share photos, videos, or text updates that disappear after 24 hours
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {/* Quick Privacy Selector */}
              <select
                value={privacy}
                onChange={(e) => {
                  setPrivacy(e.target.value as StatusPost['privacy']);
                  triggerToast('Status privacy updated');
                }}
                className="min-h-[36px] rounded-xl bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                title="Who can see my status updates"
              >
                <option value="all_contacts">Privacy: My Contacts</option>
                <option value="selected_contacts">Privacy: Close Friends</option>
                <option value="exclude_contacts">Privacy: Hide From Some</option>
                <option value="nobody">Privacy: Only Me</option>
              </select>

              {/* Pro Studio Button */}
              <button
                type="button"
                onClick={() => {
                  setCreatorType('photo');
                  setMediaUrl(SAMPLE_MEDIA_GALLERY[0].url);
                  setShowProMediaStudio(true);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 flex items-center gap-1.5"
                title="Open Pro Photo & Video Status Studio"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Pro Studio</span>
              </button>

              {/* Multi-Select Mode Button */}
              <button
                onClick={() => setIsMultiSelectMode(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1.5"
                title="Select multiple status updates"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Select</span>
              </button>
            </div>
          </div>
        )}

        {/* ====================================================================
            1. "MY STATUS" ROW (Simple & Direct)
           ==================================================================== */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div
              onClick={() => {
                if (myPosts.length > 0) {
                  openStoryViewer(myGroup, 0);
                } else {
                  openCreator('photo');
                }
              }}
              className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
            >
              {/* Avatar with Ring or + Badge */}
              <div className="relative shrink-0">
                <div
                  className={`w-14 h-14 rounded-full p-[2.5px] ${
                    myPosts.length > 0
                      ? 'bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400'
                      : 'bg-slate-800'
                  }`}
                >
                  <UserAvatar
                    name={account.name}
                    avatarColor={account.avatarColor}
                    avatarUrl={account.avatarUrl}
                    sizeClass="w-full h-full"
                    textSizeClass="text-sm"
                    className="border-2 border-slate-950"
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreator('photo');
                  }}
                  className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-emerald-500 text-slate-950 border-2 border-slate-950 flex items-center justify-center shadow-md"
                  title="Add photo, video, or text status"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                  My Status
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  {myPosts.length > 0
                    ? `${myPosts.length} active update${myPosts.length > 1 ? 's' : ''} · Tap to view`
                    : 'Tap to add photo, video, or text status'}
                </div>
              </div>
            </div>

            {/* Right Quick Action Icons (Camera Photo/Video + Pro Studio + Pencil Text) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCreatorType('photo');
                  setMediaUrl(SAMPLE_MEDIA_GALLERY[0].url);
                  setShowProMediaStudio(true);
                }}
                className="w-10 h-10 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-colors"
                title="Open Pro Photo & Video Status Editor"
              >
                <Wand2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openCreator('photo')}
                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center transition-colors"
                title="Add Photo or Video Status with Text"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openCreator('text')}
                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
                title="Add Text Status"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {myPosts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMyStatusList((s) => !s)}
                  className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                  title="Manage my status updates"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Expandable "My Status Updates" list when user has posted statuses */}
          {showMyStatusList && myPosts.length > 0 && (
            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>My Active Status Updates ({myPosts.length})</span>
                <button
                  onClick={() => {
                    myPosts.forEach((p) => onDeleteStatus(p.id));
                    setShowMyStatusList(false);
                    triggerToast('Deleted all your status updates');
                  }}
                  className="text-rose-400 hover:underline font-medium"
                >
                  Delete All
                </button>
              </div>
              {myPosts.map((post, idx) => {
                const isSelected = selectedStatusIds.includes(post.id);
                return (
                  <div
                    key={post.id}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        toggleSelectStatus(post.id);
                      } else {
                        openStoryViewer(myGroup, idx);
                      }
                    }}
                    className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-950"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {isMultiSelectMode && (
                        <span className="text-emerald-400 shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </span>
                      )}
                      <div
                        className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-white border border-white/10"
                        style={{ background: post.backgroundColor }}
                      >
                        {post.mediaUrl && post.contentType === 'photo' ? (
                          <img
                            src={post.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : post.contentType === 'video' ? (
                          <Video className="w-4 h-4 text-white" />
                        ) : (
                          <span className="px-1 truncate">{post.text.slice(0, 4)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-white truncate">
                          {post.text}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{formatStatusRelativeTime(post.createdAt)}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Eye className="w-3 h-3" />
                            {post.viewsCount || 1} views
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStatus(post.id);
                        triggerToast('Status deleted');
                      }}
                      className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                      title="Delete this status"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ====================================================================
            2. RECENT UPDATES (Unviewed Stories with Glowing Emerald Ring)
           ==================================================================== */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400 px-1">
            Recent updates ({recentGroups.length})
          </div>

          {recentGroups.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-400">
              No new unread status updates right now. Check Viewed updates below or post your own!
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70 rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              {recentGroups.map((group) => {
                const latest = group.posts[0];
                const isGroupSelected = group.posts.every((p) =>
                  selectedStatusIds.includes(p.id)
                );
                return (
                  <div
                    key={group.authorId}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        toggleSelectAuthorGroup(group);
                      } else {
                        openStoryViewer(group, 0);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveOptionsPost(latest);
                    }}
                    onTouchStart={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = window.setTimeout(() => {
                        navigator.vibrate?.(15);
                        setActiveOptionsPost(latest);
                      }, 450);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    }}
                    className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isGroupSelected
                        ? 'bg-emerald-500/15'
                        : 'hover:bg-slate-900/90'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {isMultiSelectMode && (
                        <span className="text-emerald-400 shrink-0">
                          {isGroupSelected ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </span>
                      )}

                      {/* Glowing Unviewed Story Ring */}
                      <div className="w-13 h-13 rounded-full p-[2.5px] bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 shrink-0 shadow-md shadow-emerald-500/15">
                        <UserAvatar
                          name={group.authorName}
                          avatarColor={group.authorAvatarColor}
                          avatarUrl={group.authorAvatarUrl}
                          sizeClass="w-full h-full"
                          textSizeClass="text-xs"
                          className="border-2 border-slate-950"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white truncate">
                            {group.authorName}
                          </span>
                          {group.posts.length > 1 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              {group.posts.length} stories
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300 truncate mt-0.5">
                          {latest.contentType === 'photo'
                            ? `📷 ${latest.text}`
                            : latest.contentType === 'video'
                            ? `🎥 ${latest.text}`
                            : latest.text}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {formatStatusRelativeTime(group.latestTimestamp)}
                        </div>
                      </div>
                    </div>

                    {/* Right Miniature Thumbnail + 3-Dots Button */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="w-11 h-11 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center text-xs text-white relative"
                        style={{ background: latest.backgroundColor }}
                      >
                        {latest.mediaUrl && latest.contentType === 'photo' ? (
                          <img
                            src={latest.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : latest.contentType === 'video' ? (
                          <div className="w-full h-full bg-slate-950 flex items-center justify-center">
                            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-1 text-center line-clamp-2">
                            {latest.text.slice(0, 12)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveOptionsPost(latest);
                        }}
                        className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                        title="Status options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ====================================================================
            3. VIEWED UPDATES (Gray Story Ring)
           ==================================================================== */}
        {viewedGroups.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 px-1">
              Viewed updates ({viewedGroups.length})
            </div>

            <div className="divide-y divide-slate-800/70 rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden">
              {viewedGroups.map((group) => {
                const latest = group.posts[0];
                const isGroupSelected = group.posts.every((p) =>
                  selectedStatusIds.includes(p.id)
                );
                return (
                  <div
                    key={group.authorId}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        toggleSelectAuthorGroup(group);
                      } else {
                        openStoryViewer(group, 0);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveOptionsPost(latest);
                    }}
                    className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isGroupSelected
                        ? 'bg-emerald-500/15'
                        : 'hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {isMultiSelectMode && (
                        <span className="text-emerald-400 shrink-0">
                          {isGroupSelected ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </span>
                      )}

                      <div className="w-13 h-13 rounded-full p-[2px] bg-slate-700 shrink-0">
                        <UserAvatar
                          name={group.authorName}
                          avatarColor={group.authorAvatarColor}
                          avatarUrl={group.authorAvatarUrl}
                          sizeClass="w-full h-full"
                          textSizeClass="text-xs"
                          className="border-2 border-slate-950"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-200 truncate">
                          {group.authorName}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {latest.contentType === 'photo'
                            ? `📷 ${latest.text}`
                            : latest.contentType === 'video'
                            ? `🎥 ${latest.text}`
                            : latest.text}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatStatusRelativeTime(group.latestTimestamp)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="w-11 h-11 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center text-xs text-white opacity-80"
                        style={{ background: latest.backgroundColor }}
                      >
                        {latest.mediaUrl && latest.contentType === 'photo' ? (
                          <img
                            src={latest.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : latest.contentType === 'video' ? (
                          <Play className="w-4 h-4 text-white" />
                        ) : (
                          <span className="text-[10px] font-bold px-1 text-center line-clamp-2">
                            {latest.text.slice(0, 12)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveOptionsPost(latest);
                        }}
                        className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====================================================================
            4. MUTED UPDATES (Collapsible Section)
           ==================================================================== */}
        {mutedContactGroups.length > 0 && (
          <div className="space-y-2 pt-2">
            <button
              onClick={() => setShowMutedSection((s) => !s)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 px-1 py-1"
            >
              <span>Muted updates ({mutedContactGroups.length})</span>
              {showMutedSection ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showMutedSection && (
              <div className="divide-y divide-slate-800/60 rounded-2xl bg-slate-900/30 border border-slate-800/60 overflow-hidden opacity-75">
                {mutedContactGroups.map((group) => (
                  <div
                    key={group.authorId}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={group.authorName}
                        avatarColor={group.authorAvatarColor}
                        avatarUrl={group.authorAvatarUrl}
                        sizeClass="w-10 h-10"
                        textSizeClass="text-xs"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-300 truncate">
                          {group.authorName}
                        </div>
                        <div className="text-[11px] text-slate-500">Muted</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setMutedAuthorIds((prev) =>
                          prev.filter((id) => id !== group.authorId)
                        );
                        triggerToast(`Unmuted ${group.authorName}`);
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-emerald-300 font-medium"
                    >
                      Unmute
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Encryption Footer Note */}
        <div className="pt-4 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>Your status updates are end-to-end encrypted</span>
        </div>
      </div>

      {/* ====================================================================
          FLOATING ACTION BUTTONS (Bottom Right: Text Pencil + Pro Studio + Camera)
         ==================================================================== */}
      <div className="fixed bottom-20 md:bottom-6 right-5 z-30 flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => openCreator('text')}
          className="w-11 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Write Text Status"
          aria-label="Write text status"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setCreatorType('photo');
            setMediaUrl(SAMPLE_MEDIA_GALLERY[0].url);
            setShowProMediaStudio(true);
          }}
          className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Pro Photo & Video Status Studio"
          aria-label="Pro Status Studio"
        >
          <Wand2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => openCreator('photo')}
          className="w-14 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/20 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Add Photo or Video Status with Text"
          aria-label="Add photo or video status"
        >
          <Camera className="w-6 h-6" />
        </button>
      </div>

      {/* ====================================================================
          STATUS CREATOR STUDIO (Photo / Video + Text OR Colored Text Canvas)
         ==================================================================== */}
      {creatorOpen && (
        <div className="fixed inset-0 z-50 h-[100dvh] w-full max-w-[100vw] flex flex-col justify-between bg-black/95 text-white p-2.5 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          {/* Top Creator Toolbar */}
          <div className="max-w-xl mx-auto w-full flex flex-wrap items-center justify-between gap-2 z-20 shrink-0">
            <button
              onClick={() => setCreatorOpen(false)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              aria-label="Close status creator"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Mode Switcher: Photo / Video / Text */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/10 backdrop-blur-md overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'photo', label: 'Photo', icon: ImageIcon },
                  { id: 'video', label: 'Video', icon: Video },
                  { id: 'text', label: 'Text', icon: Type },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = creatorType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setCreatorType(m.id);
                      if (m.id === 'photo' && !mediaUrl.includes('unsplash') && !mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('data:')) {
                        setMediaUrl(SAMPLE_MEDIA_GALLERY[0].url);
                      } else if (m.id === 'video' && !mediaUrl.includes('.mp4') && !mediaUrl.startsWith('blob:')) {
                        setMediaUrl(SAMPLE_MEDIA_GALLERY[3].url);
                      }
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Style Controls: Pro Edit, Emoji, Font, Background Color */}
            <div className="flex items-center gap-1 shrink-0">
              {(creatorType === 'photo' || creatorType === 'video') && (
                <button
                  type="button"
                  onClick={() => setShowProMediaStudio(true)}
                  className="h-9 px-3 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-lg"
                  title="Open Pro Photo & Video Studio Editor"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Edit {creatorType === 'video' ? 'Video' : 'Photo'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCreatorEmoji((s) => !s)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Add emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const order: Array<'sans' | 'serif' | 'mono' | 'bold'> = [
                    'sans',
                    'bold',
                    'serif',
                    'mono',
                  ];
                  setFontStyle(order[(order.indexOf(fontStyle) + 1) % order.length]);
                }}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-xs"
                title="Change text font style"
              >
                T
              </button>
              <button
                type="button"
                onClick={() => setBgIndex((i) => (i + 1) % STATUS_BG_PALETTES.length)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Change background color"
              >
                <Palette className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Live Preview Canvas */}
          <div className="max-w-xl mx-auto w-full flex-1 min-h-0 flex flex-col justify-center my-2 gap-2">
            <div
              className="relative w-full flex-1 min-h-[240px] sm:min-h-[360px] rounded-3xl overflow-hidden border border-white/15 shadow-2xl flex flex-col items-center justify-center p-4 sm:p-6 text-center"
              style={{
                background:
                  STATUS_BG_PALETTES[bgIndex % STATUS_BG_PALETTES.length].css,
              }}
            >
              {/* Photo Preview */}
              {creatorType === 'photo' && mediaUrl && (
                <img
                  src={mediaUrl}
                  alt="Status preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Video Preview */}
              {creatorType === 'video' && mediaUrl && (
                <video
                  src={mediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Dark Vignette for Readability on Media */}
              {(creatorType === 'photo' || creatorType === 'video') && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />
              )}

              {/* Upload From Device Button + Pro Edit + Preset Switcher for Photo/Video */}
              {(creatorType === 'photo' || creatorType === 'video') && (
                <div className="relative z-10 w-full flex flex-wrap items-center justify-between gap-1.5 mb-auto">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5 backdrop-blur-md shadow-lg"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Media</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProMediaStudio(true)}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 shadow-lg"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Pro Edit (Crop, Draw, Trim, Blur)</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full bg-black/55 p-1 rounded-full border border-white/10 backdrop-blur-md">
                    {SAMPLE_MEDIA_GALLERY.filter((m) => m.type === creatorType).map(
                      (item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setMediaUrl(item.url);
                            if (!statusCaption) setStatusCaption(item.defaultCaption);
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
                            mediaUrl === item.url
                              ? 'bg-emerald-500 text-slate-950 font-bold'
                              : 'text-white/80 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Center Text Overlay / Main Status Text */}
              <div className="relative z-10 w-full my-auto">
                <textarea
                  rows={creatorType === 'text' ? 3 : 2}
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder={
                    creatorType === 'text'
                      ? 'Type a status…'
                      : 'Tap to add headline overlay on your photo/video (optional)…'
                  }
                  className={`w-full bg-transparent text-center text-white placeholder:text-white/60 focus:outline-none resize-none ${
                    creatorType === 'text' ? 'text-xl sm:text-3xl' : 'text-base sm:text-xl drop-shadow-lg bg-black/30 rounded-2xl p-2'
                  } ${fontClassMap[fontStyle]}`}
                />
              </div>
            </div>

            {/* Emoji Picker Drawer inside Creator */}
            {showCreatorEmoji && (
              <div className="rounded-2xl bg-slate-900 border border-slate-700 p-2.5 max-h-48 overflow-y-auto">
                <EmojiPickerPanel
                  compact
                  onSelectEmoji={(em) => {
                    if (creatorType === 'text') {
                      setStatusText((prev) => prev + em);
                    } else {
                      setStatusCaption((prev) => prev + em);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Bottom Caption Input + Extra Expiry/Audience Options + Send Button */}
          <div className="max-w-xl mx-auto w-full space-y-2 z-20 shrink-0">
            {(creatorType === 'photo' || creatorType === 'video') && (
              <div className="flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-full px-4 py-2">
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <input
                  type="text"
                  value={statusCaption}
                  onChange={(e) => setStatusCaption(e.target.value)}
                  placeholder="Add a caption below your photo/video…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Extra App Options: Expiry Timer & Audience Pill */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <select
                    value={expiryDuration}
                    onChange={(e) =>
                      setExpiryDuration(
                        e.target.value as '24h' | '6h' | '1h' | 'view_once'
                      )
                    }
                    className="bg-transparent text-white font-medium focus:outline-none"
                  >
                    <option value="24h" className="bg-slate-900">
                      Disappears: 24h
                    </option>
                    <option value="6h" className="bg-slate-900">
                      Disappears: 6h
                    </option>
                    <option value="1h" className="bg-slate-900">
                      Disappears: 1h
                    </option>
                    <option value="view_once" className="bg-slate-900">
                      View Once
                    </option>
                  </select>
                </div>

                <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 text-xs">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <select
                    value={privacy}
                    onChange={(e) =>
                      setPrivacy(e.target.value as StatusPost['privacy'])
                    }
                    className="bg-transparent text-white font-medium focus:outline-none"
                  >
                    <option value="all_contacts" className="bg-slate-900">
                      My Contacts
                    </option>
                    <option value="selected_contacts" className="bg-slate-900">
                      Close Friends
                    </option>
                    <option value="exclude_contacts" className="bg-slate-900">
                      Exclude Some
                    </option>
                    <option value="nobody" className="bg-slate-900">
                      Only Me
                    </option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePublishStatus}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25"
              >
                <Send className="w-4 h-4" />
                <span>Post Status</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          FULL-SCREEN STORY VIEWER MODAL (Photo, Video & Text + Reply)
         ==================================================================== */}
      {viewerGroup && (() => {
        const currentPost = viewerGroup.posts[viewerIndex] || viewerGroup.posts[0];
        if (!currentPost) return null;
        const isMyPost =
          currentPost.authorId === account.id ||
          currentPost.authorName.includes('(You)');

        return (
          <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-3 sm:p-5 select-none animate-in fade-in duration-150">
            {/* Segmented Story Progress Bars at Top */}
            <div className="max-w-xl mx-auto w-full space-y-3 z-20">
              <div className="flex items-center gap-1.5">
                {viewerGroup.posts.map((st, idx) => {
                  const fill =
                    idx < viewerIndex ? 100 : idx === viewerIndex ? viewerProgress : 0;
                  return (
                    <div
                      key={st.id}
                      className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
                    >
                      <div
                        className="h-full bg-emerald-400 transition-all duration-100"
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Author Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setViewerGroup(null)}
                    className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <UserAvatar
                    name={viewerGroup.authorName}
                    avatarColor={viewerGroup.authorAvatarColor}
                    avatarUrl={viewerGroup.authorAvatarUrl}
                    sizeClass="w-10 h-10"
                    textSizeClass="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {viewerGroup.authorName}
                    </div>
                    <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                      <span>{formatStatusRelativeTime(currentPost.createdAt)}</span>
                      {currentPost.expiryDuration === 'view_once' && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 text-[10px]">
                          View Once
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {currentPost.contentType === 'video' && (
                    <button
                      onClick={() => setIsVideoMuted((m) => !m)}
                      className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                      title={isVideoMuted ? 'Unmute video' : 'Mute video'}
                    >
                      {isVideoMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setIsViewerPaused((p) => !p)}
                    className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                    title={isViewerPaused ? 'Resume' : 'Pause'}
                  >
                    {isViewerPaused ? (
                      <Play className="w-4 h-4" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </button>
                  {isMyPost && (
                    <button
                      onClick={() => {
                        onDeleteStatus(currentPost.id);
                        setViewerGroup(null);
                        triggerToast('Status deleted');
                      }}
                      className="w-9 h-9 rounded-full bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 flex items-center justify-center"
                      title="Delete my status"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setViewerGroup(null)}
                    className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Center Story Stage (Tap Left for Previous, Tap Right for Next) */}
            <div
              className="relative max-w-xl mx-auto w-full flex-1 my-3 rounded-3xl overflow-hidden border border-white/15 flex flex-col items-center justify-center p-6 text-center shadow-2xl"
              style={{ background: currentPost.backgroundColor }}
              onMouseDown={() => setIsViewerPaused(true)}
              onMouseUp={() => setIsViewerPaused(false)}
              onTouchStart={() => setIsViewerPaused(true)}
              onTouchEnd={() => setIsViewerPaused(false)}
            >
              {/* Previous / Next Navigation Zones */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (viewerIndex > 0) {
                    setViewerIndex((i) => i - 1);
                    setViewerProgress(0);
                  }
                }}
                className="absolute inset-y-0 left-0 w-1/4 z-20 flex items-center justify-start pl-2 opacity-0 hover:opacity-100 transition-opacity"
                aria-label="Previous story"
              >
                {viewerIndex > 0 && (
                  <span className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">
                    <ChevronLeft className="w-5 h-5" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (viewerIndex < viewerGroup.posts.length - 1) {
                    const nextIdx = viewerIndex + 1;
                    setViewerIndex(nextIdx);
                    setViewerProgress(0);
                    onMarkStatusViewed(viewerGroup.posts[nextIdx].id);
                  } else {
                    setViewerGroup(null);
                  }
                }}
                className="absolute inset-y-0 right-0 w-1/4 z-20 flex items-center justify-end pr-2 opacity-0 hover:opacity-100 transition-opacity"
                aria-label="Next story"
              >
                <span className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">
                  <ChevronRight className="w-5 h-5" />
                </span>
              </button>

              {/* Photo Story */}
              {currentPost.contentType === 'photo' && currentPost.mediaUrl && (
                <img
                  src={currentPost.mediaUrl}
                  alt={currentPost.text}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Video Story */}
              {currentPost.contentType === 'video' && currentPost.mediaUrl && (
                <video
                  src={currentPost.mediaUrl}
                  autoPlay
                  loop
                  muted={isVideoMuted}
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {(currentPost.contentType === 'photo' ||
                currentPost.contentType === 'video') && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/85 pointer-events-none" />
              )}

              {/* Flying Reaction Animation */}
              {flyingEmoji && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                  <span className="text-7xl animate-bounce drop-shadow-2xl">
                    {flyingEmoji}
                  </span>
                </div>
              )}

              {/* Story Text Headline */}
              {currentPost.text && (
                <div
                  className={`relative z-10 max-w-md mx-auto text-white drop-shadow-lg ${
                    currentPost.contentType === 'text'
                      ? 'text-2xl sm:text-3xl leading-relaxed'
                      : 'mt-auto mb-2 text-lg sm:text-xl bg-black/45 px-4 py-2 rounded-2xl backdrop-blur-xs'
                  } ${fontClassMap[currentPost.fontStyle || 'sans']}`}
                >
                  {currentPost.text}
                </div>
              )}

              {/* Bottom Caption Bar on Photo/Video */}
              {currentPost.caption && (
                <div className="relative z-10 max-w-md mx-auto mt-2 px-4 py-2 rounded-2xl bg-black/65 text-sm text-white/95 backdrop-blur-md">
                  {currentPost.caption}
                </div>
              )}
            </div>

            {/* Bottom Reply & Quick Emoji Reactions Bar */}
            <div className="max-w-xl mx-auto w-full space-y-2.5 z-20">
              {isMyPost ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200">
                  <span className="flex items-center gap-2 font-semibold text-emerald-400">
                    <Eye className="w-4 h-4" />
                    Viewed by {currentPost.viewsCount || 1} contact(s)
                  </span>
                  {currentPost.reactions && currentPost.reactions.length > 0 && (
                    <span className="text-base">
                      {currentPost.reactions.join(' ')}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {/* 8 Instant Emoji Reactions */}
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
                    {QUICK_STATUS_REACTIONS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          setFlyingEmoji(em);
                          onReactToStatus(currentPost.id, em);
                          setTimeout(() => setFlyingEmoji(null), 1100);
                        }}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 hover:scale-125 transition-transform flex items-center justify-center text-xl shrink-0"
                      >
                        {em}
                      </button>
                    ))}
                  </div>

                  {/* Direct Reply Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyInput}
                      onFocus={() => setIsViewerPaused(true)}
                      onBlur={() => setIsViewerPaused(false)}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && replyInput.trim()) {
                          onReplyToStatusInChat(currentPost, replyInput.trim());
                          setReplyInput('');
                          setViewerGroup(null);
                        }
                      }}
                      placeholder={`Reply to ${viewerGroup.authorName}…`}
                      className="flex-1 rounded-full bg-white/10 border border-white/20 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!replyInput.trim()) return;
                        onReplyToStatusInChat(currentPost, replyInput.trim());
                        setReplyInput('');
                        setViewerGroup(null);
                      }}
                      className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ====================================================================
          VIEWPORT-SAFE MULTI-SELECT STATUS ACTIONS SHEET (Never Cut Off)
         ==================================================================== */}
      {showSelectionMoreMenu && (
        <div
          onClick={() => setShowSelectionMoreMenu(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-4 space-y-2 text-xs text-white shadow-2xl max-h-[85dvh] overflow-y-auto my-auto"
          >
            <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1 sm:hidden" />
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="font-bold text-sm text-emerald-400">
                Status Actions ({selectedStatusIds.length} selected)
              </span>
              <button
                onClick={() => setShowSelectionMoreMenu(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                handleSelectAllStatuses();
                setShowSelectionMoreMenu(false);
              }}
              className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200 font-medium"
            >
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {selectedStatusIds.length === statuses.length
                  ? 'Deselect All Updates'
                  : `Select All Updates (${statuses.length})`}
              </span>
            </button>

            {selectedStatusIds.length > 0 && (
              <>
                <button
                  onClick={() => {
                    handleBatchMarkViewed();
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200 font-medium"
                >
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Mark Selected as Viewed ({selectedStatusIds.length})</span>
                </button>

                <button
                  onClick={() => {
                    selectedStatusIds.forEach((id) => onReactToStatus(id, '❤️'));
                    triggerToast(`Sent ❤️ to ${selectedStatusIds.length} status update(s)`);
                    setSelectedStatusIds([]);
                    setIsMultiSelectMode(false);
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200 font-medium"
                >
                  <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Send ❤️ Reaction ({selectedStatusIds.length})</span>
                </button>

                <button
                  onClick={() => {
                    handleBatchCopyStatuses();
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200 font-medium"
                >
                  <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Copy Status Text ({selectedStatusIds.length})</span>
                </button>

                <button
                  onClick={async () => {
                    const selectedPosts = statuses.filter((s) =>
                      selectedStatusIds.includes(s.id)
                    );
                    const text = selectedPosts
                      .map((s) => `${s.authorName}: ${s.text}`)
                      .join('\n');
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: 'Status Updates', text });
                      } catch {
                        navigator.clipboard.writeText(text);
                        triggerToast('Copied status updates for sharing!');
                      }
                    } else {
                      navigator.clipboard.writeText(text);
                      triggerToast('Copied status updates for sharing!');
                    }
                    setSelectedStatusIds([]);
                    setIsMultiSelectMode(false);
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200 font-medium"
                >
                  <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Share Selected ({selectedStatusIds.length})</span>
                </button>

                <button
                  onClick={() => {
                    handleBatchMuteAuthors();
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 text-left text-amber-300 font-medium"
                >
                  <VolumeX className="w-4 h-4 shrink-0" />
                  <span>Mute Contacts' Updates</span>
                </button>

                <button
                  onClick={() => {
                    handleBatchDeleteStatuses();
                    setShowSelectionMoreMenu(false);
                  }}
                  className="w-full p-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 flex items-center gap-2.5 text-left text-rose-300 font-semibold"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete Selected ({selectedStatusIds.length})</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          3-DOTS / LONG-PRESS OPTIONS MODAL FOR ANY STATUS (Viewport-Safe)
         ==================================================================== */}
      {activeOptionsPost && (
        <div
          onClick={() => setActiveOptionsPost(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-4 space-y-2 text-xs text-white shadow-2xl max-h-[85dvh] overflow-y-auto my-auto"
          >
            <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1 sm:hidden" />
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">
                  {activeOptionsPost.authorName}
                </div>
                <div className="text-slate-400 truncate">
                  {activeOptionsPost.text}
                </div>
              </div>
              <button
                onClick={() => setActiveOptionsPost(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                const targetGroup =
                  allContactGroups.find(
                    (g) => g.authorId === activeOptionsPost.authorId
                  ) || myGroup;
                setActiveOptionsPost(null);
                openStoryViewer(targetGroup, 0);
              }}
              className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 font-medium"
            >
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>View Status</span>
            </button>

            <button
              onClick={() => {
                setIsMultiSelectMode(true);
                toggleSelectStatus(activeOptionsPost.id);
                setActiveOptionsPost(null);
              }}
              className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 font-medium"
            >
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              <span>Select Multiple Statuses</span>
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${activeOptionsPost.text}${
                    activeOptionsPost.caption ? ` — ${activeOptionsPost.caption}` : ''
                  }`
                );
                triggerToast('Status text copied');
                setActiveOptionsPost(null);
              }}
              className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 font-medium"
            >
              <Copy className="w-4 h-4 text-cyan-400" />
              <span>Copy Text</span>
            </button>

            {activeOptionsPost.authorId !== account.id && (
              <>
                <button
                  onClick={() => {
                    onReplyToStatusInChat(activeOptionsPost, 'Loved your status! 🔥');
                    setActiveOptionsPost(null);
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 font-medium"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Message {activeOptionsPost.authorName}</span>
                </button>

                <button
                  onClick={() => {
                    const aid = activeOptionsPost.authorId;
                    setMutedAuthorIds((prev) =>
                      prev.includes(aid)
                        ? prev.filter((x) => x !== aid)
                        : [...prev, aid]
                    );
                    triggerToast(
                      mutedAuthorIds.includes(aid)
                        ? `Unmuted ${activeOptionsPost.authorName}`
                        : `Muted ${activeOptionsPost.authorName}'s status updates`
                    );
                    setActiveOptionsPost(null);
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 flex items-center gap-2.5 font-medium text-amber-300"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>
                    {mutedAuthorIds.includes(activeOptionsPost.authorId)
                      ? 'Unmute Contact Status'
                      : 'Mute Contact Status'}
                  </span>
                </button>
              </>
            )}

            {(activeOptionsPost.authorId === account.id ||
              activeOptionsPost.authorName.includes('(You)')) && (
              <button
                onClick={() => {
                  onDeleteStatus(activeOptionsPost.id);
                  setActiveOptionsPost(null);
                  triggerToast('Status deleted');
                }}
                className="w-full p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center gap-2.5 font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Status</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pro Media Studio for Photo & Video Status Creation */}
      <MediaEditorModal
        isOpen={showProMediaStudio}
        initialMediaType={creatorType === 'video' ? 'video' : 'photo'}
        initialMediaUrl={mediaUrl}
        initialCaption={statusCaption || statusText}
        mode="status"
        onClose={() => setShowProMediaStudio(false)}
        onApply={(res) => {
          setCreatorType(res.mediaType);
          setMediaUrl(res.url);
          if (res.caption) {
            setStatusCaption(res.caption);
            if (!statusText) setStatusText(res.caption);
          }
          if (res.viewOnce) {
            setExpiryDuration('view_once');
          }
          if (creatorOpen) {
            triggerToast('Applied Pro Studio edits to your Status preview ✨');
          } else {
            const newPost: StatusPost = {
              id: `st_${Date.now()}`,
              authorId: account.id,
              authorName: `${account.name} (You)`,
              authorUsername: account.username,
              authorAvatarColor: account.avatarColor,
              authorAvatarUrl: account.avatarUrl,
              contentType: res.mediaType,
              text: res.caption || (res.mediaType === 'video' ? 'Video Status' : 'Photo Status'),
              caption: res.caption || undefined,
              mediaUrl: res.url,
              fontStyle,
              backgroundColor: STATUS_BG_PALETTES[bgIndex % STATUS_BG_PALETTES.length].css,
              privacy,
              expiryDuration: res.viewOnce ? 'view_once' : expiryDuration,
              createdAt: Date.now(),
              expiresAt: Date.now() + 24 * 3600 * 1000,
              viewedByMe: true,
              viewsCount: 1,
              reactions: [],
              likedByMe: false,
            };
            onAddStatus(newPost);
            triggerToast('Posted edited Status update ✨');
          }
        }}
      />
    </div>
  );
};
