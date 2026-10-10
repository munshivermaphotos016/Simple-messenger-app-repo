import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Eye,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  RotateCw,
  Shield,
  Sliders,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react';
import { AudienceVisibility } from '../types/simple';
import {
  CARTOON_3D_AVATARS,
  CARTOON_3D_STICKERS,
  ensure3DCartoonAvatarUrl,
} from '../utils/cartoonAvatars';
import { MediaEditorModal } from './MediaEditorModal';

export interface PresetProfilePhoto {
  id: string;
  label: string;
  subtitle?: string;
  category: '3D Characters' | '3D Mascots' | '3D Cyber & Sci-Fi' | '3D VIP & Fun';
  url: string;
}

export const PRESET_PROFILE_PHOTOS: PresetProfilePhoto[] = CARTOON_3D_AVATARS.map((item) => ({
  id: item.id,
  label: item.label,
  subtitle: item.subtitle,
  category: item.category,
  url: item.url,
}));

export const AVATAR_COLOR_PALETTE = [
  '#10B981',
  '#06B6D4',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#F43F5E',
];

export const EMOJI_AVATAR_BG_GRADIENTS = [
  { id: 'emerald', label: 'Emerald Glow', c1: '#059669', c2: '#022C22' },
  { id: 'cyan', label: 'Oceanic Cyan', c1: '#0891B2', c2: '#0F172A' },
  { id: 'indigo', label: 'Cosmic Indigo', c1: '#4F46E5', c2: '#1E1B4B' },
  { id: 'rose', label: 'Sunset Rose', c1: '#E11D48', c2: '#4C0519' },
  { id: 'amber', label: 'Solar Gold', c1: '#D97706', c2: '#451A03' },
  { id: 'violet', label: 'Neon Violet', c1: '#9333EA', c2: '#2E1065' },
];

export const POPULAR_AVATAR_EMOJIS = [
  '😎',
  '🚀',
  '🛡️',
  '🦊',
  '🐱',
  '⚡',
  '🌟',
  '🎧',
  '☕',
  '🔥',
  '👑',
  '🏔️',
  '🌊',
  '🎨',
  '🤖',
  '💎',
];

export function generateEmojiAvatarDataUrl(
  emojiOrText: string,
  color1: string,
  color2: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, 400, 400);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // Subtle decorative ring
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(200, 200, 170, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '180px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emojiOrText || '😎', 200, 212);

  return canvas.toDataURL('image/png');
}

export async function renderCroppedProfilePhoto(
  imageSrc: string,
  zoom: number,
  panX: number,
  panY: number,
  rotationDeg: number,
  filter: 'none' | 'vivid' | 'warm' | 'bw' | 'cool'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 440;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSrc);
        return;
      }

      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, size, size);

      if (filter === 'vivid') {
        ctx.filter = 'saturate(1.35) contrast(1.1)';
      } else if (filter === 'warm') {
        ctx.filter = 'sepia(0.25) saturate(1.25) brightness(1.03)';
      } else if (filter === 'bw') {
        ctx.filter = 'grayscale(1) contrast(1.15)';
      } else if (filter === 'cool') {
        ctx.filter = 'hue-rotate(12deg) saturate(1.15)';
      } else {
        ctx.filter = 'none';
      }

      ctx.save();
      ctx.translate(size / 2 + (panX * size) / 200, size / 2 + (panY * size) / 200);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const minDim = Math.min(img.width, img.height);
      const scaleToCover = size / minDim;
      const drawW = img.width * scaleToCover;
      const drawH = img.height * scaleToCover;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      try {
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch {
        resolve(imageSrc);
      }
    };
    img.onerror = (err) => reject(err);
    img.src = imageSrc;
  });
}

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  sizeClass?: string;
  textClass?: string;
  textSizeClass?: string;
  isGroup?: boolean;
  hidePhotoForPrivacy?: boolean;
  showCameraBadge?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  avatarColor = '#10B981',
  sizeClass = 'w-11 h-11',
  textClass,
  textSizeClass,
  isGroup = false,
  hidePhotoForPrivacy = false,
  showCameraBadge = false,
  onClick,
  title,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const resolvedTextClass = textClass || textSizeClass || 'text-xs';
  const effectiveAvatarUrl = avatarUrl ? ensure3DCartoonAvatarUrl(avatarUrl, name) : undefined;

  useEffect(() => {
    setImgError(false);
  }, [effectiveAvatarUrl]);

  const showImage = Boolean(effectiveAvatarUrl && !imgError && !hidePhotoForPrivacy);
  const initials = (name || 'U')
    .replace(/\(You\)/gi, '')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onClick={onClick}
      title={title}
      className={`relative rounded-full shrink-0 select-none ${sizeClass} ${
        onClick ? 'cursor-pointer group' : ''
      } ${className}`}
    >
      {showImage ? (
        <img
          src={effectiveAvatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover border border-white/10 group-hover:ring-2 group-hover:ring-emerald-400/70 transition-all"
        />
      ) : hidePhotoForPrivacy ? (
        <div
          className="w-full h-full rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:ring-2 group-hover:ring-emerald-400/70 transition-all"
          title="Profile photo hidden by privacy settings"
        >
          {isGroup ? <Users className="w-1/2 h-1/2" /> : <User className="w-1/2 h-1/2" />}
        </div>
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center font-bold text-slate-950 border border-white/10 group-hover:ring-2 group-hover:ring-emerald-400/70 transition-all ${resolvedTextClass}`}
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
      )}

      {showCameraBadge && (
        <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-emerald-500 text-slate-950 border-2 border-slate-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <Camera className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
};

interface InlineProfilePhotoEditorProps {
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  profilePhotoVisibility?: AudienceVisibility;
  onChangeAvatarUrl: (newUrl: string | undefined) => void;
  onChangeAvatarColor: (newColor: string) => void;
  onChangeVisibility?: (vis: AudienceVisibility) => void;
  compact?: boolean;
}

export const InlineProfilePhotoEditor: React.FC<InlineProfilePhotoEditorProps> = ({
  name,
  avatarUrl,
  avatarColor,
  profilePhotoVisibility = 'contacts',
  onChangeAvatarUrl,
  onChangeAvatarColor,
  onChangeVisibility,
  compact = false,
}) => {
  const [activeTab, setActiveTab] = useState<'none' | 'crop' | 'camera' | 'presets' | 'emoji' | 'view'>(
    'presets'
  );
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<
    'All' | '3D Characters' | '3D Mascots' | '3D Cyber & Sci-Fi' | '3D VIP & Fun' | '3D Stickers'
  >('All');
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState<'none' | 'vivid' | 'warm' | 'bw' | 'cool'>('none');
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [showProStudio, setShowProStudio] = useState(false);

  // Emoji Studio state
  const [selectedEmoji, setSelectedEmoji] = useState('😎');
  const [selectedGradIdx, setSelectedGradIdx] = useState(0);

  // Live Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrorCamera, setMirrorCamera] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const startLiveCamera = async () => {
    setCameraError(null);
    setActiveTab('camera');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError(
        'Camera access is unavailable in this browser frame. You can still upload a photo from your device or choose an avatar below.'
      );
    }
  };

  const handleCaptureCameraFrame = () => {
    if (!videoRef.current) return;
    const vid = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = Math.min(vid.videoWidth || 480, vid.videoHeight || 480);
    canvas.width = 440;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (mirrorCamera) {
        ctx.translate(440, 0);
        ctx.scale(-1, 1);
      }
      const sx = ((vid.videoWidth || size) - size) / 2;
      const sy = ((vid.videoHeight || size) - size) / 2;
      ctx.drawImage(vid, sx, sy, size, size, 0, 0, 440, 440);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      stopCameraStream();
      setRawImageSrc(dataUrl);
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setRotation(0);
      setFilter('none');
      setActiveTab('crop');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      setRawImageSrc(res);
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setRotation(0);
      setFilter('none');
      setActiveTab('crop');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveCroppedPhoto = async () => {
    if (!rawImageSrc) return;
    setIsApplyingCrop(true);
    try {
      const processedUrl = await renderCroppedProfilePhoto(
        rawImageSrc,
        zoom,
        panX,
        panY,
        rotation,
        filter
      );
      onChangeAvatarUrl(processedUrl);
      setActiveTab('none');
      setRawImageSrc(null);
      showNotice('Profile photo updated!');
    } catch {
      onChangeAvatarUrl(rawImageSrc);
      setActiveTab('none');
      setRawImageSrc(null);
      showNotice('Profile photo saved!');
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const handleApplyEmojiAvatar = () => {
    const grad = EMOJI_AVATAR_BG_GRADIENTS[selectedGradIdx] || EMOJI_AVATAR_BG_GRADIENTS[0];
    const url = generateEmojiAvatarDataUrl(selectedEmoji, grad.c1, grad.c2);
    if (url) {
      onChangeAvatarUrl(url);
      setActiveTab('none');
      showNotice(`Created ${selectedEmoji} Emoji Profile Photo!`);
    }
  };

  const handleDownloadCurrentPhoto = () => {
    if (!avatarUrl) return;
    const a = document.createElement('a');
    a.href = avatarUrl;
    a.download = `Profile_Photo_${(name || 'User').replace(/\s+/g, '_')}.jpg`;
    a.click();
    showNotice('Profile photo downloaded to device!');
  };

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top Row: Circular Avatar + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar
            name={name}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
            sizeClass={compact ? 'w-20 h-20' : 'w-24 h-24'}
            textClass={compact ? 'text-xl' : 'text-2xl'}
            showCameraBadge
            onClick={() => {
              if (avatarUrl) {
                setActiveTab(activeTab === 'view' ? 'none' : 'view');
              } else {
                fileInputRef.current?.click();
              }
            }}
            title={avatarUrl ? 'Tap to view or change profile photo' : 'Tap to upload profile photo'}
          />

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white">Profile Photo Studio</h4>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  avatarUrl
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {avatarUrl ? 'Custom Photo Active' : 'Initials Badge'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload a photo from your gallery, capture a camera selfie, edit in Pro Studio, or pick an avatar.
            </p>
            {feedbackMsg && (
              <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1 pt-0.5">
                <Check className="w-3.5 h-3.5" />
                <span>{feedbackMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Gallery</span>
          </button>

          <button
            type="button"
            onClick={() => setShowProStudio(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Open Pro Photo Studio with filters, color grading, drawing, text & frames"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Pro Studio ✨</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'camera') {
                stopCameraStream();
                setActiveTab('none');
              } else {
                startLiveCamera();
              }
            }}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'camera'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span>Camera</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'presets' ? 'none' : 'presets')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'presets'
                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Avatars</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'emoji' ? 'none' : 'emoji')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'emoji'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            <Smile className="w-3.5 h-3.5 text-amber-400" />
            <span>Emoji</span>
          </button>

          {avatarUrl && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRawImageSrc(avatarUrl);
                  setZoom(1);
                  setPanX(0);
                  setPanY(0);
                  setRotation(0);
                  setFilter('none');
                  setActiveTab('crop');
                }}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1"
                title="Crop, zoom, rotate or filter current photo"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Crop / Edit</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'view' ? 'none' : 'view')}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-1"
                title="View full profile photo"
              >
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeAvatarUrl(undefined);
                  setActiveTab('none');
                  showNotice('Profile photo removed');
                }}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 flex items-center gap-1"
                title="Remove profile photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expandable Panel 1: Interactive Crop, Zoom, Rotate & Filter Studio */}
      {activeTab === 'crop' && rawImageSrc && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <Sliders className="w-4 h-4" />
              <span>Adjust, Crop & Filter Profile Photo</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('none');
                setRawImageSrc(null);
              }}
              className="text-slate-400 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* Circular Crop Preview */}
            <div className="relative w-36 h-36 rounded-full overflow-hidden border-2 border-emerald-400 shadow-xl bg-slate-900 shrink-0">
              <img
                src={rawImageSrc}
                alt="Crop preview"
                className="w-full h-full object-cover transition-transform duration-75"
                style={{
                  transform: `translate(${panX}%, ${panY}%) rotate(${rotation}deg) scale(${zoom})`,
                  filter:
                    filter === 'vivid'
                      ? 'saturate(1.35) contrast(1.1)'
                      : filter === 'warm'
                      ? 'sepia(0.25) saturate(1.25) brightness(1.03)'
                      : filter === 'bw'
                      ? 'grayscale(1) contrast(1.15)'
                      : filter === 'cool'
                      ? 'hue-rotate(12deg) saturate(1.15)'
                      : 'none',
                }}
              />
            </div>

            {/* Sliders & Controls */}
            <div className="flex-1 w-full space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <ZoomIn className="w-3.5 h-3.5 text-emerald-400" /> Zoom
                  </span>
                  <span className="font-mono text-emerald-300">{zoom.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Horizontal Pan</span>
                    <span className="font-mono">{panX}%</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={2}
                    value={panX}
                    onChange={(e) => setPanX(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Vertical Pan</span>
                    <span className="font-mono">{panY}%</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={2}
                    value={panY}
                    onChange={(e) => setPanY(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'none', label: 'Original' },
                      { id: 'vivid', label: 'Vivid' },
                      { id: 'warm', label: 'Warm' },
                      { id: 'cool', label: 'Cool' },
                      { id: 'bw', label: 'B&W' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                        filter === f.id
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1 text-[11px]"
                >
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Rotate 90°</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPanX(0);
                setPanY(0);
                setRotation(0);
                setFilter('none');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-slate-300"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveCroppedPhoto}
              disabled={isApplyingCrop}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isApplyingCrop ? 'Saving…' : 'Set as Profile Photo'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Expandable Panel 2: Live Camera Selfie Capture */}
      {activeTab === 'camera' && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Camera className="w-4 h-4" />
              <span>Take Profile Photo with Camera</span>
            </span>
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                setActiveTab('none');
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          {cameraError ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
              <p>{cameraError}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
              >
                Choose Photo from Device Instead
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-48 h-48 rounded-full overflow-hidden border-2 border-cyan-400 bg-black relative shadow-xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${mirrorCamera ? 'scale-x-[-1]' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMirrorCamera((m) => !m)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Flip Mirror</span>
                </button>
                <button
                  type="button"
                  onClick={handleCaptureCameraFrame}
                  className="px-4 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture Photo</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable Panel 3: Curated 3D Cartoon Avatars & 3D Stickers */}
      {activeTab === 'presets' && (
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-indigo-500/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Choose 3D Cartoon Avatar or 3D Sticker</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('none')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Done
            </button>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {(
              [
                'All',
                '3D Characters',
                '3D Mascots',
                '3D Cyber & Sci-Fi',
                '3D VIP & Fun',
                '3D Stickers',
              ] as const
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setPresetCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  presetCategoryFilter === cat
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {presetCategoryFilter === '3D Stickers' ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {CARTOON_3D_STICKERS.map((stk) => {
                const selected = avatarUrl === stk.url;
                return (
                  <button
                    key={stk.id}
                    type="button"
                    onClick={() => {
                      onChangeAvatarUrl(stk.url);
                      showNotice(`Selected 3D Sticker "${stk.title}"`);
                    }}
                    className={`group flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <img
                      src={stk.url}
                      alt={stk.title}
                      className="w-14 h-14 rounded-full object-contain group-hover:scale-105 transition-transform"
                    />
                    <span className="text-[10px] font-bold text-slate-200 truncate w-full text-center">
                      {stk.title}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {PRESET_PROFILE_PHOTOS.filter(
                (p) => presetCategoryFilter === 'All' || p.category === presetCategoryFilter
              ).map((preset) => {
                const selected = avatarUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onChangeAvatarUrl(preset.url);
                      showNotice(`Selected "${preset.label}"`);
                    }}
                    className={`group flex flex-col items-center gap-1 p-2 rounded-2xl border transition-all ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                    title={`${preset.label} — ${preset.subtitle || preset.category}`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      className="w-14 h-14 rounded-full object-cover shadow-md group-hover:scale-105 transition-transform"
                    />
                    <span className="text-[10px] font-bold text-slate-200 truncate w-full text-center">
                      {preset.label.split('·')[0].trim()}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate w-full text-center">
                      {preset.category.replace('3D ', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expandable Panel 4: Expressive Emoji & Sticker Avatar Creator */}
      {activeTab === 'emoji' && (
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Smile className="w-4 h-4" />
              <span>Create Emoji & Sticker Profile Photo</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('none')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg border-2 border-white/20 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${EMOJI_AVATAR_BG_GRADIENTS[selectedGradIdx].c1}, ${EMOJI_AVATAR_BG_GRADIENTS[selectedGradIdx].c2})`,
              }}
            >
              {selectedEmoji}
            </div>

            <div className="flex-1 space-y-2.5 w-full">
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setSelectedEmoji(em)}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center border ${
                      selectedEmoji === em
                        ? 'bg-amber-500/25 border-amber-400 scale-110'
                        : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {EMOJI_AVATAR_BG_GRADIENTS.map((g, idx) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGradIdx(idx)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        selectedGradIdx === idx ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ background: `linear-gradient(135deg, ${g.c1}, ${g.c2})` }}
                      title={g.label}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleApplyEmojiAvatar}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Use Emoji Avatar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expandable Panel 5: Full-Size Profile Photo Lightbox Preview */}
      {activeTab === 'view' && avatarUrl && (
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center space-y-3">
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">{name} · Profile Photo</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCurrentPhoto}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-emerald-300 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('none')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <img
            src={avatarUrl}
            alt={name}
            className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl object-cover border border-slate-800 shadow-2xl"
          />
        </div>
      )}

      {/* Bottom Row: Fallback Badge Color Swatches + Profile Photo Privacy */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Fallback Badge Color:</span>
          <div className="flex items-center gap-1.5">
            {AVATAR_COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChangeAvatarColor(c)}
                className={`w-5 h-5 rounded-full border transition-transform ${
                  avatarColor === c ? 'border-white scale-115' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        {onChangeVisibility && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Who can see my photo:</span>
            </span>
            <select
              value={profilePhotoVisibility}
              onChange={(e) => onChangeVisibility(e.target.value as AudienceVisibility)}
              className="rounded-xl bg-slate-950 border border-slate-800 px-2.5 py-1 text-xs text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
            >
              <option value="everyone">Everyone</option>
              <option value="contacts">My Contacts</option>
              <option value="contacts_except">My Contacts Except…</option>
              <option value="nobody">Nobody (Hidden)</option>
            </select>
          </div>
        )}
      </div>

      {/* Pro Media Editor Studio Modal for Profile Photos */}
      <MediaEditorModal
        isOpen={showProStudio}
        initialMediaType="photo"
        initialMediaUrl={rawImageSrc || avatarUrl || PRESET_PROFILE_PHOTOS[0].url}
        mode="profile"
        onClose={() => setShowProStudio(false)}
        onApply={(res) => {
          onChangeAvatarUrl(res.url);
          setActiveTab('none');
          setRawImageSrc(null);
          showNotice('Profile photo updated with Pro Studio ✨');
        }}
      />
    </div>
  );
};

interface ProfilePhotoLightboxModalProps {
  name: string;
  subtitle?: string;
  username?: string;
  about?: string;
  avatarUrl?: string;
  avatarColor: string;
  isOwnProfile?: boolean;
  canEditPhoto?: boolean;
  editable?: boolean;
  profilePhotoVisibility?: AudienceVisibility;
  privacyValue?: AudienceVisibility;
  onUpdateAvatarUrl?: (newUrl: string | undefined) => void;
  onUpdateAvatarColor?: (newColor: string) => void;
  onUpdateVisibility?: (vis: AudienceVisibility) => void;
  onChangePrivacy?: (vis: AudienceVisibility) => void;
  onUpdatePhoto?: (newUrl: string | undefined, newColor?: string) => void;
  onClose: () => void;
}

export const ProfilePhotoLightboxModal: React.FC<ProfilePhotoLightboxModalProps> = ({
  name,
  subtitle,
  username,
  about,
  avatarUrl,
  avatarColor,
  isOwnProfile = false,
  canEditPhoto = false,
  editable = false,
  profilePhotoVisibility,
  privacyValue,
  onUpdateAvatarUrl,
  onUpdateAvatarColor,
  onUpdateVisibility,
  onChangePrivacy,
  onUpdatePhoto,
  onClose,
}) => {
  const allowEdit = Boolean(canEditPhoto || editable);
  const resolvedVisibility: AudienceVisibility =
    profilePhotoVisibility || privacyValue || 'contacts';
  const [isEditing, setIsEditing] = useState(!avatarUrl && allowEdit);
  const [circleCropPreview, setCircleCropPreview] = useState(false);
  const [showProStudioModal, setShowProStudioModal] = useState(false);

  const handleSetUrl = (newUrl: string | undefined) => {
    if (onUpdateAvatarUrl) onUpdateAvatarUrl(newUrl);
    if (onUpdatePhoto) onUpdatePhoto(newUrl, avatarColor);
  };

  const handleSetColor = (newColor: string) => {
    if (onUpdateAvatarColor) onUpdateAvatarColor(newColor);
    if (onUpdatePhoto) onUpdatePhoto(avatarUrl, newColor);
  };

  const handleSetVisibility = (vis: AudienceVisibility) => {
    if (onUpdateVisibility) onUpdateVisibility(vis);
    if (onChangePrivacy) onChangePrivacy(vis);
  };

  const handleDownload = () => {
    if (!avatarUrl) return;
    const a = document.createElement('a');
    a.href = avatarUrl;
    a.download = `${(name || 'Profile').replace(/\s+/g, '_')}_Photo.jpg`;
    a.click();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-5 text-slate-100 shadow-2xl space-y-4 my-auto"
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              name={name}
              avatarUrl={avatarUrl}
              avatarColor={avatarColor}
              sizeClass="w-10 h-10"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">
                {name} {isOwnProfile ? '(You)' : ''}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {subtitle || (username ? `@${username}` : about || 'Profile Photo')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {avatarUrl && !isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => setCircleCropPreview((c) => !c)}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                  title="Toggle Circular / Square Frame"
                >
                  {circleCropPreview ? 'Square' : 'Circle'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-emerald-300 flex items-center gap-1"
                  title="Save profile photo"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </>
            )}
            {allowEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setShowProStudioModal(true)}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1"
                  title="Open Pro Photo Studio"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Pro Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing((e) => !e)}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'View Photo' : 'Edit Photo'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {isEditing && allowEdit ? (
          <InlineProfilePhotoEditor
            name={name}
            avatarUrl={avatarUrl}
            avatarColor={avatarColor}
            profilePhotoVisibility={
              isOwnProfile || onChangePrivacy || onUpdateVisibility
                ? resolvedVisibility
                : undefined
            }
            onChangeAvatarUrl={handleSetUrl}
            onChangeAvatarColor={handleSetColor}
            onChangeVisibility={
              isOwnProfile || onChangePrivacy || onUpdateVisibility
                ? handleSetVisibility
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col items-center py-3 space-y-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className={`w-64 h-64 sm:w-76 sm:h-76 object-cover border-2 border-slate-800 shadow-2xl transition-all ${
                  circleCropPreview ? 'rounded-full' : 'rounded-3xl'
                }`}
              />
            ) : (
              <div
                className="w-56 h-56 rounded-full flex items-center justify-center text-5xl font-bold text-slate-950 shadow-2xl"
                style={{ backgroundColor: avatarColor }}
              >
                {(name || 'U').slice(0, 2).toUpperCase()}
              </div>
            )}

            {about && (
              <p className="text-xs text-slate-300 text-center max-w-md px-4 italic">
                “{about}”
              </p>
            )}

            {(isOwnProfile || onChangePrivacy || onUpdateVisibility) && (
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Profile photo visibility:{' '}
                  <strong className="text-emerald-300 capitalize">
                    {resolvedVisibility.replace('_', ' ')}
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <MediaEditorModal
        isOpen={showProStudioModal}
        initialMediaType="photo"
        initialMediaUrl={avatarUrl || PRESET_PROFILE_PHOTOS[0].url}
        mode="profile"
        onClose={() => setShowProStudioModal(false)}
        onApply={(res) => {
          handleSetUrl(res.url);
          setShowProStudioModal(false);
          setIsEditing(false);
        }}
      />
    </div>
  );
};
