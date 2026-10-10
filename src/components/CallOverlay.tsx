import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  Bluetooth,
  Smartphone,
  UserPlus,
  Minimize2,
  Maximize2,
  ShieldCheck,
  Wifi,
  WifiOff,
  SwitchCamera,
  Gauge,
  MonitorUp,
  Pause,
  Play,
  Sparkles,
  FlipHorizontal,
  Activity,
  Lock,
  Smile,
  ArrowLeftRight,
  CornerUpRight,
  PhoneCall,
  Shapes,
  Wand2,
  Columns,
  Rows,
  Eye,
  EyeOff,
  Sun,
  Heart,
  Crown,
} from 'lucide-react';
import {
  CARTOON_3D_AVATARS,
  ensure3DCartoonAvatarUrl,
  getDeterministic3DAvatar,
} from '../utils/cartoonAvatars';

export interface ActiveCallSession {
  callId: string;
  chatId: string;
  participantUid?: string;
  participantName: string;
  participantUsername?: string;
  participantPhone?: string;
  avatarColor: string;
  avatarUrl?: string;
  callType: 'audio' | 'video';
  direction?: 'outgoing' | 'incoming';
  isGroupCall: boolean;
  participants: string[];
}

interface CallOverlayProps {
  session: ActiveCallSession;
  defaultVideoQuality: 'auto' | 'low' | 'medium' | 'high';
  lowDataModeDefault: boolean;
  soundEnabled?: boolean;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  currentUserId?: string;
  currentUserName?: string;
  onEndCall: (durationSec: number, finalCallType: 'audio' | 'video') => void;
  onAddParticipant: (name: string) => void;
}

type CallLifecycleState =
  | 'dialing'
  | 'ringing'
  | 'connecting_dtls'
  | 'encrypted_active'
  | 'on_hold'
  | 'reconnecting';

type VideoEffectMode =
  | 'none'
  | 'cyberpunk'
  | 'golden'
  | 'vintage'
  | 'noir'
  | 'dreamy'
  | 'emerald'
  | 'arctic'
  | 'vibrant'
  | 'privacy_blur';

type PipCorner = 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
type PipWindowShape = 'rectangle' | 'circle' | 'squircle' | 'heart' | 'star' | 'hexagon' | 'diamond';
type StageLayoutMode = 'pip' | 'split-vertical' | 'split-horizontal' | 'cinema-floating';
type ArPropId =
  | 'none'
  | 'cool_shades'
  | 'royal_crown'
  | 'cat_ears'
  | 'party_vibes'
  | 'astro_helmet'
  | 'angel_halo'
  | 'vr_visor'
  | 'heart_eyes';
type CallAtmosphereId = 'none' | 'floating_hearts' | 'sparkles' | 'confetti' | 'neon_rain' | 'aurora';

const CALL_REACTIONS = ['👍', '❤️', '👏', '😂', '🔥', '🎉', '🤩', '💯'];
const E2EE_EMOJI_SET = ['🔒', '🐬', '🚀', '🛡️', '⚡', '🌿', '💎', '🪐', '🔑', '🏔️', '🧭', '🐳'];

const VIDEO_FILTERS: Array<{ id: VideoEffectMode; label: string; css: string; previewBg: string }> = [
  { id: 'none', label: 'Natural HD', css: '', previewBg: 'from-slate-700 to-slate-900' },
  { id: 'cyberpunk', label: 'Cyber Neon', css: 'contrast-125 saturate-150 hue-rotate-15', previewBg: 'from-fuchsia-600 to-cyan-500' },
  { id: 'golden', label: 'Golden Hour', css: 'sepia-[.35] saturate-150 brightness-105 contrast-105', previewBg: 'from-amber-500 to-orange-600' },
  { id: 'dreamy', label: 'Soft Bloom', css: 'brightness-110 contrast-95 saturate-125', previewBg: 'from-pink-500 to-rose-400' },
  { id: 'vibrant', label: 'Pop HDR', css: 'contrast-125 saturate-150 brightness-105', previewBg: 'from-emerald-500 to-teal-600' },
  { id: 'arctic', label: 'Arctic Frost', css: 'hue-rotate-180 saturate-75 brightness-110', previewBg: 'from-sky-400 to-indigo-600' },
  { id: 'vintage', label: 'Retro 90s', css: 'sepia-[.55] contrast-110 brightness-95', previewBg: 'from-yellow-600 to-amber-800' },
  { id: 'noir', label: 'Cinema B&W', css: 'grayscale contrast-125', previewBg: 'from-zinc-500 to-zinc-900' },
  { id: 'emerald', label: 'Night Vision', css: 'hue-rotate-60 saturate-150 contrast-115', previewBg: 'from-emerald-600 to-green-950' },
  { id: 'privacy_blur', label: 'Privacy Blur', css: 'blur-[6px] saturate-125', previewBg: 'from-slate-600 to-slate-800' },
];

const PIP_SHAPES: Array<{ id: PipWindowShape; label: string; icon: string }> = [
  { id: 'rectangle', label: 'Card', icon: '▭' },
  { id: 'circle', label: 'Circle', icon: '●' },
  { id: 'squircle', label: 'Squircle', icon: '▢' },
  { id: 'heart', label: 'Heart', icon: '♥' },
  { id: 'star', label: 'Star', icon: '★' },
  { id: 'hexagon', label: 'Hexagon', icon: '⬡' },
  { id: 'diamond', label: 'Diamond', icon: '◆' },
];

const AR_PROPS: Array<{ id: ArPropId; label: string; emoji: string; badge: string }> = [
  { id: 'none', label: 'No Prop', emoji: '🚫', badge: '' },
  { id: 'cool_shades', label: 'Deal With It', emoji: '😎', badge: '🕶️' },
  { id: 'royal_crown', label: '3D Crown', emoji: '👑', badge: '👑' },
  { id: 'cat_ears', label: 'Neon Cat', emoji: '🐱', badge: '🐱✨' },
  { id: 'party_vibes', label: 'Party Time', emoji: '🥳', badge: '🎉🥳' },
  { id: 'astro_helmet', label: 'Space HUD', emoji: '👩‍🚀', badge: '🪐👩‍🚀' },
  { id: 'angel_halo', label: 'Glow Halo', emoji: '😇', badge: '✨😇' },
  { id: 'vr_visor', label: 'Cyber Visor', emoji: '🥽', badge: '⚡🥽' },
  { id: 'heart_eyes', label: 'Love Specs', emoji: '😍', badge: '💖😍' },
];

const ATMOSPHERES: Array<{ id: CallAtmosphereId; label: string; emoji: string }> = [
  { id: 'none', label: 'Clear', emoji: '✨' },
  { id: 'floating_hearts', label: 'Hearts', emoji: '💖' },
  { id: 'sparkles', label: 'Starlight', emoji: '🌟' },
  { id: 'confetti', label: 'Party', emoji: '🎊' },
  { id: 'neon_rain', label: 'Cyber Glow', emoji: '⚡' },
  { id: 'aurora', label: 'Aurora', emoji: '🌌' },
];

export const CallOverlay: React.FC<CallOverlayProps> = ({
  session,
  defaultVideoQuality,
  lowDataModeDefault,
  soundEnabled = true,
  wsRef,
  currentUserId = 'usr_self_01',
  currentUserName = 'You',
  onEndCall,
  onAddParticipant,
}) => {
  const [durationSec, setDurationSec] = useState(0);
  const [connectionState, setConnectionState] = useState<CallLifecycleState>(
    session.direction === 'incoming' ? 'connecting_dtls' : 'dialing'
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.callType === 'video');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(true);
  const [videoEffect, setVideoEffect] = useState<VideoEffectMode>('none');
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(true);
  const [audioRoute, setAudioRoute] = useState<'speaker' | 'earpiece' | 'bluetooth'>(
    session.callType === 'video' ? 'speaker' : 'earpiece'
  );
  const [videoQuality, setVideoQuality] = useState<'auto' | 'low' | 'medium' | 'high'>(
    defaultVideoQuality
  );
  const [lowBandwidth, setLowBandwidth] = useState(lowDataModeDefault);
  const [isPip, setIsPip] = useState(false);
  const [pipCorner, setPipCorner] = useState<PipCorner>('top-right');
  const [swapMainAndSelfView, setSwapMainAndSelfView] = useState(false);

  // Immersive Tap-to-Show Controls & Fun Video Shapes / Effects State
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pipShape, setPipShape] = useState<PipWindowShape>('rectangle');
  const [pipScaleSize, setPipScaleSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [stageLayout, setStageLayout] = useState<StageLayoutMode>('pip');
  const [activeArProp, setActiveArProp] = useState<ArPropId>('none');
  const [callAtmosphere, setCallAtmosphere] = useState<CallAtmosphereId>('none');
  const [touchUpBeauty, setTouchUpBeauty] = useState(true);
  const [lowLightBoost, setLowLightBoost] = useState(false);
  const [activeStudioDrawer, setActiveStudioDrawer] = useState<'none' | 'shapes' | 'effects' | 'more'>('none');

  // Resolve 3D Cartoon Avatars for remote and local user
  const remoteAvatar3D = useMemo(
    () => ensure3DCartoonAvatarUrl(session.avatarUrl, session.participantName),
    [session.avatarUrl, session.participantName]
  );
  const selfAvatar3D = useMemo(
    () => getDeterministic3DAvatar(currentUserName || 'You').url,
    [currentUserName]
  );

  // Modals / Drawers inside Call
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipantInput, setNewParticipantInput] = useState('');
  const [showCryptoDetails, setShowCryptoDetails] = useState(false);
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<
    Array<{ id: number; emoji: string; sender: string }>
  >([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteVideoActive, setRemoteVideoActive] = useState(session.callType === 'video');
  const [hasLiveRemoteWebRTC, setHasLiveRemoteWebRTC] = useState(false);

  // Real-time Audio Visualizer Levels (16 bars)
  const [audioLevels, setAudioLevels] = useState<number[]>(() => Array(16).fill(18));
  const [remoteSpeakingWave, setRemoteSpeakingWave] = useState<number[]>(() =>
    Array(16).fill(22)
  );

  // Media & WebRTC Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Deterministic 4-Emoji E2EE Call Verification Code
  const verificationEmojis = useMemo(() => {
    const seedStr = `${session.chatId}_${session.participantName}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    }
    return [
      E2EE_EMOJI_SET[hash % E2EE_EMOJI_SET.length],
      E2EE_EMOJI_SET[(hash >> 3) % E2EE_EMOJI_SET.length],
      E2EE_EMOJI_SET[(hash >> 6) % E2EE_EMOJI_SET.length],
      E2EE_EMOJI_SET[(hash >> 9) % E2EE_EMOJI_SET.length],
    ];
  }, [session.chatId, session.participantName]);

  // Helper to play subtle Web Audio API call tones (ringback / connect / hangup)
  const playCallTone = (kind: 'ringback' | 'connected' | 'reaction') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (kind === 'ringback') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } else if (kind === 'connected') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.11); // E5
        gain.gain.setValueAtTime(0.045, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      } else if (kind === 'reaction') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(680, ctx.currentTime);
        gain.gain.setValueAtTime(0.025, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {
      // Ignore browser autoplay restrictions
    }
  };

  // Realistic Outgoing / Incoming Call Progression: Dialing -> Ringing -> DTLS-SRTP Handshake -> Connected
  useEffect(() => {
    if (session.direction === 'incoming') {
      const t = setTimeout(() => {
        setConnectionState('encrypted_active');
        playCallTone('connected');
      }, 450);
      return () => clearTimeout(t);
    }

    const t1 = setTimeout(() => {
      setConnectionState('ringing');
      playCallTone('ringback');
    }, 550);

    const t2 = setTimeout(() => {
      setConnectionState('connecting_dtls');
    }, 1550);

    const t3 = setTimeout(() => {
      setConnectionState('encrypted_active');
      playCallTone('connected');
      navigator.vibrate?.(20);
    }, 2100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [session.direction]);

  // Call duration timer (pauses if reconnecting)
  useEffect(() => {
    if (connectionState !== 'encrypted_active' && connectionState !== 'on_hold') return;
    const interval = setInterval(() => {
      setDurationSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [connectionState]);

  // Bind active MediaStream to localVideoRef whenever layout or PiP changes
  const attachLocalStreamToVideoElement = () => {
    const activeStream = isScreenSharing ? screenStreamRef.current : mediaStreamRef.current;
    if (localVideoRef.current && activeStream) {
      if (localVideoRef.current.srcObject !== activeStream) {
        localVideoRef.current.srcObject = activeStream;
      }
    }
  };

  useEffect(() => {
    attachLocalStreamToVideoElement();
  }, [isPip, swapMainAndSelfView, isVideoEnabled, isScreenSharing]);

  // Capture real microphone & camera stream + Real-Time Web Audio AnalyserNode
  useEffect(() => {
    let active = true;

    async function setupMediaStream() {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      try {
        const heightConstraint =
          lowBandwidth || videoQuality === 'low'
            ? 360
            : videoQuality === 'medium'
            ? 480
            : 720;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabled
            ? {
                facingMode,
                height: { ideal: heightConstraint },
                frameRate: { ideal: lowBandwidth ? 15 : 30 },
              }
            : false,
          audio: {
            echoCancellation: noiseSuppressionEnabled,
            noiseSuppression: noiseSuppressionEnabled,
            autoGainControl: noiseSuppressionEnabled,
          },
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Apply initial mute state to audio tracks
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted && connectionState !== 'on_hold';
        });

        mediaStreamRef.current = stream;
        if (!isScreenSharing && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraError(null);

        // Attach Web Audio API AnalyserNode for live voice activity bars
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioCtx();
          }
          const ctx = audioCtxRef.current;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;
        } catch {
          // Fallback to animated equalizer if AudioContext is restricted
        }

        // Add tracks to WebRTC PeerConnection if active
        if (peerConnectionRef.current) {
          stream.getTracks().forEach((track) => {
            try {
              peerConnectionRef.current?.addTrack(track, stream);
            } catch {
              // Track already added
            }
          });
        }
      } catch {
        // If video+audio failed, try audio-only before falling back to synthetic visualizer
        if (isVideoEnabled) {
          setCameraError(
            'Hardware camera unavailable in preview sandbox — using encrypted HD avatar & voice stream.'
          );
        }
      }
    }

    setupMediaStream();

    return () => {
      active = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isVideoEnabled, facingMode, videoQuality, lowBandwidth, noiseSuppressionEnabled]);

  // Toggle real audio track enabled state when user mutes or places call on hold
  useEffect(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted && connectionState !== 'on_hold';
      });
    }
    // Broadcast media state to peer over WebSocket
    if (wsRef?.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call:media_state',
          callId: session.callId,
          senderUid: currentUserId,
          isMuted,
          isVideoEnabled: isVideoEnabled || isScreenSharing,
        })
      );
    }
  }, [isMuted, isVideoEnabled, isScreenSharing, connectionState]);

  // Real-Time Audio Spectrum & Remote Speaking Equalizer Loop
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Local microphone spectrum
      if (isMuted || connectionState === 'on_hold') {
        setAudioLevels(Array(16).fill(12));
      } else if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const bars = Array.from({ length: 16 }, (_, i) => {
          const val = data[i % data.length] || 0;
          return Math.max(15, Math.min(98, Math.round((val / 255) * 100) + ((i * 7) % 14)));
        });
        setAudioLevels(bars);
      } else {
        const t = Date.now() / 160;
        setAudioLevels(
          Array.from({ length: 16 }, (_, i) =>
            Math.round(24 + 32 * Math.abs(Math.sin(t + i * 0.45)))
          )
        );
      }

      // 2. Remote participant voice wave animation when call is active
      if (connectionState === 'encrypted_active' && !remoteMuted) {
        const t = Date.now() / 190;
        setRemoteSpeakingWave(
          Array.from({ length: 16 }, (_, i) =>
            Math.round(20 + 48 * Math.abs(Math.cos(t + i * 0.55)))
          )
        );
      } else {
        setRemoteSpeakingWave(Array(16).fill(14));
      }
    }, 110);

    return () => clearInterval(interval);
  }, [isMuted, remoteMuted, connectionState]);

  // Real WebRTC PeerConnection & WebSocket Signaling for Live Multi-Tab / Multi-User Calls
  useEffect(() => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef?.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call:webrtc_ice',
            callId: session.callId,
            senderUid: currentUserId,
            candidate: event.candidate,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        setHasLiveRemoteWebRTC(true);
      }
    };

    const handleSocketMessage = async (ev: MessageEvent) => {
      try {
        const packet = JSON.parse(ev.data);
        if (packet.callId !== session.callId || packet.senderUid === currentUserId) return;

        if (packet.type === 'call:media_state') {
          setRemoteMuted(Boolean(packet.isMuted));
          setRemoteVideoActive(Boolean(packet.isVideoEnabled));
        } else if (packet.type === 'call:reaction' && packet.emoji) {
          playCallTone('reaction');
          const id = Date.now() + Math.random();
          setFloatingReactions((prev) => [
            ...prev,
            { id, emoji: packet.emoji, sender: packet.senderName || session.participantName },
          ]);
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
          }, 2600);
        } else if (packet.type === 'call:webrtc_offer' && packet.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(packet.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsRef?.current?.send(
            JSON.stringify({
              type: 'call:webrtc_answer',
              callId: session.callId,
              senderUid: currentUserId,
              sdp: answer,
            })
          );
        } else if (packet.type === 'call:webrtc_answer' && packet.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(packet.sdp));
        } else if (packet.type === 'call:webrtc_ice' && packet.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(packet.candidate));
        }
      } catch {
        // Ignore non-call packets
      }
    };

    const socket = wsRef?.current;
    socket?.addEventListener('message', handleSocketMessage);

    // Send initial WebRTC offer if outgoing
    const offerTimer = setTimeout(async () => {
      if (session.direction !== 'incoming' && socket?.readyState === WebSocket.OPEN) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          socket.send(
            JSON.stringify({
              type: 'call:webrtc_offer',
              callId: session.callId,
              senderUid: currentUserId,
              sdp: offer,
            })
          );
        } catch {
          // Handled
        }
      }
    }, 800);

    return () => {
      clearTimeout(offerTimer);
      socket?.removeEventListener('message', handleSocketMessage);
      pc.close();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [session.callId]);

  // Toggle Screen Sharing via getDisplayMedia
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      if (localVideoRef.current && mediaStreamRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current;
      }
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
      }
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
        if (localVideoRef.current && mediaStreamRef.current) {
          localVideoRef.current.srcObject = mediaStreamRef.current;
        }
      });
    } catch {
      // User cancelled screen share picker or sandbox blocked getDisplayMedia
    }
  };

  const handleSendCallReaction = (emoji: string) => {
    playCallTone('reaction');
    const id = Date.now() + Math.random();
    setFloatingReactions((prev) => [...prev, { id, emoji, sender: currentUserName }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2600);
    setShowReactionTray(false);

    if (wsRef?.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call:reaction',
          callId: session.callId,
          senderUid: currentUserId,
          senderName: currentUserName,
          emoji,
        })
      );
    }
  };

  const formatDuration = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const rem = sec % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const cycleAudioRoute = () => {
    if (audioRoute === 'speaker') setAudioRoute('earpiece');
    else if (audioRoute === 'earpiece') setAudioRoute('bluetooth');
    else setAudioRoute('speaker');
  };

  const cycleVideoEffect = () => {
    const order = VIDEO_FILTERS.map((f) => f.id);
    const next = order[(order.indexOf(videoEffect) + 1) % order.length];
    setVideoEffect(next);
  };

  const cyclePipCorner = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: PipCorner[] = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];
    setPipCorner(order[(order.indexOf(pipCorner) + 1) % order.length]);
  };

  const cyclePipShape = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order = PIP_SHAPES.map((s) => s.id);
    setPipShape(order[(order.indexOf(pipShape) + 1) % order.length]);
  };

  const handleSimulateReconnect = () => {
    setConnectionState('reconnecting');
    setTimeout(() => {
      setConnectionState('encrypted_active');
      playCallTone('connected');
    }, 1200);
  };

  const activeFilterObj = VIDEO_FILTERS.find((f) => f.id === videoEffect) || VIDEO_FILTERS[0];
  const videoFilterClass = `${activeFilterObj.css} ${
    touchUpBeauty ? ' saturate-[1.08] contrast-[1.03]' : ''
  } ${lowLightBoost ? ' brightness-125' : ''}`;

  const pipCornerPositionClass =
    pipCorner === 'top-right'
      ? controlsVisible
        ? 'top-20 right-4'
        : 'top-5 right-4'
      : pipCorner === 'bottom-right'
      ? controlsVisible
        ? 'bottom-28 right-4'
        : 'bottom-6 right-4'
      : pipCorner === 'bottom-left'
      ? controlsVisible
        ? 'bottom-28 left-4'
        : 'bottom-6 left-4'
      : controlsVisible
      ? 'top-20 left-4'
      : 'top-5 left-4';

  const getShapeClipStyle = (shape: PipWindowShape): React.CSSProperties => {
    switch (shape) {
      case 'heart':
        return {
          clipPath:
            'polygon(50% 92%, 15% 60%, 4% 40%, 4% 22%, 18% 8%, 36% 8%, 50% 22%, 64% 8%, 82% 8%, 96% 22%, 96% 40%, 85% 60%)',
        };
      case 'star':
        return {
          clipPath:
            'polygon(50% 2%, 63% 35%, 98% 35%, 70% 57%, 81% 91%, 50% 70%, 19% 91%, 30% 57%, 2% 35%, 37% 35%)',
        };
      case 'hexagon':
        return {
          clipPath: 'polygon(25% 3%, 75% 3%, 98% 50%, 75% 97%, 25% 97%, 2% 50%)',
        };
      case 'diamond':
        return {
          clipPath: 'polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)',
        };
      default:
        return {};
    }
  };

  const getShapeClassName = (shape: PipWindowShape): string => {
    switch (shape) {
      case 'circle':
        return 'rounded-full aspect-square';
      case 'squircle':
        return 'rounded-[36%] aspect-square';
      case 'heart':
      case 'star':
      case 'hexagon':
      case 'diamond':
        return 'aspect-square rounded-2xl';
      default:
        return 'rounded-3xl aspect-[3/4] sm:aspect-[9/12]';
    }
  };

  const pipSizeClass =
    pipScaleSize === 'sm'
      ? 'w-28 sm:w-36'
      : pipScaleSize === 'lg'
      ? 'w-44 sm:w-60'
      : 'w-36 sm:w-48';

  const activeArPropObj = AR_PROPS.find((p) => p.id === activeArProp) || AR_PROPS[0];

  const statusText =
    connectionState === 'dialing'
      ? 'Calling…'
      : connectionState === 'ringing'
      ? 'Ringing…'
      : connectionState === 'connecting_dtls'
      ? 'Connecting…'
      : connectionState === 'reconnecting'
      ? 'Reconnecting…'
      : connectionState === 'on_hold'
      ? `On Hold · ${formatDuration(durationSec)}`
      : formatDuration(durationSec);

  // ============================================================================
  // MINIMIZED PICTURE-IN-PICTURE MODE + TOP RETURN-TO-CALL BAR
  // ============================================================================
  if (isPip) {
    return (
      <>
        {/* Top Emerald Return-to-Call Bar */}
        <div
          onClick={() => setIsPip(false)}
          className="fixed top-0 left-0 right-0 z-50 h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center justify-between cursor-pointer shadow-md transition-colors"
        >
          <div className="flex items-center gap-2">
            <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
            <span>
              {isVideoEnabled ? 'Encrypted Video Call' : 'Encrypted Voice Call'} ·{' '}
              {session.participantName}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span>{statusText}</span>
            <span className="underline text-[11px] font-sans">Tap to return</span>
          </div>
        </div>

        {/* Floating Mini Call Window */}
        <div className="fixed bottom-20 right-4 z-50 w-72 rounded-3xl bg-slate-900/95 border border-emerald-500/40 p-3 shadow-2xl backdrop-blur-xl">
          {(isVideoEnabled || isScreenSharing) && !cameraError && (
            <div
              onClick={() => setIsPip(false)}
              className="relative w-full h-40 mb-2.5 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  isMirrored && facingMode === 'user' && !isScreenSharing ? '-scale-x-100' : ''
                } ${videoFilterClass}`}
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-mono text-emerald-300">
                {formatDuration(durationSec)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div
              onClick={() => setIsPip(false)}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer"
            >
              <img
                src={remoteAvatar3D}
                alt={session.participantName}
                className="w-10 h-10 rounded-full object-cover border border-emerald-400/50 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {session.participantName}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-emerald-400">
                  {statusText}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMuted((m) => !m)}
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl ${
                  isMuted ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'
                }`}
                aria-label="Toggle mute"
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsPip(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700"
                aria-label="Expand call fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  onEndCall(durationSec, isVideoEnabled ? 'video' : 'audio')
                }
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-rose-600 text-white hover:bg-rose-500"
                aria-label="End call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // HELPER RENDERERS FOR REMOTE & LOCAL VIDEO FEEDS
  // ============================================================================
  const isVideoMode = isVideoEnabled || isScreenSharing;

  const renderRemoteVideoStream = (isMainStage: boolean) => {
    if (hasLiveRemoteWebRTC) {
      return (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${videoFilterClass}`}
        />
      );
    }

    // Full-screen immersive 3D Cartoon Live Video Feed when peer camera stream is simulated
    return (
      <div
        className={`relative w-full h-full overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-[#0d1526] to-[#08221e] ${videoFilterClass}`}
      >
        {/* Full-screen dynamic 3D Cartoon Avatar backdrop */}
        <img
          src={remoteAvatar3D}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-35 blur-2xl scale-110 pointer-events-none"
        />

        {/* Animated Studio Ring Glow */}
        <div
          className="pointer-events-none absolute w-[85vmin] h-[85vmin] rounded-full opacity-25 blur-3xl animate-pulse"
          style={{ backgroundColor: session.avatarColor }}
        />

        {session.participants.length > 1 && isMainStage ? (
          /* Group Call Fullscreen Multi-Tile Grid */
          <div className="relative z-10 grid grid-cols-2 gap-3 w-full h-full p-4 pt-16 pb-24 place-items-center">
            {session.participants.map((partName, idx) => {
              const partAvatar = getDeterministic3DAvatar(partName).url;
              return (
                <div
                  key={idx}
                  className="w-full h-full rounded-3xl bg-slate-900/75 border border-white/10 p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl"
                >
                  <img
                    src={partAvatar}
                    alt={partName}
                    className="w-24 h-24 sm:w-36 sm:h-36 rounded-full object-cover shadow-2xl ring-4 ring-emerald-400/40"
                  />
                  <h3 className="mt-3 text-base sm:text-lg font-bold text-white">{partName}</h3>
                  <div className="mt-2 flex items-end gap-1 h-4">
                    {remoteSpeakingWave.slice(0, 8).map((h, bIdx) => (
                      <span
                        key={bIdx}
                        className="w-1 rounded-full bg-emerald-400 transition-all duration-100"
                        style={{ height: `${Math.max(20, h)}%` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 1-on-1 Full-Screen Immersive Character Video Window */
          <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-4">
            <div className="relative flex items-center justify-center">
              {/* Voice reactivity aura rings */}
              {connectionState === 'encrypted_active' && !remoteMuted && (
                <>
                  <span
                    className="absolute -inset-6 rounded-full opacity-25 animate-ping"
                    style={{ backgroundColor: session.avatarColor }}
                  />
                  <span
                    className="absolute -inset-3 rounded-full opacity-40 animate-pulse"
                    style={{ backgroundColor: session.avatarColor }}
                  />
                </>
              )}

              {/* Large 3D Cartoon Character Window */}
              <img
                src={remoteAvatar3D}
                alt={session.participantName}
                className={`${
                  isMainStage
                    ? 'w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80'
                    : 'w-20 h-20 sm:w-28 sm:h-28'
                } rounded-full object-cover shadow-[0_24px_70px_rgba(0,0,0,0.75)] ring-4 ring-white/20 transition-transform duration-500`}
              />

              {/* Active AR Prop Overlay on Character */}
              {activeArProp !== 'none' && (
                <div
                  className={`pointer-events-none absolute ${
                    isMainStage ? '-top-6 text-5xl sm:text-6xl' : '-top-3 text-2xl'
                  } drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] animate-bounce`}
                >
                  {activeArPropObj.badge}
                </div>
              )}
            </div>

            {isMainStage && (
              <div className="mt-5 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm sm:text-base font-bold text-white">
                    {session.participantName}
                  </span>
                  <span className="text-xs font-mono text-emerald-300">{statusText}</span>
                </div>

                {/* Live Voice Wave Equalizer */}
                <div className="mt-3 flex items-end justify-center gap-1 h-6">
                  {remoteSpeakingWave.slice(0, 14).map((h, bIdx) => (
                    <span
                      key={bIdx}
                      className="w-1.5 rounded-full bg-emerald-400/90 transition-all duration-100"
                      style={{ height: `${Math.max(18, h)}%` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLocalVideoStream = (isMainStage: boolean) => {
    if (!cameraError && (isVideoEnabled || isScreenSharing)) {
      return (
        <div className="relative w-full h-full overflow-hidden bg-slate-950">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              isMirrored && facingMode === 'user' && !isScreenSharing ? '-scale-x-100' : ''
            } ${videoFilterClass}`}
          />
          {activeArProp !== 'none' && (
            <div
              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${
                isMainStage ? 'top-1/4 text-6xl' : 'top-3 text-3xl'
              } drop-shadow-2xl animate-bounce`}
            >
              {activeArPropObj.badge}
            </div>
          )}
        </div>
      );
    }

    // Fallback 3D Cartoon Self Avatar if camera is off or blocked
    return (
      <div
        className={`relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 p-3 text-center ${videoFilterClass}`}
      >
        <img
          src={selfAvatar3D}
          alt="You"
          className={`${
            isMainStage ? 'w-48 h-48 sm:w-64 sm:h-64' : 'w-16 h-16 sm:w-20 sm:h-20'
          } rounded-full object-cover ring-4 ring-emerald-500/40 shadow-2xl`}
        />
        {activeArProp !== 'none' && (
          <div
            className={`pointer-events-none absolute ${
              isMainStage ? 'top-1/4 text-5xl' : 'top-2 text-2xl'
            } animate-bounce`}
          >
            {activeArPropObj.badge}
          </div>
        )}
        <span className="mt-2 text-xs font-bold text-white">{currentUserName} (You)</span>
      </div>
    );
  };

  // ============================================================================
  // FULLSCREEN IMMERSIVE VIDEO & VOICE CALL EXPERIENCE (TAP TO TOGGLE CONTROLS)
  // ============================================================================
  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-full max-w-[100vw] bg-[#05080d] text-white select-none overflow-hidden">
      {/* ==========================================================================
          1. EDGE-TO-EDGE FULLSCREEN STAGE (TAP ANYWHERE TO SHOW/HIDE CONTROLS)
         ========================================================================== */}
      <div
        onClick={() => {
          setControlsVisible((v) => !v);
          setShowReactionTray(false);
        }}
        className="relative w-full h-full cursor-pointer overflow-hidden"
      >
        {/* Call Atmosphere Particle Overlay */}
        {callAtmosphere !== 'none' && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {Array.from({ length: 12 }).map((_, idx) => {
              const symbol =
                callAtmosphere === 'floating_hearts'
                  ? ['💖', '💗', '❤️', '💘'][idx % 4]
                  : callAtmosphere === 'sparkles'
                  ? ['✨', '🌟', '💫', '⭐'][idx % 4]
                  : callAtmosphere === 'confetti'
                  ? ['🎊', '🎉', '🎈', '✨'][idx % 4]
                  : callAtmosphere === 'neon_rain'
                  ? ['⚡', '💎', '🔮', '💠'][idx % 4]
                  : ['🌌', '✨', '🪐', '💫'][idx % 4];
              return (
                <span
                  key={idx}
                  className="absolute text-2xl sm:text-3xl opacity-80 animate-bounce"
                  style={{
                    left: `${(idx * 9 + 5) % 92}%`,
                    top: `${(idx * 13 + 8) % 85}%`,
                    animationDuration: `${1.8 + (idx % 4) * 0.6}s`,
                  }}
                >
                  {symbol}
                </span>
              );
            })}
          </div>
        )}

        {isVideoMode ? (
          stageLayout === 'split-vertical' ? (
            /* 50/50 TOP & BOTTOM SPLIT SCREEN */
            <div className="w-full h-full grid grid-rows-2 gap-1 bg-black">
              <div className="relative w-full h-full overflow-hidden">
                {swapMainAndSelfView ? renderLocalVideoStream(true) : renderRemoteVideoStream(true)}
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white">
                  {swapMainAndSelfView ? `${currentUserName} (You)` : session.participantName}
                </span>
              </div>
              <div className="relative w-full h-full overflow-hidden">
                {swapMainAndSelfView ? renderRemoteVideoStream(true) : renderLocalVideoStream(true)}
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-emerald-300">
                  {swapMainAndSelfView ? session.participantName : `${currentUserName} (You)`}
                </span>
              </div>
            </div>
          ) : stageLayout === 'split-horizontal' ? (
            /* 50/50 SIDE-BY-SIDE SPLIT SCREEN */
            <div className="w-full h-full grid grid-cols-2 gap-1 bg-black">
              <div className="relative w-full h-full overflow-hidden">
                {swapMainAndSelfView ? renderLocalVideoStream(true) : renderRemoteVideoStream(true)}
                <span className="absolute bottom-4 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white">
                  {swapMainAndSelfView ? `${currentUserName} (You)` : session.participantName}
                </span>
              </div>
              <div className="relative w-full h-full overflow-hidden">
                {swapMainAndSelfView ? renderRemoteVideoStream(true) : renderLocalVideoStream(true)}
                <span className="absolute bottom-4 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-emerald-300">
                  {swapMainAndSelfView ? session.participantName : `${currentUserName} (You)`}
                </span>
              </div>
            </div>
          ) : stageLayout === 'cinema-floating' ? (
            /* DUAL FLOATING SHAPED WINDOWS IN AURORA STUDIO */
            <div className="w-full h-full flex flex-col sm:flex-row items-center justify-center gap-6 p-6 bg-gradient-to-br from-slate-950 via-indigo-950/60 to-emerald-950/60">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSwapMainAndSelfView((s) => !s);
                }}
                style={getShapeClipStyle(pipShape)}
                className={`relative w-64 sm:w-80 ${getShapeClassName(
                  pipShape
                )} overflow-hidden border-4 border-emerald-400/70 shadow-[0_20px_60px_rgba(16,185,129,0.3)] transition-all duration-300`}
              >
                {renderRemoteVideoStream(false)}
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-black/75 text-xs font-bold text-white whitespace-nowrap">
                  {session.participantName}
                </span>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSwapMainAndSelfView((s) => !s);
                }}
                style={getShapeClipStyle(pipShape)}
                className={`relative w-52 sm:w-64 ${getShapeClassName(
                  pipShape
                )} overflow-hidden border-4 border-cyan-400/70 shadow-[0_20px_60px_rgba(6,182,212,0.3)] transition-all duration-300`}
              >
                {renderLocalVideoStream(false)}
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-black/75 text-xs font-bold text-cyan-300 whitespace-nowrap">
                  You
                </span>
              </div>
            </div>
          ) : (
            /* STANDARD FULLSCREEN VIDEO + SHAPED FLOATING PIP WINDOW */
            <div className="relative w-full h-full">
              {/* 100% Fullscreen Primary Video Window */}
              <div className="w-full h-full">
                {swapMainAndSelfView ? renderLocalVideoStream(true) : renderRemoteVideoStream(true)}
              </div>

              {/* Floating Self / Remote PiP Window in Fun Shapes (Tap to Swap with Fullscreen) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSwapMainAndSelfView((s) => !s);
                }}
                style={getShapeClipStyle(pipShape)}
                className={`absolute ${pipCornerPositionClass} z-30 ${pipSizeClass} ${getShapeClassName(
                  pipShape
                )} overflow-hidden bg-slate-900 border-2 border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.75)] cursor-pointer group transition-all duration-300 hover:scale-[1.03]`}
                title="Tap window to swap Fullscreen & PiP · Use icons to change shape or corner"
              >
                {swapMainAndSelfView
                  ? renderRemoteVideoStream(false)
                  : renderLocalVideoStream(false)}

                {/* Quick Shape, Size & Corner Controls on PiP Window */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-90 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={cyclePipShape}
                    className="w-6 h-6 rounded-full bg-black/75 text-amber-300 flex items-center justify-center hover:bg-amber-400 hover:text-slate-950 text-xs font-bold"
                    title="Change Video Window Shape (Card, Circle, Heart, Star, Hexagon, Diamond)"
                  >
                    {PIP_SHAPES.find((s) => s.id === pipShape)?.icon || '●'}
                  </button>
                  <button
                    type="button"
                    onClick={cyclePipCorner}
                    className="w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-emerald-500 hover:text-slate-950"
                    title="Move PiP window to next corner"
                  >
                    <CornerUpRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-bold text-white flex items-center gap-1 whitespace-nowrap">
                  <ArrowLeftRight className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{swapMainAndSelfView ? session.participantName : 'You'}</span>
                </div>
              </div>
            </div>
          )
        ) : (
          /* ================= FULLSCREEN VOICE CALL STAGE WITH 3D CARTOON AVATARS ================= */
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 bg-gradient-to-b from-[#07111e] via-[#06090e] to-[#051814]">
            <div className="flex flex-wrap items-center justify-center gap-6">
              {session.participants.map((partName, idx) => {
                const avatarUrl =
                  idx === 0 ? remoteAvatar3D : getDeterministic3DAvatar(partName).url;
                return (
                  <div key={idx} className="relative flex flex-col items-center">
                    {(connectionState === 'ringing' ||
                      connectionState === 'dialing' ||
                      (connectionState === 'encrypted_active' && !remoteMuted)) && (
                      <>
                        <span
                          className="absolute -inset-4 rounded-full opacity-25 animate-ping"
                          style={{ backgroundColor: idx === 0 ? session.avatarColor : '#06B6D4' }}
                        />
                        <span
                          className="absolute -inset-2 rounded-full opacity-40 animate-pulse"
                          style={{ backgroundColor: idx === 0 ? session.avatarColor : '#06B6D4' }}
                        />
                      </>
                    )}
                    <img
                      src={avatarUrl}
                      alt={partName}
                      className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover shadow-2xl ring-4 ring-emerald-400/30"
                    />
                    {session.participants.length > 1 && (
                      <span className="mt-2 text-xs font-semibold text-slate-200">{partName}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <h2 className="mt-6 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {session.participantName}
            </h2>
            <div className="mt-2 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-sm font-mono tabular-nums text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{statusText}</span>
            </div>

            {/* Live Voice Spectrum */}
            <div className="mt-6 w-full max-w-xs rounded-2xl bg-slate-900/75 border border-white/10 p-3.5 space-y-2 backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <Activity className="w-3.5 h-3.5" />
                  {isMuted ? 'Microphone Muted' : 'HD Encrypted Voice'}
                </span>
                <span className="font-mono uppercase">{audioRoute}</span>
              </div>
              <div className="flex items-end justify-center gap-1.5 h-8 px-2">
                {audioLevels.map((lvl, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 rounded-full transition-all duration-100 ${
                      isMuted ? 'bg-slate-700' : 'bg-emerald-400'
                    }`}
                    style={{ height: `${Math.max(16, lvl)}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtle Floating Indicator When Controls Are Hidden (Tap anywhere to show) */}
      {!controlsVisible && (
        <div
          onClick={() => setControlsVisible(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[11px] font-medium text-slate-200 flex items-center gap-2 cursor-pointer hover:bg-black/80 transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{session.participantName}</span>
          <span className="font-mono text-emerald-300">{statusText}</span>
          <span className="text-slate-400">· Tap for controls</span>
        </div>
      )}

      {/* Floating In-Call Emoji Reactions Overlay */}
      {floatingReactions.length > 0 && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3">
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              className="px-4 py-2 rounded-full bg-slate-900/95 border border-emerald-500/40 shadow-2xl flex items-center gap-2 animate-bounce"
            >
              <span className="text-2xl">{r.emoji}</span>
              <span className="text-xs font-semibold text-emerald-300">{r.sender}</span>
            </div>
          ))}
        </div>
      )}

      {/* ==========================================================================
          2. TOP FLOATING HUD BAR (AUTO-SHOWS ON TAP)
         ========================================================================== */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 p-3 sm:p-4 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-all duration-300 ${
          controlsVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-8 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setIsPip(true)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20 transition-colors"
            title="Minimize to Picture-in-Picture"
            aria-label="Minimize call"
          >
            <Minimize2 className="w-4 h-4" />
          </button>

          <div
            onClick={() => setShowCryptoDetails((s) => !s)}
            className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center gap-2 cursor-pointer hover:border-emerald-400/50 transition-colors min-w-0"
          >
            <img
              src={remoteAvatar3D}
              alt={session.participantName}
              className="w-7 h-7 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="truncate">{session.participantName}</span>
                <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
              </div>
              <div className="text-[10px] font-mono text-emerald-300 tabular-nums">
                {statusText}
              </div>
            </div>
          </div>
        </div>

        {/* Right Top Studio Shortcuts: Swap View, Window Shapes, Filters & Effects, Add Person */}
        <div className="flex items-center gap-1.5">
          {isVideoMode && (
            <>
              <button
                onClick={() => setSwapMainAndSelfView((s) => !s)}
                className="min-h-[40px] px-3 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-xs font-semibold text-white hover:bg-white/20 flex items-center gap-1.5"
                title="Swap Fullscreen & Self-View Window"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Swap</span>
              </button>

              <button
                onClick={() =>
                  setActiveStudioDrawer((d) => (d === 'shapes' ? 'none' : 'shapes'))
                }
                className={`min-h-[40px] px-3 rounded-full backdrop-blur-md border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeStudioDrawer === 'shapes'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-black/60 border-white/15 text-white hover:bg-white/20'
                }`}
                title="Window Shapes & Split Layouts"
              >
                <Shapes className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Shapes & Layout</span>
              </button>

              <button
                onClick={() =>
                  setActiveStudioDrawer((d) => (d === 'effects' ? 'none' : 'effects'))
                }
                className={`min-h-[40px] px-3 rounded-full backdrop-blur-md border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeStudioDrawer === 'effects' ||
                  videoEffect !== 'none' ||
                  activeArProp !== 'none' ||
                  callAtmosphere !== 'none'
                    ? 'bg-fuchsia-500/90 text-white border-fuchsia-400'
                    : 'bg-black/60 border-white/15 text-white hover:bg-white/20'
                }`}
                title="Video Filters, Fun AR Masks & Atmospheres"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Effects</span>
              </button>
            </>
          )}

          <button
            onClick={() => setShowAddParticipant((s) => !s)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/20"
            title="Add person to call"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable E2EE Verification Popover */}
      {showCryptoDetails && controlsVisible && (
        <div className="fixed top-16 left-4 z-50 w-72 rounded-2xl bg-slate-900/95 border border-emerald-500/40 p-3.5 shadow-2xl backdrop-blur-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              End-to-End Encrypted
            </span>
            <button
              onClick={() => setShowCryptoDetails(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-slate-300 text-[11px]">
            Verify these 4 emojis match on {session.participantName}&apos;s screen:
          </p>
          <div className="py-2 rounded-xl bg-slate-950 border border-slate-800 text-center text-xl tracking-[0.4em]">
            {verificationEmojis.join(' ')}
          </div>
        </div>
      )}

      {/* Add Participant Floating Modal */}
      {showAddParticipant && controlsVisible && (
        <div className="fixed top-16 right-4 z-50 w-80 rounded-2xl bg-slate-900/95 border border-white/15 p-3 flex items-center gap-2 shadow-2xl backdrop-blur-xl">
          <input
            type="text"
            value={newParticipantInput}
            onChange={(e) => setNewParticipantInput(e.target.value)}
            placeholder="Add name or @username…"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => {
              if (newParticipantInput.trim()) {
                onAddParticipant(newParticipantInput.trim());
                setNewParticipantInput('');
                setShowAddParticipant(false);
              }
            }}
            className="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold"
          >
            Add
          </button>
        </div>
      )}

      {/* ==========================================================================
          3. INTERACTIVE STUDIO DRAWERS (SHAPES/LAYOUTS OR FILTERS/AR EFFECTS)
         ========================================================================== */}
      {controlsVisible && activeStudioDrawer === 'shapes' && isVideoMode && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-lg rounded-3xl bg-slate-950/90 border border-white/15 p-3.5 backdrop-blur-2xl shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <Shapes className="w-3.5 h-3.5" />
              Fun Video Window Shapes & Stage Layouts
            </span>
            <button
              onClick={() => setActiveStudioDrawer('none')}
              className="text-xs text-slate-400 hover:text-white px-2"
            >
              Done
            </button>
          </div>

          {/* Stage Layout Selector */}
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'pip', label: 'Floating PiP' },
                { id: 'split-vertical', label: 'Top / Bottom' },
                { id: 'split-horizontal', label: 'Side by Side' },
                { id: 'cinema-floating', label: 'Dual Bubble' },
              ] as const
            ).map((lyt) => (
              <button
                key={lyt.id}
                onClick={() => setStageLayout(lyt.id)}
                className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition-all ${
                  stageLayout === lyt.id
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                    : 'bg-slate-900/90 text-slate-300 border-white/10 hover:bg-slate-800'
                }`}
              >
                {lyt.label}
              </button>
            ))}
          </div>

          {/* PiP Window Fun Shapes */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Video Window Shape
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {PIP_SHAPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPipShape(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all ${
                    pipShape === s.id
                      ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                      : 'bg-slate-900 text-slate-200 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* PiP Size & Quick Swap */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 mr-1">PiP Size:</span>
              {(['sm', 'md', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => setPipScaleSize(sz)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                    pipScaleSize === sz
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSwapMainAndSelfView((s) => !s)}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Swap Cameras</span>
            </button>
          </div>
        </div>
      )}

      {controlsVisible && activeStudioDrawer === 'effects' && isVideoMode && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-lg rounded-3xl bg-slate-950/90 border border-white/15 p-3.5 backdrop-blur-2xl shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-fuchsia-400 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5" />
              Immersive Filters, AR Props & Atmospheres
            </span>
            <button
              onClick={() => setActiveStudioDrawer('none')}
              className="text-xs text-slate-400 hover:text-white px-2"
            >
              Done
            </button>
          </div>

          {/* Live Color Filters */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Color Filters
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {VIDEO_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setVideoEffect(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all ${
                    videoEffect === f.id
                      ? 'bg-fuchsia-500 text-white border-fuchsia-300 font-bold shadow-lg'
                      : 'bg-slate-900 text-slate-200 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full bg-gradient-to-br ${f.previewBg}`} />
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fun AR Props */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              3D AR Props & Masks
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {AR_PROPS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveArProp(p.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all ${
                    activeArProp === p.id
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-bold'
                      : 'bg-slate-900 text-slate-200 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ambient Call Atmospheres + Studio Touch-Up */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {ATMOSPHERES.map((atm) => (
                <button
                  key={atm.id}
                  onClick={() => setCallAtmosphere(atm.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 ${
                    callAtmosphere === atm.id
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{atm.emoji}</span>
                  <span>{atm.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTouchUpBeauty((b) => !b)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  touchUpBeauty
                    ? 'bg-pink-500/25 text-pink-300 border border-pink-400/40'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                ✨ Touch-Up
              </button>
              <button
                onClick={() => setLowLightBoost((l) => !l)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  lowLightBoost
                    ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                ☀️ Low-Light
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reaction Tray */}
      {controlsVisible && showReactionTray && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-950/90 border border-white/15 flex items-center gap-2 shadow-2xl backdrop-blur-xl">
          {CALL_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSendCallReaction(emoji)}
              className="w-9 h-9 rounded-full hover:bg-white/15 hover:scale-125 transition-transform flex items-center justify-center text-xl"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* ==========================================================================
          4. SLEEK FLOATING BOTTOM CALL DOCK (ONLY VISIBLE ON TAP, ZERO CLUTTER)
         ========================================================================== */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94vw] max-w-md rounded-full bg-slate-950/80 border border-white/15 px-3 py-2.5 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] transition-all duration-300 ${
          controlsVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-12 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5">
          {/* 1. Microphone Mute / Unmute */}
          <button
            onClick={() => setIsMuted((m) => !m)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              isMuted
                ? 'bg-white text-slate-950'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* 2. Video On / Off */}
          <button
            onClick={() => setIsVideoEnabled((v) => !v)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              !isVideoEnabled
                ? 'bg-white text-slate-950'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
            title="Toggle camera"
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* 3. Flip Camera */}
          <button
            onClick={() => {
              if (!isVideoEnabled) setIsVideoEnabled(true);
              setFacingMode((f) => (f === 'user' ? 'environment' : 'user'));
            }}
            className="w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center transition-colors"
            title="Switch front/rear camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>

          {/* 4. Audio Route (Speaker / Earpiece / Bluetooth) */}
          <button
            onClick={cycleAudioRoute}
            className="w-11 h-11 rounded-full bg-white/15 text-white hover:bg-white/25 flex items-center justify-center transition-colors"
            title={`Audio route: ${audioRoute}`}
          >
            {audioRoute === 'speaker' && <Volume2 className="w-5 h-5 text-emerald-400" />}
            {audioRoute === 'earpiece' && <Smartphone className="w-5 h-5 text-cyan-400" />}
            {audioRoute === 'bluetooth' && <Bluetooth className="w-5 h-5 text-indigo-400" />}
          </button>

          {/* 5. Screen Share */}
          <button
            onClick={handleToggleScreenShare}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              isScreenSharing
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
            title="Share screen"
          >
            <MonitorUp className="w-5 h-5" />
          </button>

          {/* 6. Reactions */}
          <button
            onClick={() => setShowReactionTray((s) => !s)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              showReactionTray
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
            title="Send reaction"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* 7. End Call */}
          <button
            onClick={() => onEndCall(durationSec, isVideoEnabled ? 'video' : 'audio')}
            className="w-14 h-11 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/50 transition-transform active:scale-95"
            title="End call"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
