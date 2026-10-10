import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Check,
  Circle,
  Contrast,
  Crop,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Frame,
  Gauge,
  Image as ImageIcon,
  Layers,
  Lock,
  Maximize2,
  Move,
  Palette,
  Pause,
  PenTool,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Send,
  ShieldAlert,
  Sliders,
  Smile,
  Sparkles,
  Square,
  Stamp,
  Sun,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';

import {
  AVATAR_3D_BY_ID,
  CARTOON_3D_AVATARS,
  CARTOON_3D_STICKERS,
  STYLED_3D_SCENES,
} from '../utils/cartoonAvatars';

export type MediaEditorMode = 'chat' | 'profile' | 'status';

export interface EditedMediaResult {
  mediaType: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  caption: string;
  quality: 'compress' | 'hd' | 'original';
  viewOnce: boolean;
  durationSec?: number;
  videoMeta?: {
    trimStart: number;
    trimEnd: number;
    originalDuration?: number;
    playbackRate: number;
    muted: boolean;
    volume: number;
    filterCss: string;
    rotation: number;
    flipH: boolean;
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
      bgStyle: 'solid' | 'glass' | 'outline' | 'none';
    }>;
  };
}

interface MediaEditorModalProps {
  isOpen: boolean;
  initialMediaType: 'photo' | 'video';
  initialMediaUrl?: string;
  initialCaption?: string;
  initialTrimStart?: number;
  initialTrimEnd?: number;
  mode: MediaEditorMode;
  recipientName?: string;
  onClose: () => void;
  onApply: (result: EditedMediaResult) => void;
}

type ToolTab =
  | 'crop'
  | 'adjust'
  | 'filters'
  | 'draw'
  | 'privacy'
  | 'text'
  | 'stickers'
  | 'frame'
  | 'video';

type DrawStrokeMode = 'pen' | 'neon' | 'highlighter' | 'arrow' | 'rect' | 'circle';
type PrivacyRedactMode = 'pixelate' | 'blur' | 'blackout';

interface DrawAction {
  id: string;
  kind: 'stroke' | 'redact';
  strokeMode?: DrawStrokeMode;
  redactMode?: PrivacyRedactMode;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>; // normalized 0..1 coordinates
}

interface OverlayItem {
  id: string;
  kind: 'text' | 'sticker' | 'stamp';
  text: string;
  stickerUrl?: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  scale: number;
  rotation: number;
  flipH?: boolean;
  color: string;
  bgStyle: 'solid' | 'glass' | 'outline' | 'none';
  fontFamily: 'sans' | 'serif' | 'mono' | 'display' | 'cursive';
}

export interface CinemaFilterPreset {
  id: string;
  label: string;
  css: string;
  badgeColor: string;
}

export const CINEMA_FILTERS: CinemaFilterPreset[] = [
  { id: 'none', label: 'Original', css: 'none', badgeColor: 'from-slate-600 to-slate-800' },
  {
    id: 'vivid',
    label: 'Vivid HD',
    css: 'saturate(1.4) contrast(1.12) brightness(1.03)',
    badgeColor: 'from-emerald-500 to-teal-700',
  },
  {
    id: 'warm_gold',
    label: 'Warm Gold',
    css: 'sepia(0.28) saturate(1.35) brightness(1.05) contrast(1.06)',
    badgeColor: 'from-amber-500 to-orange-700',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    css: 'hue-rotate(-22deg) saturate(1.65) contrast(1.2)',
    badgeColor: 'from-fuchsia-500 to-indigo-700',
  },
  {
    id: 'emerald_matrix',
    label: 'Emerald',
    css: 'hue-rotate(35deg) saturate(1.3) contrast(1.15)',
    badgeColor: 'from-emerald-400 to-cyan-800',
  },
  {
    id: 'noir',
    label: 'Noir B&W',
    css: 'grayscale(1) contrast(1.28) brightness(0.98)',
    badgeColor: 'from-neutral-400 to-neutral-900',
  },
  {
    id: 'vintage',
    label: 'Vintage 90s',
    css: 'sepia(0.45) contrast(0.95) brightness(1.06) saturate(0.9)',
    badgeColor: 'from-yellow-600 to-stone-800',
  },
  {
    id: 'cool_nordic',
    label: 'Nordic Ice',
    css: 'hue-rotate(14deg) saturate(0.92) contrast(1.1) brightness(1.04)',
    badgeColor: 'from-cyan-500 to-blue-800',
  },
  {
    id: 'dramatic',
    label: 'Dramatic',
    css: 'contrast(1.35) saturate(0.85) brightness(0.94)',
    badgeColor: 'from-rose-600 to-slate-900',
  },
  {
    id: 'pastel',
    label: 'Soft Pastel',
    css: 'brightness(1.1) saturate(0.82) contrast(0.92)',
    badgeColor: 'from-pink-400 to-violet-600',
  },
];

const BRUSH_COLORS = [
  '#10B981',
  '#FFFFFF',
  '#F43F5E',
  '#F59E0B',
  '#06B6D4',
  '#8B5CF6',
  '#EC4899',
  '#3B82F6',
  '#84CC16',
  '#0F172A',
];

const QUICK_STICKERS = [
  '🔥',
  '❤️',
  '😂',
  '🤣',
  '😎',
  '🥰',
  '😍',
  '🤩',
  '🥳',
  '🤯',
  '🫡',
  '😭',
  '👻',
  '🤖',
  '🦊',
  '🐼',
  '🐱',
  '🦁',
  '🦄',
  '🐶',
  '🚀',
  '✨',
  '🎉',
  '💯',
  '👑',
  '⚡',
  '🛡️',
  '🌟',
  '💎',
  '🎯',
  '🍕',
  '☕',
  '🎮',
  '🎧',
  '🎸',
  '🏆',
  '🌈',
  '🌸',
  '🍀',
  '👍',
  '👏',
  '🙌',
  '🤝',
  '🫶',
  '💪',
  '👀',
  '💋',
  '❤️‍🔥',
];

const FUN_PROPS_AND_BUBBLES = [
  { id: 'prop_shades', label: 'Cool Shades', text: '🕶️' },
  { id: 'prop_crown', label: 'Royal Crown', text: '👑' },
  { id: 'prop_halo', label: 'Angel Halo', text: '😇' },
  { id: 'prop_horns', label: 'Devil Vibe', text: '😈' },
  { id: 'prop_party', label: 'Party Hat', text: '🥳' },
  { id: 'prop_cowboy', label: 'Cowboy', text: '🤠' },
  { id: 'prop_headset', label: 'DJ Headset', text: '🎧' },
  { id: 'prop_boom', label: 'Comic BOOM', text: '💥 BOOM!' },
  { id: 'prop_omg', label: 'Speech OMG', text: '💬 OMG!!' },
  { id: 'prop_wow', label: 'Star WOW', text: '✨ WOW ✨' },
  { id: 'prop_lit', label: 'Fire Badge', text: '🔥 LIT 100%' },
  { id: 'prop_love', label: 'Heart Vibe', text: '💖 LOVE IT' },
];

const SMART_STAMPS = [
  { id: 'time', label: '🕒 Live Time', getText: () => `🕒 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` },
  { id: 'date', label: '📅 Today Date', getText: () => `📅 ${new Date().toLocaleDateString()}` },
  { id: 'e2ee', label: '🔒 Encrypted HD', getText: () => '🔒 ENCRYPTED HD' },
  { id: 'verified', label: '✅ Verified', getText: () => '✅ VERIFIED AUTHENTIC' },
  { id: 'confidential', label: '⚠️ Confidential', getText: () => '⚠️ CONFIDENTIAL' },
  { id: 'location', label: '📍 Location Tag', getText: () => '📍 Secure Studio' },
  { id: 'vip', label: '👑 VIP Pass', getText: () => '👑 VIP EXCLUSIVE' },
];

const SAMPLE_EDITOR_PHOTOS = [
  {
    label: 'Alpine Sunset 3D',
    url: STYLED_3D_SCENES.alpineSunset,
  },
  {
    label: 'Neon Horizon 3D',
    url: STYLED_3D_SCENES.neonHorizon,
  },
  {
    label: 'Cyber Lab 3D',
    url: STYLED_3D_SCENES.cyberLab,
  },
  {
    label: '3D Character Studio',
    url: AVATAR_3D_BY_ID.alex_3d,
  },
];

const SAMPLE_EDITOR_VIDEOS = [
  {
    label: 'Ocean Waves HD',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
  },
  {
    label: 'Forest Sunlight',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
  },
];

export const MediaEditorModal: React.FC<MediaEditorModalProps> = ({
  isOpen,
  initialMediaType,
  initialMediaUrl,
  initialCaption = '',
  initialTrimStart,
  initialTrimEnd,
  mode,
  recipientName,
  onClose,
  onApply,
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'video'>(initialMediaType);
  const [sourceUrl, setSourceUrl] = useState<string>(
    initialMediaUrl ||
      (initialMediaType === 'video' ? SAMPLE_EDITOR_VIDEOS[0].url : SAMPLE_EDITOR_PHOTOS[0].url)
  );
  const [activeTool, setActiveTool] = useState<ToolTab>(
    initialMediaType === 'video' ? 'video' : mode === 'profile' ? 'crop' : 'adjust'
  );

  // Crop & Transform State
  const [aspectPreset, setAspectPreset] = useState<'free' | '1:1' | 'circle' | '4:5' | '16:9' | '9:16'>(
    mode === 'profile' ? 'circle' : 'free'
  );
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, w: 100, h: 100 }); // percentages 0..100
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [straightenAngle, setStraightenAngle] = useState<number>(0); // -45..45
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);

  // Fine-Tune Color Grading State
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [warmth, setWarmth] = useState<number>(0); // -50..50
  const [tint, setTint] = useState<number>(0); // -45..45
  const [vignette, setVignette] = useState<number>(0); // 0..100
  const [edgeBlur, setEdgeBlur] = useState<number>(0); // 0..10
  const [selectedFilterId, setSelectedFilterId] = useState<string>('none');

  // Drawing & Redaction State
  const [drawActions, setDrawActions] = useState<DrawAction[]>([]);
  const [redoActions, setRedoActions] = useState<DrawAction[]>([]);
  const [strokeMode, setStrokeMode] = useState<DrawStrokeMode>('pen');
  const [redactMode, setRedactMode] = useState<PrivacyRedactMode>('pixelate');
  const [brushColor, setBrushColor] = useState<string>('#10B981');
  const [brushSize, setBrushSize] = useState<number>(8);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Overlays (Text, Stickers, Smart Stamps)
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const [transformingOverlayId, setTransformingOverlayId] = useState<string | null>(null);
  const transformOriginRef = useRef<{
    centerX: number;
    centerY: number;
    startDist: number;
    startAngle: number;
    initialScale: number;
    initialRotation: number;
  } | null>(null);
  const stickerImageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const [stickerSubTab, setStickerSubTab] = useState<'3d' | 'emojis' | 'props' | 'stamps'>('3d');
  const [emojiSearchQuery, setEmojiSearchQuery] = useState<string>('');
  const [newTextDraft, setNewTextDraft] = useState<string>('');
  const [textColor, setTextColor] = useState<string>('#FFFFFF');
  const [textBgStyle, setTextBgStyle] = useState<'solid' | 'glass' | 'outline' | 'none'>('solid');
  const [textFont, setTextFont] = useState<'sans' | 'serif' | 'mono' | 'display' | 'cursive'>('sans');

  // Frame & Watermark State
  const [frameStyle, setFrameStyle] = useState<'none' | 'polaroid' | 'cinema' | 'neon' | 'matte'>('none');
  const [watermarkText, setWatermarkText] = useState<string>('');

  // Video Specific State (Sub-second 0.1s precision trimming + Filmstrip Timeline)
  const [videoDuration, setVideoDuration] = useState<number>(24);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(24);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [videoMuted, setVideoMuted] = useState<boolean>(false);
  const [videoVolume, setVideoVolume] = useState<number>(100);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
  const [loopTrimSegment, setLoopTrimSegment] = useState<boolean>(true);
  const [filmstripThumbs, setFilmstripThumbs] = useState<string[]>([]);
  const [activeTrimDrag, setActiveTrimDrag] = useState<
    'start' | 'end' | 'window' | 'playhead' | null
  >(null);
  const trimTrackRef = useRef<HTMLDivElement | null>(null);
  const trimDragOriginRef = useRef<{
    clientX: number;
    initialStart: number;
    initialEnd: number;
  }>({ clientX: 0, initialStart: 0, initialEnd: 24 });

  // Delivery & Output State
  const [caption, setCaption] = useState<string>(initialCaption);
  const [quality, setQuality] = useState<'compress' | 'hd' | 'original'>('hd');
  const [viewOnce, setViewOnce] = useState<boolean>(false);
  const [isComparingOriginal, setIsComparingOriginal] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [editorToast, setEditorToast] = useState<string | null>(null);

  // Live Camera Capture Inside Editor
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setEditorToast(msg);
    setTimeout(() => setEditorToast(null), 2400);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    setMediaType(initialMediaType);
    setSourceUrl(
      initialMediaUrl ||
        (initialMediaType === 'video' ? SAMPLE_EDITOR_VIDEOS[0].url : SAMPLE_EDITOR_PHOTOS[0].url)
    );
    setCaption(initialCaption || '');
    setActiveTool(initialMediaType === 'video' ? 'video' : mode === 'profile' ? 'crop' : 'adjust');
    setAspectPreset(mode === 'profile' ? 'circle' : 'free');
    if (typeof initialTrimStart === 'number') setTrimStart(initialTrimStart);
    else setTrimStart(0);
    if (typeof initialTrimEnd === 'number' && initialTrimEnd > 0) setTrimEnd(initialTrimEnd);
  }, [isOpen, initialMediaType, initialMediaUrl, initialCaption, initialTrimStart, initialTrimEnd, mode]);

  const formatTrimTime = (seconds: number, includeTenths = true): string => {
    const clamped = Math.max(0, seconds);
    const mins = Math.floor(clamped / 60);
    const secs = Math.floor(clamped % 60);
    const tenths = Math.floor((clamped % 1) * 10);
    if (includeTenths) {
      return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Sample visual frame thumbnails across the video for the interactive filmstrip trimmer
  useEffect(() => {
    if (!isOpen || mediaType !== 'video' || !sourceUrl) return;
    let cancelled = false;
    setFilmstripThumbs([]);

    const tempVideo = document.createElement('video');
    tempVideo.crossOrigin = 'anonymous';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.preload = 'auto';
    tempVideo.src = sourceUrl;

    const frameCount = 10;
    const captured: string[] = [];

    const captureFramesSequentially = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          tempVideo.onloadedmetadata = () => resolve();
          tempVideo.onerror = () => reject();
          setTimeout(() => resolve(), 1800);
        });
        if (cancelled) return;
        const totalDur = Math.max(2, tempVideo.duration || 24);
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 56;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        for (let i = 0; i < frameCount; i++) {
          if (cancelled) return;
          const targetTime = Math.min(
            totalDur - 0.1,
            Math.max(0.05, (i / Math.max(1, frameCount - 1)) * totalDur)
          );
          tempVideo.currentTime = targetTime;
          await new Promise<void>((res) => {
            const onSeeked = () => {
              tempVideo.removeEventListener('seeked', onSeeked);
              res();
            };
            tempVideo.addEventListener('seeked', onSeeked);
            setTimeout(res, 220);
          });
          if (cancelled) return;
          try {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            captured.push(canvas.toDataURL('image/jpeg', 0.6));
          } catch {
            break;
          }
        }
        if (!cancelled && captured.length > 0) {
          setFilmstripThumbs(captured);
        }
      } catch {
        // Fallback filmstrip gradient cells are rendered automatically if CORS blocks canvas readback
      }
    };

    captureFramesSequentially();
    return () => {
      cancelled = true;
      tempVideo.src = '';
    };
  }, [isOpen, mediaType, sourceUrl]);

  // Global pointer move/up listeners for smooth dual-handle filmstrip video trimming
  useEffect(() => {
    if (!activeTrimDrag) return;

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      const track = trimTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const clientX =
        'touches' in e ? (e.touches[0]?.clientX ?? 0) : (e as MouseEvent).clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const timeAtPointer = Math.round(ratio * videoDuration * 10) / 10;
      const minClipLen = Math.min(1, videoDuration * 0.1);

      if (activeTrimDrag === 'start') {
        const nextStart = Math.max(0, Math.min(trimEnd - minClipLen, timeAtPointer));
        const rounded = Math.round(nextStart * 10) / 10;
        setTrimStart(rounded);
        setVideoCurrentTime(rounded);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = rounded;
        }
      } else if (activeTrimDrag === 'end') {
        const nextEnd = Math.min(videoDuration, Math.max(trimStart + minClipLen, timeAtPointer));
        const rounded = Math.round(nextEnd * 10) / 10;
        setTrimEnd(rounded);
        setVideoCurrentTime(rounded);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = Math.max(trimStart, rounded - 0.15);
        }
      } else if (activeTrimDrag === 'window') {
        const deltaPx = clientX - trimDragOriginRef.current.clientX;
        const deltaSec = (deltaPx / Math.max(1, rect.width)) * videoDuration;
        const clipLen =
          trimDragOriginRef.current.initialEnd - trimDragOriginRef.current.initialStart;
        let nextStart = trimDragOriginRef.current.initialStart + deltaSec;
        if (nextStart < 0) nextStart = 0;
        if (nextStart + clipLen > videoDuration) nextStart = Math.max(0, videoDuration - clipLen);
        const roundedStart = Math.round(nextStart * 10) / 10;
        const roundedEnd = Math.min(
          videoDuration,
          Math.round((roundedStart + clipLen) * 10) / 10
        );
        setTrimStart(roundedStart);
        setTrimEnd(roundedEnd);
        setVideoCurrentTime(roundedStart);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = roundedStart;
        }
      } else if (activeTrimDrag === 'playhead') {
        const clamped = Math.max(trimStart, Math.min(trimEnd, timeAtPointer));
        setVideoCurrentTime(clamped);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.currentTime = clamped;
        }
      }
    };

    const handleGlobalUp = () => {
      setActiveTrimDrag(null);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: true });
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [activeTrimDrag, trimStart, trimEnd, videoDuration]);

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCameraCapture = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      setIsCameraActive(false);
      showToast('Camera unavailable in this frame — upload from device or pick a studio preset.');
    }
  };

  const snapCameraFrame = () => {
    if (!cameraVideoRef.current) return;
    const vid = cameraVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || 960;
    canvas.height = vid.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      stopCamera();
      setMediaType('photo');
      setSourceUrl(dataUrl);
      setActiveTool('adjust');
      showToast('Captured camera photo into Pro Studio!');
    }
  };

  // Load image into memory whenever sourceUrl changes (for photo mode)
  useEffect(() => {
    if (!isOpen || mediaType !== 'photo' || !sourceUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageRef.current = img;
      renderPhotoCanvas();
    };
    img.onerror = () => {
      loadedImageRef.current = null;
    };
    img.src = sourceUrl;
  }, [isOpen, mediaType, sourceUrl]);

  // Combined CSS filter string
  const buildFilterCss = (ignoreEdits = false): string => {
    if (ignoreEdits) return 'none';
    const preset = CINEMA_FILTERS.find((f) => f.id === selectedFilterId);
    const presetCss = preset && preset.css !== 'none' ? preset.css : '';
    const b = brightness / 100;
    const c = contrast / 100;
    const s = saturation / 100;
    const sepiaAmt = warmth > 0 ? (warmth / 100) * 0.45 : 0;
    const hueShift = tint + (warmth < 0 ? (warmth / 100) * 25 : 0);
    const blurPx = edgeBlur > 0 ? `blur(${edgeBlur * 0.4}px)` : '';

    return [
      presetCss,
      `brightness(${b.toFixed(2)})`,
      `contrast(${c.toFixed(2)})`,
      `saturate(${s.toFixed(2)})`,
      sepiaAmt > 0 ? `sepia(${sepiaAmt.toFixed(2)})` : '',
      hueShift !== 0 ? `hue-rotate(${Math.round(hueShift)}deg)` : '',
      blurPx,
    ]
      .filter(Boolean)
      .join(' ');
  };

  // Render full photo pipeline onto the preview HTML5 canvas
  const renderPhotoCanvas = () => {
    const canvas = previewCanvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;

    const baseW = 900;
    const baseH = Math.round((img.height / Math.max(1, img.width)) * baseW);
    canvas.width = Math.max(400, Math.min(1200, baseW));
    canvas.height = Math.max(300, Math.min(1200, baseH));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070A0F';
    ctx.fillRect(0, 0, W, H);

    // 1. Draw Transformed & Filtered Base Image
    ctx.save();
    ctx.filter = buildFilterCss(isComparingOriginal);
    ctx.translate(W / 2, H / 2);

    if (!isComparingOriginal) {
      const totalAngle = ((rotation + straightenAngle) * Math.PI) / 180;
      ctx.rotate(totalAngle);
      ctx.scale((flipH ? -1 : 1) * zoom, (flipV ? -1 : 1) * zoom);
    }

    ctx.drawImage(img, -W / 2, -H / 2, W, H);
    ctx.restore();

    if (isComparingOriginal) return;

    // Warm/Cool temperature tint overlay
    if (warmth !== 0) {
      ctx.save();
      ctx.fillStyle =
        warmth > 0
          ? `rgba(245, 158, 11, ${(warmth / 100) * 0.16})`
          : `rgba(6, 182, 212, ${(Math.abs(warmth) / 100) * 0.16})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Vignette radial gradient
    if (vignette > 0) {
      ctx.save();
      const rad = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.25,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.72
      );
      rad.addColorStop(0, 'rgba(0,0,0,0)');
      rad.addColorStop(1, `rgba(0,0,0,${(vignette / 100) * 0.82})`);
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 2. Render Privacy Redactions & Freehand Drawings
    drawActions.forEach((act) => {
      if (act.points.length === 0) return;
      ctx.save();

      if (act.kind === 'redact') {
        const xs = act.points.map((p) => p.x * W);
        const ys = act.points.map((p) => p.y * H);
        const minX = Math.max(0, Math.min(...xs) - act.size * 2);
        const minY = Math.max(0, Math.min(...ys) - act.size * 2);
        const maxX = Math.min(W, Math.max(...xs) + act.size * 2);
        const maxY = Math.min(H, Math.max(...ys) + act.size * 2);
        const rw = Math.max(12, maxX - minX);
        const rh = Math.max(12, maxY - minY);

        if (act.redactMode === 'blackout') {
          ctx.fillStyle = '#020617';
          ctx.fillRect(minX, minY, rw, rh);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(minX, minY, rw, rh);
        } else if (act.redactMode === 'blur') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.fillRect(minX, minY, rw, rh);
          // Frosted hatch pattern
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 2;
          ctx.strokeRect(minX, minY, rw, rh);
        } else {
          // Mosaic Pixelate blocks
          const blockSize = Math.max(10, act.size * 1.6);
          for (let px = minX; px < maxX; px += blockSize) {
            for (let py = minY; py < maxY; py += blockSize) {
              const sampleX = Math.min(W - 1, Math.floor(px));
              const sampleY = Math.min(H - 1, Math.floor(py));
              const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
              ctx.fillStyle = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
              ctx.fillRect(px, py, blockSize, blockSize);
            }
          }
        }
      } else {
        // Stroke / Shapes
        ctx.strokeStyle = act.color;
        ctx.fillStyle = act.color;
        ctx.lineWidth = act.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (act.strokeMode === 'neon') {
          ctx.shadowColor = act.color;
          ctx.shadowBlur = 16;
        } else if (act.strokeMode === 'highlighter') {
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = act.size * 2.2;
        }

        const first = act.points[0];
        const last = act.points[act.points.length - 1];

        if (act.strokeMode === 'rect' && act.points.length >= 2) {
          const rx = first.x * W;
          const ry = first.y * H;
          const rw = (last.x - first.x) * W;
          const rh = (last.y - first.y) * H;
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (act.strokeMode === 'circle' && act.points.length >= 2) {
          const cx = ((first.x + last.x) / 2) * W;
          const cy = ((first.y + last.y) / 2) * H;
          const rx = Math.abs((last.x - first.x) * W) / 2;
          const ry = Math.abs((last.y - first.y) * H) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(4, rx), Math.max(4, ry), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (act.strokeMode === 'arrow' && act.points.length >= 2) {
          const x1 = first.x * W;
          const y1 = first.y * H;
          const x2 = last.x * W;
          const y2 = last.y * H;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = Math.max(14, act.size * 2.6);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(
            x2 - headLen * Math.cos(angle - Math.PI / 6),
            y2 - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            x2 - headLen * Math.cos(angle + Math.PI / 6),
            y2 - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          act.points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt.x * W, pt.y * H);
            else ctx.lineTo(pt.x * W, pt.y * H);
          });
          ctx.stroke();
        }
      }
      ctx.restore();
    });

    // 3. Render Frame / Border Style
    if (frameStyle !== 'none') {
      ctx.save();
      if (frameStyle === 'polaroid') {
        const b = Math.round(Math.min(W, H) * 0.045);
        const bottomB = Math.round(H * 0.14);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, W, b);
        ctx.fillRect(0, 0, b, H);
        ctx.fillRect(W - b, 0, b, H);
        ctx.fillRect(0, H - bottomB, W, bottomB);
        if (watermarkText || caption) {
          ctx.fillStyle = '#0F172A';
          ctx.font = `bold ${Math.round(H * 0.036)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText((watermarkText || caption).slice(0, 42), W / 2, H - bottomB * 0.4);
        }
      } else if (frameStyle === 'cinema') {
        const barH = Math.round(H * 0.1);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, barH);
        ctx.fillRect(0, H - barH, W, barH);
      } else if (frameStyle === 'neon') {
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 10;
        ctx.shadowColor = '#10B981';
        ctx.shadowBlur = 22;
        ctx.strokeRect(12, 12, W - 24, H - 24);
      } else if (frameStyle === 'matte') {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.round(Math.min(W, H) * 0.04);
        ctx.strokeRect(0, 0, W, H);
      }
      ctx.restore();
    }

    // 4. Render Watermark Signature if provided
    if (watermarkText.trim() && frameStyle !== 'polaroid') {
      ctx.save();
      ctx.font = `600 ${Math.max(14, Math.round(W * 0.022))}px monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(watermarkText.trim(), W - 20, H - 20);
      ctx.restore();
    }

    // 5. Render Overlays (Text, Emojis, 3D Cartoon Stickers, Props, Smart Stamps)
    overlays.forEach((ov) => {
      ctx.save();
      const ox = ov.x * W;
      const oy = ov.y * H;
      ctx.translate(ox, oy);
      ctx.rotate((ov.rotation * Math.PI) / 180);
      ctx.scale(ov.flipH ? -ov.scale : ov.scale, ov.scale);

      if (ov.stickerUrl && stickerImageCacheRef.current[ov.stickerUrl]) {
        const stkImg = stickerImageCacheRef.current[ov.stickerUrl];
        const drawSize = 110;
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 10;
        ctx.drawImage(stkImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.restore();
        return;
      }

      const fontMap: Record<OverlayItem['fontFamily'], string> = {
        sans: 'bold 30px Plus Jakarta Sans, system-ui, sans-serif',
        serif: 'bold 30px Georgia, serif',
        mono: 'bold 26px JetBrains Mono, monospace',
        display: '900 32px system-ui, sans-serif',
        cursive: 'italic bold 30px Georgia, cursive',
      };

      ctx.font = ov.kind === 'sticker' ? '56px sans-serif' : fontMap[ov.fontFamily];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (ov.kind !== 'sticker') {
        const metrics = ctx.measureText(ov.text);
        const padX = 18;
        const bw = metrics.width + padX * 2;
        const bh = 44;

        if (ov.bgStyle === 'solid') {
          ctx.fillStyle = ov.color === '#FFFFFF' ? '#0F172A' : '#020617';
          ctx.beginPath();
          ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12);
          ctx.fill();
          ctx.strokeStyle = ov.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (ov.bgStyle === 'glass') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
          ctx.beginPath();
          ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12);
          ctx.fill();
        } else if (ov.bgStyle === 'outline') {
          ctx.strokeStyle = ov.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12);
          ctx.stroke();
        }
      }

      ctx.fillStyle = ov.color;
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 6;
      ctx.fillText(ov.text, 0, 0);
      ctx.restore();
    });
  };

  useEffect(() => {
    if (mediaType === 'photo') {
      renderPhotoCanvas();
    }
  }, [
    mediaType,
    rotation,
    straightenAngle,
    flipH,
    flipV,
    zoom,
    brightness,
    contrast,
    saturation,
    warmth,
    tint,
    vignette,
    edgeBlur,
    selectedFilterId,
    drawActions,
    overlays,
    frameStyle,
    watermarkText,
    caption,
    isComparingOriginal,
  ]);

  // Apply Aspect Ratio Preset to Crop Box
  const handleSelectAspectPreset = (
    preset: 'free' | '1:1' | 'circle' | '4:5' | '16:9' | '9:16'
  ) => {
    setAspectPreset(preset);
    if (preset === 'free') {
      setCropBox({ x: 0, y: 0, w: 100, h: 100 });
    } else if (preset === '1:1' || preset === 'circle') {
      setCropBox({ x: 10, y: 10, w: 80, h: 80 });
    } else if (preset === '4:5') {
      setCropBox({ x: 14, y: 6, w: 72, h: 88 });
    } else if (preset === '16:9') {
      setCropBox({ x: 5, y: 18, w: 90, h: 64 });
    } else if (preset === '9:16') {
      setCropBox({ x: 22, y: 4, w: 56, h: 92 });
    }
  };

  // Pointer coordinate helper normalized 0..1
  const getNormalizedCoords = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } | null => {
    const targetEl =
      mediaType === 'photo' ? previewCanvasRef.current : stageContainerRef.current;
    if (!targetEl) return null;
    const rect = targetEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getNormalizedCoords(e);
    if (!pt) return;

    // Check if user tapped an existing overlay to drag/select it
    const hitOverlay = [...overlays]
      .reverse()
      .find((ov) => Math.hypot(ov.x - pt.x, ov.y - pt.y) < 0.1);

    if (hitOverlay && activeTool !== 'draw' && activeTool !== 'privacy') {
      setSelectedOverlayId(hitOverlay.id);
      setDraggingOverlayId(hitOverlay.id);
      return;
    }

    if (activeTool === 'draw' || activeTool === 'privacy') {
      setIsDrawing(true);
      const newAction: DrawAction = {
        id: `draw_${Date.now()}`,
        kind: activeTool === 'privacy' ? 'redact' : 'stroke',
        strokeMode: activeTool === 'draw' ? strokeMode : undefined,
        redactMode: activeTool === 'privacy' ? redactMode : undefined,
        color: brushColor,
        size: brushSize,
        points: [pt],
      };
      setDrawActions((prev) => [...prev, newAction]);
      setRedoActions([]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;

    if (transformingOverlayId && transformOriginRef.current) {
      const orig = transformOriginRef.current;
      const dx = clientX - orig.centerX;
      const dy = clientY - orig.centerY;
      const dist = Math.max(12, Math.hypot(dx, dy));
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = (angleRad * 180) / Math.PI;
      const deltaAngle = angleDeg - orig.startAngle;
      const nextScale = Math.max(
        0.35,
        Math.min(3.5, Math.round((orig.initialScale * (dist / Math.max(12, orig.startDist))) * 20) / 20)
      );
      let nextRot = Math.round(orig.initialRotation + deltaAngle);
      while (nextRot > 180) nextRot -= 360;
      while (nextRot < -180) nextRot += 360;

      setOverlays((prev) =>
        prev.map((ov) =>
          ov.id === transformingOverlayId
            ? { ...ov, scale: nextScale, rotation: nextRot }
            : ov
        )
      );
      return;
    }

    const pt = getNormalizedCoords(e);
    if (!pt) return;

    if (draggingOverlayId) {
      setOverlays((prev) =>
        prev.map((ov) => (ov.id === draggingOverlayId ? { ...ov, x: pt.x, y: pt.y } : ov))
      );
      return;
    }

    if (!isDrawing) return;
    setDrawActions((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, points: [...last.points, pt] }];
    });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setDraggingOverlayId(null);
    setTransformingOverlayId(null);
    transformOriginRef.current = null;
  };

  const handleUndo = () => {
    if (drawActions.length > 0) {
      const popped = drawActions[drawActions.length - 1];
      setDrawActions((prev) => prev.slice(0, -1));
      setRedoActions((prev) => [...prev, popped]);
    } else if (overlays.length > 0) {
      setOverlays((prev) => prev.slice(0, -1));
    }
  };

  const handleRedo = () => {
    if (redoActions.length === 0) return;
    const restored = redoActions[redoActions.length - 1];
    setRedoActions((prev) => prev.slice(0, -1));
    setDrawActions((prev) => [...prev, restored]);
  };

  const handleResetAll = () => {
    setCropBox({ x: 0, y: 0, w: 100, h: 100 });
    setRotation(0);
    setStraightenAngle(0);
    setFlipH(false);
    setFlipV(false);
    setZoom(1);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setWarmth(0);
    setTint(0);
    setVignette(0);
    setEdgeBlur(0);
    setSelectedFilterId('none');
    setDrawActions([]);
    setRedoActions([]);
    setOverlays([]);
    setFrameStyle('none');
    setWatermarkText('');
    setTrimStart(0);
    setTrimEnd(videoDuration);
    setPlaybackRate(1);
    setVideoMuted(false);
    showToast('Reset all edits to original');
  };

  const handleAutoEnhance = () => {
    setBrightness(106);
    setContrast(114);
    setSaturation(124);
    setWarmth(8);
    setVignette(15);
    showToast('Applied Pro Auto-Enhance ✨');
  };

  const handleAddTextOverlay = () => {
    if (!newTextDraft.trim()) return;
    const item: OverlayItem = {
      id: `ov_${Date.now()}`,
      kind: 'text',
      text: newTextDraft.trim(),
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      color: textColor,
      bgStyle: textBgStyle,
      fontFamily: textFont,
    };
    setOverlays((prev) => [...prev, item]);
    setSelectedOverlayId(item.id);
    setNewTextDraft('');
    showToast('Added text layer — drag it anywhere on canvas!');
  };

  const handleAddStickerOrStamp = (
    text: string,
    kind: 'sticker' | 'stamp',
    stickerUrl?: string
  ) => {
    if (stickerUrl && !stickerImageCacheRef.current[stickerUrl]) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        stickerImageCacheRef.current[stickerUrl] = img;
        if (mediaType === 'photo') renderPhotoCanvas();
      };
      img.src = stickerUrl;
    }

    // Offset slightly so multiple added stickers don't stack invisibly on top of each other
    const jitterX = (overlays.length % 3 - 1) * 0.06;
    const jitterY = (Math.floor(overlays.length / 3) % 3 - 1) * 0.05;
    const item: OverlayItem = {
      id: `ov_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      kind,
      text,
      stickerUrl,
      x: Math.max(0.15, Math.min(0.85, 0.5 + jitterX)),
      y: Math.max(0.15, Math.min(0.85, 0.45 + jitterY)),
      scale: 1,
      rotation: 0,
      flipH: false,
      color: '#FFFFFF',
      bgStyle: kind === 'stamp' ? 'solid' : 'none',
      fontFamily: 'sans',
    };
    setOverlays((prev) => [...prev, item]);
    setSelectedOverlayId(item.id);
    showToast(
      `Added ${kind === 'stamp' ? 'Smart Stamp' : 'Sticker'} — drag to move, drag ↘ corner to resize & rotate!`
    );
  };

  // Extract current video frame into Photo Studio mode!
  const handleExtractVideoFrameAsPhoto = () => {
    const vid = videoPreviewRef.current;
    if (!vid) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 800;
      canvas.height = vid.videoHeight || 450;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.filter = buildFilterCss(false);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const frameUrl = canvas.toDataURL('image/jpeg', 0.92);
        setMediaType('photo');
        setSourceUrl(frameUrl);
        setActiveTool('adjust');
        showToast('Extracted HD video frame into Photo Editor 📸');
      }
    } catch {
      showToast('Captured frame preview');
    }
  };

  // Upload new file from user device into editor
  const handleDeviceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVid = file.type.startsWith('video/');
    if (isVid) {
      const objUrl = URL.createObjectURL(file);
      setMediaType('video');
      setSourceUrl(objUrl);
      setActiveTool('video');
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setMediaType('photo');
        setSourceUrl(String(reader.result || ''));
        setActiveTool('adjust');
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Final Export & Apply
  const handleConfirmApply = async () => {
    setIsExporting(true);
    try {
      if (mediaType === 'photo' && previewCanvasRef.current) {
        renderPhotoCanvas();
        const srcCanvas = previewCanvasRef.current;
        const outCanvas = document.createElement('canvas');

        const sx = (cropBox.x / 100) * srcCanvas.width;
        const sy = (cropBox.y / 100) * srcCanvas.height;
        const sw = Math.max(64, (cropBox.w / 100) * srcCanvas.width);
        const sh = Math.max(64, (cropBox.h / 100) * srcCanvas.height);

        outCanvas.width = mode === 'profile' ? 500 : sw;
        outCanvas.height = mode === 'profile' ? 500 : sh;

        const outCtx = outCanvas.getContext('2d');
        if (outCtx) {
          outCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outCanvas.width, outCanvas.height);
        }

        let exportedUrl = sourceUrl;
        try {
          const jpegQuality = quality === 'compress' ? 0.68 : quality === 'hd' ? 0.88 : 0.96;
          exportedUrl = outCanvas.toDataURL('image/jpeg', jpegQuality);
        } catch {
          exportedUrl = sourceUrl;
        }

        onApply({
          mediaType: 'photo',
          url: exportedUrl,
          thumbnailUrl: exportedUrl,
          caption: caption.trim(),
          quality,
          viewOnce,
        });
      } else {
        // Video export with rich playback/trim/filter metadata & captured poster thumbnail
        const overlaySummary = overlays.map((o) => o.text).join(' · ');
        const isTrimmed = trimStart > 0.1 || trimEnd < videoDuration - 0.1;
        const trimmedClipDuration = Math.max(
          0.5,
          Math.round(((trimEnd - trimStart) / playbackRate) * 10) / 10
        );

        let capturedPosterUrl: string | undefined;
        if (videoPreviewRef.current) {
          try {
            const vid = videoPreviewRef.current;
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = vid.videoWidth || 640;
            thumbCanvas.height = vid.videoHeight || 360;
            const tCtx = thumbCanvas.getContext('2d');
            if (tCtx) {
              tCtx.filter = buildFilterCss(false);
              tCtx.drawImage(vid, 0, 0, thumbCanvas.width, thumbCanvas.height);
              capturedPosterUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);
            }
          } catch {
            capturedPosterUrl = filmstripThumbs[0];
          }
        }

        const finalCaption = [
          caption.trim(),
          isTrimmed ? `[✂️ ${formatTrimTime(trimStart)}–${formatTrimTime(trimEnd)}]` : '',
          overlaySummary ? `[Overlays: ${overlaySummary}]` : '',
          playbackRate !== 1 ? `[Speed: ${playbackRate}x]` : '',
          videoMuted ? '[Audio Muted]' : '',
        ]
          .filter(Boolean)
          .join(' ');

        onApply({
          mediaType: 'video',
          url: sourceUrl,
          thumbnailUrl: capturedPosterUrl,
          caption: finalCaption,
          quality,
          viewOnce,
          durationSec: Math.max(1, Math.round(trimmedClipDuration)),
          videoMeta: {
            trimStart: Math.round(trimStart * 10) / 10,
            trimEnd: Math.round(trimEnd * 10) / 10,
            originalDuration: videoDuration,
            playbackRate,
            muted: videoMuted,
            volume: videoVolume,
            filterCss: buildFilterCss(false),
            rotation,
            flipH,
            overlaySummary,
            overlays: overlays.map((ov) => ({
              id: ov.id,
              kind: ov.kind,
              text: ov.text,
              stickerUrl: ov.stickerUrl,
              x: ov.x,
              y: ov.y,
              scale: ov.scale,
              rotation: ov.rotation,
              flipH: ov.flipH,
              color: ov.color,
              bgStyle: ov.bgStyle,
            })),
          },
        });
      }
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadEdited = () => {
    if (mediaType === 'photo' && previewCanvasRef.current) {
      try {
        const dataUrl = previewCanvasRef.current.toDataURL('image/jpeg', 0.92);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Simple_Edited_${Date.now()}.jpg`;
        a.click();
        showToast('Saved edited photo to device!');
      } catch {
        showToast('Downloaded media');
      }
    } else {
      const a = document.createElement('a');
      a.href = sourceUrl;
      a.download = `Simple_Video_${Date.now()}.mp4`;
      a.click();
      showToast('Saved video to device!');
    }
  };

  // Sync live video element properties
  useEffect(() => {
    const vid = videoPreviewRef.current;
    if (!vid || mediaType !== 'video') return;
    vid.playbackRate = playbackRate;
    vid.muted = videoMuted;
    vid.volume = Math.max(0, Math.min(1, videoVolume / 100));
  }, [mediaType, playbackRate, videoMuted, videoVolume]);

  if (!isOpen) return null;

  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || null;

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-full max-w-[100vw] bg-[#06090F] text-white flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-150">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleDeviceUpload}
      />

      {/* Toast Notification */}
      {editorToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-slate-900/95 border border-emerald-500/50 text-xs font-semibold text-emerald-300 shadow-2xl pointer-events-none">
          {editorToast}
        </div>
      )}

      {/* ====================================================================
          TOP NATIVE ANDROID STUDIO BAR (Undo, Redo, Compare, Upload, Reset)
         ==================================================================== */}
      <header className="px-3 py-2 bg-slate-950/95 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white shrink-0"
            title="Close Media Studio"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                {mode === 'profile'
                  ? 'Profile Photo Studio'
                  : mode === 'status'
                  ? 'Status Media Studio'
                  : 'Pro Media Editor'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {mediaType === 'photo'
                ? 'Crop · Color Grade · Privacy Redact · Draw · Text & Stamps'
                : 'Trim · Speed · Audio Mute · Cinema Filters · Frame Capture'}
            </div>
          </div>
        </div>

        {/* Center/Right Studio Quick Actions */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {/* Switch Photo / Video or Upload from Device */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-emerald-300 flex items-center gap-1 shrink-0"
            title="Upload Photo or Video from Device"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          <button
            type="button"
            onClick={startCameraCapture}
            className="h-8 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-cyan-300 flex items-center gap-1 shrink-0"
            title="Capture from Live Camera"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Camera</span>
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={drawActions.length === 0 && overlays.length === 0}
            className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-35 shrink-0"
            title="Undo drawing or overlay"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={redoActions.length === 0}
            className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-35 shrink-0"
            title="Redo stroke"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={() => setIsComparingOriginal(true)}
            onMouseUp={() => setIsComparingOriginal(false)}
            onMouseLeave={() => setIsComparingOriginal(false)}
            onTouchStart={() => setIsComparingOriginal(true)}
            onTouchEnd={() => setIsComparingOriginal(false)}
            className={`h-8 px-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 shrink-0 ${
              isComparingOriginal
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Hold to compare Original vs Edited"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Compare</span>
          </button>

          <button
            type="button"
            onClick={handleResetAll}
            className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-amber-300 shrink-0"
            title="Reset all adjustments"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadEdited}
            className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0"
            title="Download edited media to device"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ====================================================================
          PERSISTENT INTERACTIVE FILMSTRIP VIDEO TRIMMER BAR (Flagship Messaging Style)
          Always visible at the top of the media preview screen when a video is loaded
         ==================================================================== */}
      {mediaType === 'video' && !isCameraActive && (
        <div className="px-3 sm:px-5 py-2 bg-slate-950/95 border-b border-slate-800/80 shrink-0 z-20 space-y-1.5">
          {/* Top Summary Row: Start / End Timecodes, Trimmed Clip Duration, Estimated Size, Mute Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                <Scissors className="w-3 h-3" />
                <span>
                  {formatTrimTime(trimStart)} – {formatTrimTime(trimEnd)}
                </span>
              </span>
              <span className="text-slate-300 font-mono">
                Clip:{' '}
                <strong className="text-white">
                  {Math.max(0.5, (trimEnd - trimStart) / playbackRate).toFixed(1)}s
                </strong>
                {playbackRate !== 1 ? ` (${playbackRate}x)` : ''}
              </span>
              <span className="hidden sm:inline text-slate-500">·</span>
              <span className="font-mono text-cyan-300">
                ~
                {(
                  ((trimEnd - trimStart) / Math.max(1, videoDuration)) *
                  (quality === 'compress' ? 4.2 : quality === 'hd' ? 8.6 : 12.4)
                ).toFixed(1)}{' '}
                MB
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Quick Mute / GIF-style Silent Video Toggle */}
              <button
                type="button"
                onClick={() => setVideoMuted((m) => !m)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                  videoMuted
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900 border-slate-800 text-emerald-300 hover:bg-slate-800'
                }`}
                title={videoMuted ? 'Unmute video audio' : 'Mute audio before sending'}
              >
                {videoMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                <span>{videoMuted ? 'Muted' : 'Audio On'}</span>
              </button>

              {/* Preview Trimmed Cut from Start */}
              <button
                type="button"
                onClick={() => {
                  const vid = videoPreviewRef.current;
                  if (!vid) return;
                  vid.currentTime = trimStart;
                  vid.play().catch(() => {});
                  setIsVideoPlaying(true);
                  setVideoCurrentTime(trimStart);
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-bold text-slate-200 flex items-center gap-1"
                title="Replay trimmed video segment from start point"
              >
                <Play className="w-2.5 h-2.5 text-emerald-400" />
                <span>Preview Cut</span>
              </button>

              {(trimStart > 0.1 || trimEnd < videoDuration - 0.1) && (
                <button
                  type="button"
                  onClick={() => {
                    setTrimStart(0);
                    setTrimEnd(videoDuration);
                    if (videoPreviewRef.current) videoPreviewRef.current.currentTime = 0;
                    showToast('Reset video trim to full length');
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[10px] font-bold text-amber-300"
                >
                  Reset Trim
                </button>
              )}
            </div>
          </div>

          {/* Interactive Filmstrip Timeline Track with Dual Start/End Handles & Live Playhead */}
          <div className="relative py-1 select-none">
            <div
              ref={trimTrackRef}
              onMouseDown={(e) => {
                // Clicking directly on the track scrubs the playhead
                if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.filmstrip) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(
                    0,
                    Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
                  );
                  const targetSec = Math.round(ratio * videoDuration * 10) / 10;
                  const clamped = Math.max(trimStart, Math.min(trimEnd, targetSec));
                  setVideoCurrentTime(clamped);
                  if (videoPreviewRef.current) videoPreviewRef.current.currentTime = clamped;
                  setActiveTrimDrag('playhead');
                }
              }}
              onTouchStart={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.filmstrip) {
                  const t = e.touches[0];
                  if (!t) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(
                    0,
                    Math.min(1, (t.clientX - rect.left) / Math.max(1, rect.width))
                  );
                  const targetSec = Math.round(ratio * videoDuration * 10) / 10;
                  const clamped = Math.max(trimStart, Math.min(trimEnd, targetSec));
                  setVideoCurrentTime(clamped);
                  if (videoPreviewRef.current) videoPreviewRef.current.currentTime = clamped;
                  setActiveTrimDrag('playhead');
                }
              }}
              className="relative h-12 w-full rounded-xl bg-slate-900 border border-slate-800 overflow-hidden cursor-pointer"
            >
              {/* Underlying Frame Thumbnails Strip */}
              <div
                data-filmstrip="true"
                className="absolute inset-0 grid grid-cols-10 w-full h-full pointer-events-none"
              >
                {Array.from({ length: 10 }).map((_, idx) => {
                  const thumbUrl = filmstripThumbs[idx];
                  const markerSec = Math.round(((idx + 0.5) / 10) * videoDuration);
                  return (
                    <div
                      key={idx}
                      className="relative h-full border-r border-slate-800/60 overflow-hidden flex items-end justify-center bg-gradient-to-b from-slate-800/80 via-slate-900 to-slate-950"
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="w-full h-full object-cover opacity-85"
                        />
                      ) : (
                        /* Stylized Filmstrip Waveform + Frame Cell Fallback */
                        <div className="w-full h-full flex flex-col justify-between p-1 opacity-75">
                          <div className="flex items-center justify-between gap-0.5">
                            <span className="w-1 h-1 rounded-xs bg-slate-600" />
                            <span className="w-1 h-1 rounded-xs bg-slate-600" />
                            <span className="w-1 h-1 rounded-xs bg-slate-600" />
                          </div>
                          <div className="flex items-end justify-center gap-0.5 h-5">
                            {[0, 1, 2, 3].map((b) => (
                              <span
                                key={b}
                                className="w-1 rounded-full bg-emerald-400/35"
                                style={{
                                  height: `${30 + ((idx * 17 + b * 23) % 65)}%`,
                                }}
                              />
                            ))}
                          </div>
                          <span className="text-[8px] font-mono text-slate-400 text-center">
                            {formatTrimTime(markerSec, false)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Left Trimmed-Out Dimmed Exclusion Overlay */}
              <div
                className="absolute inset-y-0 left-0 bg-black/75 backdrop-blur-[1px] pointer-events-none z-10"
                style={{
                  width: `${Math.max(0, Math.min(100, (trimStart / Math.max(0.1, videoDuration)) * 100))}%`,
                }}
              />

              {/* Right Trimmed-Out Dimmed Exclusion Overlay */}
              <div
                className="absolute inset-y-0 right-0 bg-black/75 backdrop-blur-[1px] pointer-events-none z-10"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, ((videoDuration - trimEnd) / Math.max(0.1, videoDuration)) * 100)
                  )}%`,
                }}
              />

              {/* Active Trimmed Selection Window (Draggable Center + Top/Bottom Highlight Borders) */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  trimDragOriginRef.current = {
                    clientX: e.clientX,
                    initialStart: trimStart,
                    initialEnd: trimEnd,
                  };
                  setActiveTrimDrag('window');
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const t = e.touches[0];
                  if (!t) return;
                  trimDragOriginRef.current = {
                    clientX: t.clientX,
                    initialStart: trimStart,
                    initialEnd: trimEnd,
                  };
                  setActiveTrimDrag('window');
                }}
                title="Drag center window to slide trimmed range along the video"
                className="absolute inset-y-0 border-y-[3px] border-emerald-400 bg-emerald-400/10 cursor-grab active:cursor-grabbing z-20"
                style={{
                  left: `${(trimStart / Math.max(0.1, videoDuration)) * 100}%`,
                  width: `${Math.max(
                    2,
                    ((trimEnd - trimStart) / Math.max(0.1, videoDuration)) * 100
                  )}%`,
                }}
              />

              {/* Left (Start Point) Draggable Trim Handle */}
              <div
                role="slider"
                aria-label="Trim start point"
                aria-valuemin={0}
                aria-valuemax={trimEnd}
                aria-valuenow={trimStart}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('start');
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('start');
                }}
                style={{
                  left: `calc(${(trimStart / Math.max(0.1, videoDuration)) * 100}% - 8px)`,
                }}
                className="absolute inset-y-0 w-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-l-lg flex flex-col items-center justify-center cursor-ew-resize z-30 shadow-lg"
                title={`Start: ${formatTrimTime(trimStart)} (Drag to trim start)`}
              >
                <div className="w-1 h-5 rounded-full bg-slate-950/80" />
              </div>

              {/* Right (End Point) Draggable Trim Handle */}
              <div
                role="slider"
                aria-label="Trim end point"
                aria-valuemin={trimStart}
                aria-valuemax={videoDuration}
                aria-valuenow={trimEnd}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('end');
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('end');
                }}
                style={{
                  left: `calc(${(trimEnd / Math.max(0.1, videoDuration)) * 100}% - 8px)`,
                }}
                className="absolute inset-y-0 w-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-r-lg flex flex-col items-center justify-center cursor-ew-resize z-30 shadow-lg"
                title={`End: ${formatTrimTime(trimEnd)} (Drag to trim end)`}
              >
                <div className="w-1 h-5 rounded-full bg-slate-950/80" />
              </div>

              {/* Live Moving Playhead Scrubber Line */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('playhead');
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setActiveTrimDrag('playhead');
                }}
                style={{
                  left: `${Math.max(
                    0,
                    Math.min(100, (videoCurrentTime / Math.max(0.1, videoDuration)) * 100)
                  )}%`,
                }}
                className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] z-30 cursor-ew-resize"
              >
                <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-emerald-500 shadow-md" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          CENTER INTERACTIVE CANVAS / VIDEO STAGE (Flex-1, Never Overflows)
         ==================================================================== */}
      <div
        ref={stageContainerRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-[#04060A] p-2 sm:p-4 overflow-hidden"
      >
        {isCameraActive ? (
          <div className="relative w-full max-w-lg aspect-video rounded-3xl overflow-hidden border-2 border-emerald-500/60 bg-black flex flex-col items-center justify-center shadow-2xl">
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2 rounded-full bg-slate-900/90 text-xs font-semibold text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={snapCameraFrame}
                className="px-5 py-2 rounded-full bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xl"
              >
                <Camera className="w-4 h-4" />
                <span>Capture Photo</span>
              </button>
            </div>
          </div>
        ) : mediaType === 'photo' ? (
          <div className="relative max-h-full max-w-full flex items-center justify-center">
            <canvas
              ref={previewCanvasRef}
              className={`max-h-[42dvh] sm:max-h-[48dvh] w-auto max-w-full rounded-2xl shadow-2xl border border-slate-800/90 object-contain ${
                activeTool === 'draw' || activeTool === 'privacy'
                  ? 'cursor-crosshair'
                  : 'cursor-grab active:cursor-grabbing'
              }`}
            />

            {/* Interactive On-Canvas Sticker / Emoji / Text Manipulation Handles for Photo Mode */}
            {overlays.map((ov) => {
              const isSelected = ov.id === selectedOverlayId;
              return (
                <div
                  key={ov.id}
                  onMouseDown={(e) => {
                    if (activeTool === 'draw' || activeTool === 'privacy') return;
                    e.stopPropagation();
                    setSelectedOverlayId(ov.id);
                    setDraggingOverlayId(ov.id);
                  }}
                  onTouchStart={(e) => {
                    if (activeTool === 'draw' || activeTool === 'privacy') return;
                    e.stopPropagation();
                    setSelectedOverlayId(ov.id);
                    setDraggingOverlayId(ov.id);
                  }}
                  style={{
                    left: `${ov.x * 100}%`,
                    top: `${ov.y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${ov.rotation}deg) scale(${ov.scale})`,
                  }}
                  className={`absolute z-30 select-none cursor-move transition-shadow ${
                    isSelected
                      ? 'ring-2 ring-emerald-400 bg-emerald-500/10 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                      : 'hover:ring-1 hover:ring-white/40 rounded-2xl'
                  }`}
                >
                  {/* Invisible hit area matching the drawn canvas overlay */}
                  <div className="w-16 h-16 flex items-center justify-center opacity-0">
                    {ov.text}
                  </div>

                  {isSelected && (
                    <>
                      {/* Top-Left Delete Handle */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) => prev.filter((item) => item.id !== ov.id));
                          setSelectedOverlayId(null);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) => prev.filter((item) => item.id !== ov.id));
                          setSelectedOverlayId(null);
                        }}
                        className=" -top-3 -left-3 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg border border-white hover:scale-110"
                        title="Remove sticker"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      {/* Top-Right Quick Rotate +15° Handle */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) =>
                            prev.map((item) =>
                              item.id === ov.id
                                ? { ...item, rotation: ((item.rotation + 15 + 180) % 360) - 180 }
                                : item
                            )
                          );
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) =>
                            prev.map((item) =>
                              item.id === ov.id
                                ? { ...item, rotation: ((item.rotation + 15 + 180) % 360) - 180 }
                                : item
                            )
                          );
                        }}
                        className=" -top-3 -right-3 w-6 h-6 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg border border-white hover:scale-110"
                        title="Tap to rotate +15°"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      {/* Bottom-Right Drag-to-Resize & Rotate Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const parentEl = e.currentTarget.parentElement;
                          if (!parentEl) return;
                          const rect = parentEl.getBoundingClientRect();
                          const cx = rect.left + rect.width / 2;
                          const cy = rect.top + rect.height / 2;
                          const dx = e.clientX - cx;
                          const dy = e.clientY - cy;
                          transformOriginRef.current = {
                            centerX: cx,
                            centerY: cy,
                            startDist: Math.max(12, Math.hypot(dx, dy)),
                            startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
                            initialScale: ov.scale,
                            initialRotation: ov.rotation,
                          };
                          setTransformingOverlayId(ov.id);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const t = e.touches[0];
                          const parentEl = e.currentTarget.parentElement;
                          if (!t || !parentEl) return;
                          const rect = parentEl.getBoundingClientRect();
                          const cx = rect.left + rect.width / 2;
                          const cy = rect.top + rect.height / 2;
                          const dx = t.clientX - cx;
                          const dy = t.clientY - cy;
                          transformOriginRef.current = {
                            centerX: cx,
                            centerY: cy,
                            startDist: Math.max(12, Math.hypot(dx, dy)),
                            startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
                            initialScale: ov.scale,
                            initialRotation: ov.rotation,
                          };
                          setTransformingOverlayId(ov.id);
                        }}
                        className=" -bottom-3 -right-3 w-6 h-6 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg border border-white cursor-nwse-resize hover:scale-110"
                        title="Drag to resize & rotate sticker"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Visual Crop & Circle Profile Guide Overlay */}
            {(activeTool === 'crop' || aspectPreset === 'circle' || cropBox.w < 100 || cropBox.h < 100) && (
              <div
                className="pointer-events-none absolute border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.52)] transition-all"
                style={{
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.w}%`,
                  height: `${cropBox.h}%`,
                  borderRadius: aspectPreset === 'circle' ? '9999px' : '12px',
                }}
              >
                {/* Rule of Thirds Grid Lines */}
                <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <div key={idx} className="border border-white/15" />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Video Interactive Stage */
          <div className="relative max-h-[42dvh] sm:max-h-[48dvh] aspect-video w-full max-w-2xl rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-black flex items-center justify-center">
            <video
              ref={videoPreviewRef}
              src={sourceUrl}
              autoPlay
              loop
              playsInline
              onLoadedMetadata={(e) => {
                const rawDur = e.currentTarget.duration || 24;
                const dur = Math.max(1, Math.round(rawDur * 10) / 10);
                setVideoDuration(dur);
                if (!initialTrimEnd || initialTrimEnd > dur) {
                  setTrimEnd(dur);
                }
                if (initialTrimStart && initialTrimStart < dur) {
                  e.currentTarget.currentTime = initialTrimStart;
                  setVideoCurrentTime(initialTrimStart);
                }
              }}
              onTimeUpdate={(e) => {
                const cur = e.currentTarget.currentTime;
                setVideoCurrentTime(cur);
                if (cur >= trimEnd) {
                  if (loopTrimSegment) {
                    e.currentTarget.currentTime = trimStart;
                    setVideoCurrentTime(trimStart);
                  } else {
                    e.currentTarget.pause();
                    setIsVideoPlaying(false);
                  }
                } else if (cur < trimStart - 0.15) {
                  e.currentTarget.currentTime = trimStart;
                }
              }}
              style={{
                filter: buildFilterCss(isComparingOriginal),
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scale(${zoom})`,
              }}
              className="w-full h-full object-contain transition-transform"
            />

            {/* Live Video Overlays Preview with Interactive Drag, Resize & Rotate Handles */}
            {overlays.map((ov) => {
              const isSelected = ov.id === selectedOverlayId;
              return (
                <div
                  key={ov.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(ov.id);
                    setDraggingOverlayId(ov.id);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(ov.id);
                    setDraggingOverlayId(ov.id);
                  }}
                  style={{
                    left: `${ov.x * 100}%`,
                    top: `${ov.y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${ov.rotation}deg) scale(${
                      ov.flipH ? -ov.scale : ov.scale
                    }, ${ov.scale})`,
                    color: ov.color,
                  }}
                  className={`absolute z-30 px-2.5 py-1.5 rounded-2xl font-bold cursor-move select-none ${
                    isSelected
                      ? 'ring-2 ring-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(16,185,129,0.45)]'
                      : ''
                  } ${
                    ov.kind === 'sticker'
                      ? 'text-4xl'
                      : ov.bgStyle === 'solid'
                      ? 'bg-slate-950/90 border border-emerald-500/40 text-sm'
                      : 'bg-black/45 backdrop-blur-xs text-sm'
                  }`}
                >
                  {ov.stickerUrl ? (
                    <img
                      src={ov.stickerUrl}
                      alt={ov.text}
                      className="w-16 h-16 object-contain pointer-events-none drop-shadow-xl"
                    />
                  ) : (
                    <span>{ov.text}</span>
                  )}

                  {isSelected && (
                    <>
                      {/* Top-Left Delete Button */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) => prev.filter((item) => item.id !== ov.id));
                          setSelectedOverlayId(null);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) => prev.filter((item) => item.id !== ov.id));
                          setSelectedOverlayId(null);
                        }}
                        className=" -top-3 -left-3 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg border border-white"
                        title="Delete sticker"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      {/* Top-Right Rotate +15° Button */}
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) =>
                            prev.map((item) =>
                              item.id === ov.id
                                ? { ...item, rotation: ((item.rotation + 15 + 180) % 360) - 180 }
                                : item
                            )
                          );
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setOverlays((prev) =>
                            prev.map((item) =>
                              item.id === ov.id
                                ? { ...item, rotation: ((item.rotation + 15 + 180) % 360) - 180 }
                                : item
                            )
                          );
                        }}
                        className=" -top-3 -right-3 w-6 h-6 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg border border-white"
                        title="Rotate +15°"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      {/* Bottom-Right Drag-to-Resize & Rotate Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const parentEl = e.currentTarget.parentElement;
                          if (!parentEl) return;
                          const rect = parentEl.getBoundingClientRect();
                          const cx = rect.left + rect.width / 2;
                          const cy = rect.top + rect.height / 2;
                          const dx = e.clientX - cx;
                          const dy = e.clientY - cy;
                          transformOriginRef.current = {
                            centerX: cx,
                            centerY: cy,
                            startDist: Math.max(12, Math.hypot(dx, dy)),
                            startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
                            initialScale: ov.scale,
                            initialRotation: ov.rotation,
                          };
                          setTransformingOverlayId(ov.id);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const t = e.touches[0];
                          const parentEl = e.currentTarget.parentElement;
                          if (!t || !parentEl) return;
                          const rect = parentEl.getBoundingClientRect();
                          const cx = rect.left + rect.width / 2;
                          const cy = rect.top + rect.height / 2;
                          const dx = t.clientX - cx;
                          const dy = t.clientY - cy;
                          transformOriginRef.current = {
                            centerX: cx,
                            centerY: cy,
                            startDist: Math.max(12, Math.hypot(dx, dy)),
                            startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
                            initialScale: ov.scale,
                            initialRotation: ov.rotation,
                          };
                          setTransformingOverlayId(ov.id);
                        }}
                        className=" -bottom-3 -right-3 w-6 h-6 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg border border-white cursor-nwse-resize"
                        title="Drag to resize & rotate sticker"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Video Play/Pause & Live Timecode Badges */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-mono text-emerald-300 border border-white/10">
              <Scissors className="w-3.5 h-3.5" />
              <span>
                {formatTrimTime(trimStart)} – {formatTrimTime(trimEnd)} (
                {Math.max(0.5, (trimEnd - trimStart) / playbackRate).toFixed(1)}s @ {playbackRate}x)
              </span>
            </div>

            <div className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-mono text-white border border-white/10">
              Playhead: {formatTrimTime(videoCurrentTime)} / {formatTrimTime(videoDuration)}
            </div>

            <button
              type="button"
              onClick={() => {
                const vid = videoPreviewRef.current;
                if (!vid) return;
                if (vid.paused) {
                  vid.play();
                  setIsVideoPlaying(true);
                } else {
                  vid.pause();
                  setIsVideoPlaying(false);
                }
              }}
              className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/15"
            >
              {isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Compare Original Badge */}
        {isComparingOriginal && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold uppercase tracking-wider shadow-lg">
            Showing Original Unedited Media
          </div>
        )}
      </div>

      {/* ====================================================================
          BOTTOM STUDIO CONTROLS & CONTEXTUAL TOOL PANEL (Viewport-Safe)
         ==================================================================== */}
      <div className="bg-slate-950 border-t border-slate-800/90 px-3 py-2.5 space-y-2.5 shrink-0 max-h-[46dvh] overflow-y-auto">
        {/* Quick Sample Media Switcher + Mode Toggle */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-slate-900">
          <div className="flex items-center gap-1 shrink-0">
            {mode !== 'profile' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMediaType('photo');
                    if (sourceUrl.endsWith('.mp4')) setSourceUrl(SAMPLE_EDITOR_PHOTOS[0].url);
                    setActiveTool('adjust');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                    mediaType === 'photo'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaType('video');
                    if (!sourceUrl.endsWith('.mp4') && !sourceUrl.startsWith('blob:')) {
                      setSourceUrl(SAMPLE_EDITOR_VIDEOS[0].url);
                    }
                    setActiveTool('video');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                    mediaType === 'video'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="w-3 h-3" />
                  <span>Video</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(mediaType === 'photo' ? SAMPLE_EDITOR_PHOTOS : SAMPLE_EDITOR_VIDEOS).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setSourceUrl(item.url)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap shrink-0 ${
                  sourceUrl === item.url
                    ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-900/70 text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* TOOL-SPECIFIC INSPECTOR PANEL */}
        <div className="min-h-[82px] flex flex-col justify-center">
          {/* 1. CROP, ROTATE & ASPECT RATIO */}
          {activeTool === 'crop' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 shrink-0">
                  {(
                    [
                      { id: 'free', label: 'Free' },
                      { id: 'circle', label: 'Circle Avatar' },
                      { id: '1:1', label: '1:1 Square' },
                      { id: '4:5', label: '4:5 Portrait' },
                      { id: '16:9', label: '16:9 Wide' },
                      { id: '9:16', label: '9:16 Story' },
                    ] as const
                  ).map((asp) => (
                    <button
                      key={asp.id}
                      type="button"
                      onClick={() => handleSelectAspectPreset(asp.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                        aspectPreset === asp.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {asp.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200"
                    title="Rotate 90° Left"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200"
                    title="Rotate 90° Right"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipH((f) => !f)}
                    className={`p-1.5 rounded-lg ${
                      flipH ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-200'
                    }`}
                    title="Flip Horizontal"
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipV((f) => !f)}
                    className={`p-1.5 rounded-lg ${
                      flipV ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-200'
                    }`}
                    title="Flip Vertical"
                  >
                    <FlipVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <label className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 shrink-0">Zoom {zoom.toFixed(1)}x</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
                <label className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 shrink-0">Angle {straightenAngle}°</span>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={straightenAngle}
                    onChange={(e) => setStraightenAngle(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>
                <label className="col-span-2 sm:col-span-1 flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 shrink-0">Crop Size {cropBox.w}%</span>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    step={2}
                    value={cropBox.w}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const offset = Math.round((100 - val) / 2);
                      setCropBox({ x: offset, y: offset, w: val, h: val });
                    }}
                    className="w-full accent-emerald-400"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 2. PRO COLOR GRADING & ADJUSTMENTS */}
          {activeTool === 'adjust' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">
                  Lightroom-Grade Color & Clarity Controls
                </span>
                <button
                  type="button"
                  onClick={handleAutoEnhance}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-500/30"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Auto-Enhance ✨</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-slate-400 w-14 shrink-0">Bright</span>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <Contrast className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-slate-400 w-14 shrink-0">Contrast</span>
                  <input
                    type="range"
                    min={50}
                    max={160}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <Palette className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span className="text-slate-400 w-14 shrink-0">Vivid</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 w-16 shrink-0">Warmth</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={warmth}
                    onChange={(e) => setWarmth(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 w-16 shrink-0">Vignette</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={vignette}
                    onChange={(e) => setVignette(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </label>

                <label className="flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-xl">
                  <span className="text-slate-400 w-16 shrink-0">Soft Blur</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={edgeBlur}
                    onChange={(e) => setEdgeBlur(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 3. ONE-TAP CINEMA FILTERS */}
          {activeTool === 'filters' && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {CINEMA_FILTERS.map((f) => {
                const active = selectedFilterId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFilterId(f.id)}
                    className={`px-3 py-2 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-1.5 shrink-0 transition-all ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 scale-105'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className={`w-10 h-6 rounded-lg bg-gradient-to-br ${f.badgeColor}`} />
                    <span className="text-[11px]">{f.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 4. FREEHAND BRUSH, NEON PEN, ARROWS & CALLOUT SHAPES */}
          {activeTool === 'draw' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 shrink-0">
                  {(
                    [
                      { id: 'pen', label: 'Pen' },
                      { id: 'neon', label: 'Neon Glow' },
                      { id: 'highlighter', label: 'Marker' },
                      { id: 'arrow', label: '↗ Arrow' },
                      { id: 'rect', label: '▭ Box' },
                      { id: 'circle', label: '◯ Circle' },
                    ] as const
                  ).map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => setStrokeMode(bm.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                        strokeMode === bm.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {bm.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
                  <span>Size</span>
                  <input
                    type="range"
                    min={2}
                    max={26}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-20 accent-emerald-400"
                  />
                </label>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {BRUSH_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrushColor(c)}
                    className={`w-6 h-6 rounded-full border-2 shrink-0 transition-transform ${
                      brushColor === c ? 'border-white scale-115' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline">
                  Drag directly on the image to draw or point with arrows
                </span>
              </div>
            </div>
          )}

          {/* 5. PRIVACY BLUR / PIXELATE REDACTION BRUSH */}
          {activeTool === 'privacy' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'pixelate', label: '▦ Mosaic Pixelate' },
                      { id: 'blur', label: '🌫️ Frosted Blur' },
                      { id: 'blackout', label: '⬛ Blackout Bar' },
                    ] as const
                  ).map((pm) => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setRedactMode(pm.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                        redactMode === pm.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Strength</span>
                  <input
                    type="range"
                    min={6}
                    max={28}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-24 accent-emerald-400"
                  />
                </label>
              </div>
              <p className="text-[11px] text-emerald-300/90">
                🛡️ Drag over faces, phone numbers, license plates, or private text on the image to permanently redact before sending.
              </p>
            </div>
          )}

          {/* 6. RICH TEXT & CALLOUT OVERLAYS */}
          {activeTool === 'text' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newTextDraft}
                  onChange={(e) => setNewTextDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTextOverlay();
                  }}
                  placeholder="Type text banner or callout…"
                  className="flex-1 h-8 rounded-xl bg-slate-900 border border-slate-800 px-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const fonts: Array<OverlayItem['fontFamily']> = [
                      'sans',
                      'serif',
                      'mono',
                      'display',
                      'cursive',
                    ];
                    setTextFont(fonts[(fonts.indexOf(textFont) + 1) % fonts.length]);
                  }}
                  className="h-8 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200"
                >
                  Font: {textFont}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const styles: Array<OverlayItem['bgStyle']> = [
                      'solid',
                      'glass',
                      'outline',
                      'none',
                    ];
                    setTextBgStyle(styles[(styles.indexOf(textBgStyle) + 1) % styles.length]);
                  }}
                  className="h-8 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-cyan-300"
                >
                  Pill: {textBgStyle}
                </button>
                <button
                  type="button"
                  onClick={handleAddTextOverlay}
                  className="h-8 px-3 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5">
                  {BRUSH_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setTextColor(c);
                        if (selectedOverlayId) {
                          setOverlays((prev) =>
                            prev.map((o) => (o.id === selectedOverlayId ? { ...o, color: c } : o))
                          );
                        }
                      }}
                      className={`w-5 h-5 rounded-full border ${
                        textColor === c ? 'border-white scale-115' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {selectedOverlay && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400">Size</span>
                    <input
                      type="range"
                      min={0.5}
                      max={2.4}
                      step={0.1}
                      value={selectedOverlay.scale}
                      onChange={(e) => {
                        const sc = Number(e.target.value);
                        setOverlays((prev) =>
                          prev.map((o) =>
                            o.id === selectedOverlay.id ? { ...o, scale: sc } : o
                          )
                        );
                      }}
                      className="w-20 accent-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setOverlays((prev) => prev.filter((o) => o.id !== selectedOverlay.id));
                        setSelectedOverlayId(null);
                      }}
                      className="p-1 rounded-lg bg-rose-500/20 text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. STICKERS, 3D CARTOON STICKERS, EMOJIS, PROPS & SMART STAMPS */}
          {activeTool === 'stickers' && (
            <div className="space-y-2">
              {/* Active Selected Sticker Resize, Rotate, Flip & Reposition Toolbar */}
              {selectedOverlay && (
                <div className="p-2 rounded-xl bg-slate-900/95 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold">
                      Selected: {selectedOverlay.text.slice(0, 14)}
                    </span>
                    <label className="flex items-center gap-1.5 text-slate-300">
                      <span>Size {selectedOverlay.scale.toFixed(1)}x</span>
                      <input
                        type="range"
                        min={0.35}
                        max={3.2}
                        step={0.05}
                        value={selectedOverlay.scale}
                        onChange={(e) => {
                          const sc = Number(e.target.value);
                          setOverlays((prev) =>
                            prev.map((o) =>
                              o.id === selectedOverlay.id ? { ...o, scale: sc } : o
                            )
                          );
                        }}
                        className="w-20 accent-emerald-400"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-300">
                      <span>Rotate {selectedOverlay.rotation}°</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={5}
                        value={selectedOverlay.rotation}
                        onChange={(e) => {
                          const rot = Number(e.target.value);
                          setOverlays((prev) =>
                            prev.map((o) =>
                              o.id === selectedOverlay.id ? { ...o, rotation: rot } : o
                            )
                          );
                        }}
                        className="w-20 accent-cyan-400"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setOverlays((prev) =>
                          prev.map((o) =>
                            o.id === selectedOverlay.id
                              ? { ...o, rotation: ((o.rotation - 45 + 180) % 360) - 180 }
                              : o
                          )
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Rotate -45°"
                    >
                      -45°
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOverlays((prev) =>
                          prev.map((o) =>
                            o.id === selectedOverlay.id
                              ? { ...o, rotation: ((o.rotation + 45 + 180) % 360) - 180 }
                              : o
                          )
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                      title="Rotate +45°"
                    >
                      +45°
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOverlays((prev) =>
                          prev.map((o) =>
                            o.id === selectedOverlay.id ? { ...o, flipH: !o.flipH } : o
                          )
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300"
                      title="Flip Sticker Horizontally"
                    >
                      Flip ⇄
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const clone: OverlayItem = {
                          ...selectedOverlay,
                          id: `ov_${Date.now()}`,
                          x: Math.min(0.88, selectedOverlay.x + 0.06),
                          y: Math.min(0.88, selectedOverlay.y + 0.06),
                        };
                        setOverlays((prev) => [...prev, clone]);
                        setSelectedOverlayId(clone.id);
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300"
                      title="Duplicate Sticker"
                    >
                      + Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverlays((prev) =>
                          prev.filter((o) => o.id !== selectedOverlay.id)
                        );
                        setSelectedOverlayId(null);
                      }}
                      className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                      title="Delete Selected Sticker"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Sticker Category Sub-Tabs */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: '3d', label: '✨ 3D Stickers & Mascots' },
                      { id: 'emojis', label: '😎 Emojis (48+)' },
                      { id: 'props', label: '🕶️ Fun Props & Bubbles' },
                      { id: 'stamps', label: '🕒 Smart Stamps' },
                    ] as const
                  ).map((stTab) => (
                    <button
                      key={stTab.id}
                      type="button"
                      onClick={() => setStickerSubTab(stTab.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                        stickerSubTab === stTab.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {stTab.label}
                    </button>
                  ))}
                </div>

                {overlays.length > 0 && (
                  <span className="text-[10px] font-mono text-emerald-300 shrink-0 hidden sm:inline">
                    {overlays.length} layer{overlays.length === 1 ? '' : 's'} · Drag on preview to move
                  </span>
                )}
              </div>

              {/* Sub-Tab 1: 3D Cartoon Stickers & 3D Character Mascots */}
              {stickerSubTab === '3d' && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  {CARTOON_3D_STICKERS.map((stk) => (
                    <button
                      key={stk.id}
                      type="button"
                      onClick={() =>
                        handleAddStickerOrStamp(stk.emoji, 'sticker', stk.url)
                      }
                      className="px-2.5 py-1.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 flex items-center gap-2 shrink-0 group transition-transform hover:scale-105"
                      title={`Add 3D Sticker: ${stk.title}`}
                    >
                      <img
                        src={stk.url}
                        alt={stk.title}
                        className="w-9 h-9 object-contain drop-shadow"
                      />
                      <div className="text-left">
                        <div className="text-[10px] font-extrabold text-white whitespace-nowrap">
                          {stk.title}
                        </div>
                        <div className="text-[9px] text-slate-400 whitespace-nowrap">
                          {stk.subtitle}
                        </div>
                      </div>
                    </button>
                  ))}
                  {CARTOON_3D_AVATARS.slice(0, 8).map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() =>
                        handleAddStickerOrStamp(
                          av.label.split('·')[0].trim(),
                          'sticker',
                          av.url
                        )
                      }
                      className="p-1.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 flex items-center gap-1.5 shrink-0 transition-transform hover:scale-105"
                      title={`Add 3D Mascot Sticker: ${av.label}`}
                    >
                      <img
                        src={av.url}
                        alt={av.label}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                      <span className="text-[10px] font-bold text-cyan-300 pr-1 whitespace-nowrap">
                        {av.label.split('·')[0].trim()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-Tab 2: Rich Emoji Grid */}
              {stickerSubTab === 'emojis' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {QUICK_STICKERS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => handleAddStickerOrStamp(em, 'sticker')}
                      className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/40 flex items-center justify-center text-xl shrink-0 hover:scale-115 transition-transform"
                      title={`Add ${em} emoji to ${mediaType}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-Tab 3: Wearable Face Props & Comic Speech Bubbles */}
              {stickerSubTab === 'props' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {FUN_PROPS_AND_BUBBLES.map((prop) => (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() =>
                        handleAddStickerOrStamp(
                          prop.text,
                          prop.text.length > 4 ? 'stamp' : 'sticker'
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/50 text-xs font-bold text-white flex items-center gap-1.5 shrink-0"
                    >
                      <span className="text-base">{prop.text.split(' ')[0]}</span>
                      <span className="text-[11px] text-slate-300">{prop.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-Tab 4: Smart Dynamic Stamps */}
              {stickerSubTab === 'stamps' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {SMART_STAMPS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleAddStickerOrStamp(st.getText(), 'stamp')}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-emerald-300 whitespace-nowrap shrink-0"
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. FRAMES & WATERMARK STUDIO */}
          {activeTool === 'frame' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'none', label: 'No Frame' },
                    { id: 'polaroid', label: 'Polaroid Card' },
                    { id: 'cinema', label: 'Cinema 2.35:1' },
                    { id: 'neon', label: 'Neon Border' },
                    { id: 'matte', label: 'Gallery Matte' },
                  ] as const
                ).map((fr) => (
                  <button
                    key={fr.id}
                    type="button"
                    onClick={() => setFrameStyle(fr.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 ${
                      frameStyle === fr.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {fr.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Optional corner signature / watermark (e.g. Shot on Simple · @alex)…"
                className="w-full h-8 rounded-xl bg-slate-900 border border-slate-800 px-3 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* 9. PRO VIDEO TRIM, SPEED, AUDIO & FRAME EXTRACTOR */}
          {activeTool === 'video' && (
            <div className="space-y-2">
              {/* Precision Start & End Trim Controls + Snap to Playhead */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="flex flex-col gap-1 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Start: {formatTrimTime(trimStart)}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, Math.round((trimStart - 0.5) * 10) / 10);
                          setTrimStart(next);
                          if (videoPreviewRef.current) videoPreviewRef.current.currentTime = next;
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-200"
                        title="Nudge start -0.5s"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(
                            trimEnd - 0.5,
                            Math.round((trimStart + 0.5) * 10) / 10
                          );
                          setTrimStart(next);
                          if (videoPreviewRef.current) videoPreviewRef.current.currentTime = next;
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-200"
                        title="Nudge start +0.5s"
                      >
                        +0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(
                            0,
                            Math.min(trimEnd - 0.5, Math.round(videoCurrentTime * 10) / 10)
                          );
                          setTrimStart(next);
                          showToast(`Set Start Point to playhead (${formatTrimTime(next)})`);
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold"
                        title="Snap Trim Start to current playhead position"
                      >
                        [ Set Here
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.5, Math.round((trimEnd - 0.5) * 10) / 10)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTrimStart(val);
                      setVideoCurrentTime(val);
                      if (videoPreviewRef.current) videoPreviewRef.current.currentTime = val;
                    }}
                    className="w-full accent-emerald-400"
                  />
                </div>

                <div className="flex flex-col gap-1 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-cyan-300 font-bold flex items-center gap-1">
                      <Scissors className="w-3.5 h-3.5" />
                      <span>End: {formatTrimTime(trimEnd)}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(
                            trimStart + 0.5,
                            Math.round((trimEnd - 0.5) * 10) / 10
                          );
                          setTrimEnd(next);
                          if (videoPreviewRef.current) videoPreviewRef.current.currentTime = next;
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-200"
                        title="Nudge end -0.5s"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(
                            videoDuration,
                            Math.round((trimEnd + 0.5) * 10) / 10
                          );
                          setTrimEnd(next);
                          if (videoPreviewRef.current) videoPreviewRef.current.currentTime = next;
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-200"
                        title="Nudge end +0.5s"
                      >
                        +0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(
                            videoDuration,
                            Math.max(trimStart + 0.5, Math.round(videoCurrentTime * 10) / 10)
                          );
                          setTrimEnd(next);
                          showToast(`Set End Point to playhead (${formatTrimTime(next)})`);
                        }}
                        className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold"
                        title="Snap Trim End to current playhead position"
                      >
                        Set Here ]
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={Math.min(videoDuration, Math.round((trimStart + 0.5) * 10) / 10)}
                    max={Math.max(1, videoDuration)}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTrimEnd(val);
                      setVideoCurrentTime(val);
                      if (videoPreviewRef.current) {
                        videoPreviewRef.current.currentTime = Math.max(trimStart, val - 0.1);
                      }
                    }}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Quick Clip Duration Presets + Speed & Frame Tools */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Quick Clip Duration Presets */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] text-slate-400 font-semibold mr-0.5">Clip Preset:</span>
                  {[
                    { label: '5s Clip', len: 5 },
                    { label: '10s Clip', len: 10 },
                    { label: '15s Story', len: 15 },
                    { label: 'Full', len: videoDuration },
                  ].map((preset) => {
                    const targetEnd = Math.min(videoDuration, trimStart + preset.len);
                    const isCurrent =
                      preset.label === 'Full'
                        ? trimStart === 0 && Math.abs(trimEnd - videoDuration) < 0.2
                        : Math.abs(trimEnd - trimStart - preset.len) < 0.2;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (preset.label === 'Full') {
                            setTrimStart(0);
                            setTrimEnd(videoDuration);
                          } else {
                            const newStart =
                              trimStart + preset.len <= videoDuration ? trimStart : 0;
                            setTrimStart(newStart);
                            setTrimEnd(Math.min(videoDuration, newStart + preset.len));
                          }
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap ${
                          isCurrent
                            ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-300'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Playback Speed Selector */}
                <div className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-amber-400 mr-0.5" />
                  {[0.5, 0.75, 1, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackRate(spd)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                        playbackRate === spd
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {/* Loop Segment + Extract Frame */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLoopTrimSegment((l) => !l)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 ${
                      loopTrimSegment
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900 border border-slate-800 text-slate-400'
                    }`}
                    title="Loop trimmed range continuously"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Loop Cut</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExtractVideoFrameAsPhoto}
                    className="px-2.5 py-1 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-semibold flex items-center gap-1"
                    title="Extract current video frame as editable high-res photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Grab Frame</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ====================================================================
            TOOL NAVIGATION TABS (Horizontally Scrollable — Never Cut Off)
           ==================================================================== */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 border-t border-slate-900">
          {(
            [
              ...(mediaType === 'video'
                ? [{ id: 'video' as ToolTab, label: 'Trim & Speed', icon: Scissors }]
                : []),
              { id: 'crop' as ToolTab, label: 'Crop & Rotate', icon: Crop },
              { id: 'adjust' as ToolTab, label: 'Color Grade', icon: Sliders },
              { id: 'filters' as ToolTab, label: 'Filters', icon: Sparkles },
              { id: 'draw' as ToolTab, label: 'Draw & Arrows', icon: PenTool },
              { id: 'privacy' as ToolTab, label: 'Privacy Blur', icon: ShieldAlert },
              { id: 'text' as ToolTab, label: 'Text Layer', icon: Type },
              { id: 'stickers' as ToolTab, label: 'Stickers & Stamps', icon: Smile },
              { id: 'frame' as ToolTab, label: 'Frames', icon: Frame },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTool === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTool(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ====================================================================
            BOTTOM CAPTION BAR + HD / VIEW-ONCE TOGGLES + APPLY / SEND BUTTON
           ==================================================================== */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-900">
          {mode !== 'profile' && (
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3.5 py-1.5">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={
                  recipientName
                    ? `Add a caption for ${recipientName}…`
                    : 'Add a caption…'
                }
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none"
              />

              {/* HD Quality Toggle Pill */}
              <button
                type="button"
                onClick={() =>
                  setQuality((q) =>
                    q === 'compress' ? 'hd' : q === 'hd' ? 'original' : 'compress'
                  )
                }
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${
                  quality === 'hd' || quality === 'original'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
                title="Cycle Media Quality (Standard / HD / Original)"
              >
                {quality === 'compress' ? 'STD' : quality.toUpperCase()}
              </button>

              {/* View Once Toggle Pill */}
              <button
                type="button"
                onClick={() => setViewOnce((v) => !v)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                  viewOnce
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle View-Once self-destructing media"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>1x</span>
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={isExporting}
            onClick={handleConfirmApply}
            className="ml-auto h-10 px-5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 shrink-0"
          >
            {mode === 'profile' ? (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Save Profile Photo</span>
              </>
            ) : mode === 'status' ? (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Apply to Status</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send {mediaType === 'video' ? 'Video' : 'Photo'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
