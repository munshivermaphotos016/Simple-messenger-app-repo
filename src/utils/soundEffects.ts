export type RingtoneId =
  | 'simple_classic'
  | 'facetime_chime'
  | 'marimba_pulse'
  | 'cosmic_synth'
  | 'gentle_harp'
  | 'retro_8bit'
  | 'crystal_bell'
  | 'vip_fanfare'
  | 'digital_phone'
  | 'zen_garden'
  | 'custom_uploaded'
  | 'silent';

export type NotificationToneId =
  | 'note_drop'
  | 'bamboo_pop'
  | 'crystal_ping'
  | 'double_chime'
  | 'soft_whistle'
  | 'aurora_chord'
  | 'sparkle_pop'
  | 'emerald_pulse'
  | 'velvet_bell'
  | 'sonar_blip'
  | 'kalimba_pluck'
  | 'custom_uploaded'
  | 'silent';

export type VibrationPatternId =
  | 'default'
  | 'heartbeat'
  | 'rapid'
  | 'long_wave'
  | 'off';

export type CallBannerStyleId =
  | 'fullscreen_immersive'
  | 'floating_card'
  | 'neon_pulse'
  | 'minimal_banner';

export type CallSoundEffectId =
  | 'applause'
  | 'laugh'
  | 'drumroll'
  | 'airhorn'
  | 'magic_wand'
  | 'game_win'
  | 'pop';

export const RINGTONE_OPTIONS: Array<{
  id: RingtoneId;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    id: 'simple_classic',
    label: 'Classic Marimba Ring',
    description: 'Warm, familiar two-bar melodic chime',
    emoji: '🎵',
  },
  {
    id: 'facetime_chime',
    label: 'Video Harmonic Chime',
    description: 'Crisp ascending glass chord sequence for video calls',
    emoji: '✨',
  },
  {
    id: 'vip_fanfare',
    label: 'VIP Favorite Melody',
    description: 'Special uplifting melody for Favorite contacts',
    emoji: '⭐',
  },
  {
    id: 'marimba_pulse',
    label: 'Tropical Wooden Pulse',
    description: 'Upbeat acoustic wooden marimba rhythm',
    emoji: '🥁',
  },
  {
    id: 'digital_phone',
    label: 'Classic Digital Phone',
    description: 'Crisp dual-tone telephone ring',
    emoji: '☎️',
  },
  {
    id: 'cosmic_synth',
    label: 'Cosmic Synth Wave',
    description: 'Futuristic ambient synthesizer melody',
    emoji: '🌌',
  },
  {
    id: 'gentle_harp',
    label: 'Gentle Sunrise Harp',
    description: 'Calming acoustic harp arpeggio',
    emoji: '🎶',
  },
  {
    id: 'zen_garden',
    label: 'Zen Singing Bowl',
    description: 'Peaceful resonant harmonic progression',
    emoji: '🧘',
  },
  {
    id: 'retro_8bit',
    label: 'Retro Arcade 8-Bit',
    description: 'Playful classic chiptune melody',
    emoji: '🕹️',
  },
  {
    id: 'crystal_bell',
    label: 'Crystal Resonance',
    description: 'Pure high-clarity bell harmonics',
    emoji: '🔔',
  },
  {
    id: 'custom_uploaded',
    label: 'Custom Audio File',
    description: 'Uses your custom uploaded audio ringtone',
    emoji: '📂',
  },
  {
    id: 'silent',
    label: 'Silent Ring',
    description: 'No sound (uses vibration setting only)',
    emoji: '🔕',
  },
];

export const NOTIFICATION_TONE_OPTIONS: Array<{
  id: NotificationToneId;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    id: 'note_drop',
    label: 'Note Drop (Default)',
    description: 'Clean water droplet & warm note',
    emoji: '💧',
  },
  {
    id: 'emerald_pulse',
    label: 'Emerald Pulse',
    description: 'Modern two-note messenger chime',
    emoji: '💚',
  },
  {
    id: 'sparkle_pop',
    label: 'Sparkle Star (Favorites)',
    description: 'Upbeat 4-note magic sparkle for favorite people',
    emoji: '⭐',
  },
  {
    id: 'bamboo_pop',
    label: 'Bamboo Pop (Groups)',
    description: 'Snappy organic wooden tap for group chats',
    emoji: '🎋',
  },
  {
    id: 'crystal_ping',
    label: 'Crystal Ping',
    description: 'Bright resonant glass ding',
    emoji: '💎',
  },
  {
    id: 'double_chime',
    label: 'Double Chime',
    description: 'Pleasant two-step ascending chime',
    emoji: '🔔',
  },
  {
    id: 'soft_whistle',
    label: 'Friendly Whistle',
    description: 'Playful two-tone whistle alert',
    emoji: '🐦',
  },
  {
    id: 'aurora_chord',
    label: 'Aurora Chord',
    description: 'Soft dreamy major triad swell',
    emoji: '🌈',
  },
  {
    id: 'velvet_bell',
    label: 'Velvet Bell',
    description: 'Warm mellow bell chime',
    emoji: '🛎️',
  },
  {
    id: 'kalimba_pluck',
    label: 'Kalimba Pluck',
    description: 'Acoustic thumb-piano harmonic',
    emoji: '🪕',
  },
  {
    id: 'sonar_blip',
    label: 'Sonar Blip',
    description: 'Crisp high-clarity radar ping',
    emoji: '📡',
  },
  {
    id: 'custom_uploaded',
    label: 'Custom Audio File',
    description: 'Uses your custom uploaded notification sound',
    emoji: '📂',
  },
  {
    id: 'silent',
    label: 'Silent',
    description: 'No notification sound',
    emoji: '🔕',
  },
];

export const VIBRATION_PATTERN_OPTIONS: Array<{
  id: VibrationPatternId;
  label: string;
  pattern: number[];
}> = [
  { id: 'default', label: 'Standard Double Pulse', pattern: [180, 90, 180] },
  { id: 'heartbeat', label: 'Heartbeat Rhythm', pattern: [100, 60, 140, 350, 100, 60, 140] },
  { id: 'rapid', label: 'Rapid Staccato Alert', pattern: [75, 50, 75, 50, 75, 50, 75] },
  { id: 'long_wave', label: 'Deep Long Wave', pattern: [420, 140, 420] },
  { id: 'off', label: 'Vibration Off', pattern: [] },
];

export const CALL_BANNER_STYLE_OPTIONS: Array<{
  id: CallBannerStyleId;
  label: string;
  description: string;
}> = [
  {
    id: 'fullscreen_immersive',
    label: 'Full-Screen Call Screen',
    description: 'Expansive full-screen incoming call experience',
  },
  {
    id: 'floating_card',
    label: 'Compact Top Banner',
    description: 'Non-intrusive floating card at the top of your screen',
  },
  {
    id: 'neon_pulse',
    label: 'Glowing Aura Ring',
    description: 'Animated color-matched edge glow with caller card',
  },
  {
    id: 'minimal_banner',
    label: 'Discrete Minimal Pill',
    description: 'Ultra-compact bar for distraction-free focus',
  },
];

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function triggerVibration(patternId: VibrationPatternId = 'default') {
  try {
    const found = VIBRATION_PATTERN_OPTIONS.find((v) => v.id === patternId);
    if (found && found.pattern.length > 0 && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(found.pattern);
    }
  } catch {
    // Ignore on unsupported devices
  }
}

export function playCustomDataUrlAudio(dataUrl?: string, volume = 0.8): boolean {
  if (!dataUrl) return false;
  try {
    const audio = new Audio(dataUrl);
    audio.volume = Math.max(0.05, Math.min(1, volume));
    audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays subtle in-chat sound when sending or receiving a message inside an active chat.
 */
export function playInChatMessageSound(
  direction: 'sent' | 'received',
  volume = 0.65
) {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.max(0.04, Math.min(1, volume)) * 0.11, now);
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';

  if (direction === 'sent') {
    // Subtle upward pop for outgoing message
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.065);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.9, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  } else {
    // Soft two-step bubble tick for incoming in-chat message
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.08);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.85, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }
}

export function playNotificationTone(
  toneId: NotificationToneId = 'note_drop',
  volume = 0.75,
  customDataUrl?: string
) {
  const normVol = volume > 1 ? volume / 100 : volume;
  if (toneId === 'silent' || normVol <= 0) return;

  if (toneId === 'custom_uploaded' && customDataUrl) {
    if (playCustomDataUrlAudio(customDataUrl, normVol)) return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.max(0.05, Math.min(1, normVol)) * 0.18, now);
  masterGain.connect(ctx.destination);

  const playNote = (
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    slideToFreq?: number
  ) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + startOffset);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + startOffset + duration);
    }
    g.gain.setValueAtTime(0.001, now + startOffset);
    g.gain.linearRampToValueAtTime(1, now + startOffset + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  switch (toneId) {
    case 'note_drop':
      playNote(587.33, 0, 0.14, 'sine', 880); // D5 -> A5
      playNote(1174.66, 0.11, 0.22, 'sine'); // D6
      break;
    case 'emerald_pulse':
      playNote(659.25, 0, 0.12, 'triangle'); // E5
      playNote(880, 0.1, 0.24, 'sine'); // A5
      break;
    case 'bamboo_pop':
      playNote(320, 0, 0.09, 'triangle', 640);
      playNote(760, 0.08, 0.12, 'sine');
      break;
    case 'crystal_ping':
      playNote(1318.5, 0, 0.38, 'sine'); // E6
      playNote(1975.5, 0.04, 0.35, 'sine'); // B6
      break;
    case 'double_chime':
      playNote(659.25, 0, 0.18, 'triangle'); // E5
      playNote(987.77, 0.15, 0.28, 'triangle'); // B5
      break;
    case 'soft_whistle':
      playNote(783.99, 0, 0.14, 'sine', 1046.5);
      playNote(1046.5, 0.15, 0.18, 'sine', 1318.5);
      break;
    case 'aurora_chord':
      playNote(523.25, 0, 0.4, 'sine'); // C5
      playNote(659.25, 0.05, 0.4, 'sine'); // E5
      playNote(783.99, 0.1, 0.45, 'sine'); // G5
      playNote(987.77, 0.15, 0.5, 'sine'); // B5
      break;
    case 'sparkle_pop':
      playNote(880, 0, 0.1, 'sine');
      playNote(1108.73, 0.08, 0.1, 'sine');
      playNote(1318.51, 0.16, 0.12, 'sine');
      playNote(1760, 0.24, 0.25, 'sine');
      break;
    case 'velvet_bell':
      playNote(440, 0, 0.32, 'triangle');
      playNote(659.25, 0.12, 0.38, 'sine');
      break;
    case 'kalimba_pluck':
      playNote(523.25, 0, 0.14, 'triangle');
      playNote(783.99, 0.09, 0.14, 'triangle');
      playNote(1046.5, 0.18, 0.26, 'sine');
      break;
    case 'sonar_blip':
      playNote(1480, 0, 0.09, 'sine');
      playNote(1480, 0.14, 0.18, 'sine');
      break;
    default:
      playNote(660, 0, 0.2, 'sine');
  }
}

export function playRingtonePreview(
  ringtoneId: RingtoneId = 'simple_classic',
  volume = 0.8,
  customDataUrl?: string
) {
  const normVol = volume > 1 ? volume / 100 : volume;
  if (ringtoneId === 'silent' || normVol <= 0) return;

  if (ringtoneId === 'custom_uploaded' && customDataUrl) {
    if (playCustomDataUrlAudio(customDataUrl, normVol)) return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.max(0.05, Math.min(1, normVol)) * 0.18, now);
  masterGain.connect(ctx.destination);

  const note = (
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = 'sine'
  ) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    g.gain.setValueAtTime(0.001, now + start);
    g.gain.linearRampToValueAtTime(0.95, now + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  switch (ringtoneId) {
    case 'simple_classic':
      // Lengthy classic ringtone melody (Phrase 1 + Rest + Harmonic Duet Phrase 2 + Shimmer)
      note(783.99, 0.0, 0.16, 'triangle'); // G5
      note(987.77, 0.16, 0.16, 'triangle'); // B5
      note(1174.66, 0.32, 0.22, 'triangle'); // D6
      note(987.77, 0.54, 0.16, 'triangle'); // B5
      note(783.99, 0.70, 0.35, 'triangle'); // G5

      // Harmonic second phrase
      note(783.99, 1.45, 0.16, 'triangle'); // G5
      note(987.77, 1.45, 0.16, 'sine'); // B5
      note(987.77, 1.62, 0.16, 'triangle'); // B5
      note(1174.66, 1.62, 0.16, 'sine'); // D6
      note(1174.66, 1.78, 0.24, 'triangle'); // D6
      note(1567.98, 1.78, 0.24, 'sine'); // G6
      note(987.77, 2.02, 0.16, 'triangle'); // B5
      note(1174.66, 2.02, 0.16, 'sine'); // D6
      note(783.99, 2.18, 0.38, 'triangle'); // G5
      note(987.77, 2.18, 0.38, 'sine'); // B5

      // Resolving ringing cadence
      note(1174.66, 2.9, 0.22, 'triangle'); // D6
      note(1567.98, 3.12, 0.55, 'sine'); // G6
      break;

    case 'facetime_chime':
      // Lengthy Apple FaceTime style crystalline chime cadence across 3.8s
      note(659.25, 0.0, 0.28, 'sine'); // E5
      note(830.61, 0.14, 0.28, 'sine'); // G#5
      note(987.77, 0.28, 0.32, 'sine'); // B5
      note(1318.51, 0.44, 0.55, 'sine'); // E6

      note(987.77, 1.45, 0.24, 'sine'); // B5
      note(830.61, 1.69, 0.24, 'sine'); // G#5
      note(659.25, 1.93, 0.28, 'sine'); // E5
      note(987.77, 2.21, 0.32, 'sine'); // B5
      note(1318.51, 2.53, 0.65, 'sine'); // E6

      // Lingering harmonic bell triad
      note(1318.51, 3.2, 0.65, 'sine'); // E6
      note(1661.22, 3.2, 0.65, 'sine'); // G#6
      note(1975.53, 3.2, 0.65, 'sine'); // B6
      break;

    case 'vip_fanfare':
      // Lengthy VIP celebratory fanfare with triumphant brass cadence
      note(587.33, 0.0, 0.14, 'triangle'); // D5
      note(739.99, 0.13, 0.14, 'triangle'); // F#5
      note(880.0, 0.26, 0.14, 'triangle'); // A5
      note(1174.66, 0.4, 0.32, 'sine'); // D6
      note(880.0, 0.74, 0.14, 'triangle'); // A5
      note(1174.66, 0.88, 0.38, 'sine'); // D6

      // Second fanfare phrase
      note(739.99, 1.55, 0.14, 'triangle'); // F#5
      note(880.0, 1.68, 0.14, 'triangle'); // A5
      note(1174.66, 1.81, 0.18, 'triangle'); // D6
      note(1479.98, 2.0, 0.35, 'sine'); // F#6
      note(1174.66, 2.35, 0.16, 'triangle'); // D6
      note(1479.98, 2.51, 0.45, 'sine'); // F#6

      // Chordal resolve
      note(880.0, 3.1, 0.65, 'triangle');
      note(1174.66, 3.1, 0.65, 'sine');
      note(1760.0, 3.1, 0.65, 'sine');
      break;

    case 'digital_phone':
      // Authentic DTMF dual-frequency telephone ring (440Hz + 480Hz) cadence
      // Ring burst 1 (double pulse)
      for (let i = 0; i < 4; i++) {
        note(440, i * 0.14, 0.11, 'sine');
        note(480, i * 0.14, 0.11, 'sine');
      }
      for (let i = 0; i < 4; i++) {
        note(440, 0.8 + i * 0.14, 0.11, 'sine');
        note(480, 0.8 + i * 0.14, 0.11, 'sine');
      }
      // Ring burst 2 (second ring cycle)
      for (let i = 0; i < 4; i++) {
        note(440, 2.0 + i * 0.14, 0.11, 'sine');
        note(480, 2.0 + i * 0.14, 0.11, 'sine');
      }
      for (let i = 0; i < 4; i++) {
        note(440, 2.8 + i * 0.14, 0.11, 'sine');
        note(480, 2.8 + i * 0.14, 0.11, 'sine');
      }
      break;

    case 'zen_garden':
      // Lengthy Tibetan meditative singing bowl and singing harmonics across 4.2s
      note(432, 0.0, 1.1, 'sine');
      note(648, 0.25, 1.0, 'sine');
      note(864, 0.5, 1.1, 'sine');

      note(540, 1.6, 1.2, 'sine');
      note(810, 1.85, 1.2, 'sine');
      note(1080, 2.1, 1.3, 'sine');

      note(432, 3.0, 1.2, 'sine');
      note(1296, 3.2, 1.0, 'sine');
      break;

    case 'marimba_pulse':
      // Full Caribbean/Latin acoustic wooden marimba ring melody across 3.8s
      note(523.25, 0.0, 0.14, 'triangle'); // C5
      note(659.25, 0.14, 0.14, 'triangle'); // E5
      note(783.99, 0.28, 0.14, 'triangle'); // G5
      note(1046.5, 0.42, 0.22, 'triangle'); // C6
      note(783.99, 0.66, 0.14, 'triangle'); // G5
      note(1046.5, 0.8, 0.28, 'triangle'); // C6

      // Counterpoint response
      note(587.33, 1.45, 0.14, 'triangle'); // D5
      note(698.46, 1.59, 0.14, 'triangle'); // F5
      note(880.0, 1.73, 0.14, 'triangle'); // A5
      note(1174.66, 1.87, 0.24, 'triangle'); // D6
      note(880.0, 2.11, 0.14, 'triangle'); // A5
      note(1174.66, 2.25, 0.32, 'triangle'); // D6

      // Climax flourish
      note(1046.5, 2.85, 0.14, 'triangle');
      note(1318.51, 3.0, 0.16, 'triangle');
      note(1567.98, 3.16, 0.45, 'triangle');
      break;

    case 'cosmic_synth':
      // 80s Synthwave retro ringtone hook with pulsating bass and arpeggio across 3.8s
      note(220, 0.0, 0.4, 'sawtooth');
      note(440, 0.0, 0.25, 'sawtooth');
      note(554.37, 0.2, 0.25, 'sawtooth');
      note(659.25, 0.4, 0.25, 'sawtooth');
      note(880, 0.6, 0.45, 'sine');

      note(277.18, 1.4, 0.4, 'sawtooth');
      note(554.37, 1.4, 0.25, 'sawtooth');
      note(659.25, 1.6, 0.25, 'sawtooth');
      note(880, 1.8, 0.25, 'sawtooth');
      note(1108.73, 2.0, 0.48, 'sine');

      note(440, 2.7, 0.5, 'sawtooth');
      note(880, 2.7, 0.3, 'sawtooth');
      note(1318.51, 2.9, 0.65, 'sine');
      break;

    case 'gentle_harp':
      // Concert grand harp ascending flourish and gentle resolving cadence across 3.8s
      note(587.33, 0.0, 0.28, 'sine');
      note(739.99, 0.12, 0.28, 'sine');
      note(880, 0.24, 0.28, 'sine');
      note(1174.66, 0.36, 0.35, 'sine');
      note(1479.98, 0.48, 0.45, 'sine');

      note(739.99, 1.45, 0.28, 'sine');
      note(880, 1.57, 0.28, 'sine');
      note(1174.66, 1.69, 0.28, 'sine');
      note(1479.98, 1.81, 0.35, 'sine');
      note(1760.0, 1.93, 0.55, 'sine');

      note(1174.66, 2.8, 0.65, 'sine');
      note(1760.0, 2.9, 0.7, 'sine');
      break;

    case 'retro_8bit':
      // Chiptune game ring melody with rapid energetic 8-bit notes across 3.8s
      note(523.25, 0.0, 0.1, 'square');
      note(659.25, 0.11, 0.1, 'square');
      note(783.99, 0.22, 0.1, 'square');
      note(1046.5, 0.33, 0.18, 'square');
      note(783.99, 0.53, 0.1, 'square');
      note(1046.5, 0.65, 0.25, 'square');

      note(587.33, 1.4, 0.1, 'square');
      note(739.99, 1.51, 0.1, 'square');
      note(880.0, 1.62, 0.1, 'square');
      note(1174.66, 1.73, 0.2, 'square');
      note(880.0, 1.93, 0.1, 'square');
      note(1174.66, 2.05, 0.3, 'square');

      note(1046.5, 2.7, 0.1, 'square');
      note(1318.51, 2.82, 0.12, 'square');
      note(1567.98, 2.95, 0.14, 'square');
      note(2093.0, 3.1, 0.45, 'square');
      break;

    case 'crystal_bell':
      // Orchestral bells with glistening reverberation across 4.0s
      note(1046.5, 0.0, 0.55, 'sine');
      note(1567.98, 0.2, 0.6, 'sine');
      note(2093.0, 0.4, 0.7, 'sine');

      note(1174.66, 1.5, 0.55, 'sine');
      note(1760.0, 1.7, 0.6, 'sine');
      note(2349.32, 1.9, 0.75, 'sine');

      note(2093.0, 2.9, 0.85, 'sine');
      note(2637.02, 3.1, 0.9, 'sine');
      break;

    default:
      note(783.99, 0.0, 0.3, 'sine');
      note(987.77, 0.2, 0.35, 'sine');
      note(1174.66, 0.4, 0.45, 'sine');
      note(1567.98, 0.65, 0.6, 'sine');
  }
}

export function playCallSoundEffect(effectId: CallSoundEffectId) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.15, now);
  master.connect(ctx.destination);

  const tone = (
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = 'sine',
    endFreq?: number
  ) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur);
    }
    g.gain.setValueAtTime(0.01, now + start);
    g.gain.linearRampToValueAtTime(0.9, now + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  switch (effectId) {
    case 'applause':
      tone(523.25, 0, 0.12, 'triangle');
      tone(659.25, 0.09, 0.12, 'triangle');
      tone(783.99, 0.18, 0.12, 'triangle');
      tone(1046.5, 0.27, 0.35, 'triangle');
      break;
    case 'laugh':
      tone(720, 0, 0.1, 'sine', 540);
      tone(680, 0.12, 0.1, 'sine', 500);
      tone(640, 0.24, 0.1, 'sine', 460);
      tone(600, 0.36, 0.18, 'sine', 420);
      break;
    case 'drumroll':
      for (let i = 0; i < 8; i++) {
        tone(180 + (i % 2) * 35, i * 0.055, 0.05, 'triangle');
      }
      tone(587.33, 0.46, 0.35, 'sawtooth', 880);
      break;
    case 'airhorn':
      tone(466.16, 0, 0.12, 'sawtooth');
      tone(466.16, 0.14, 0.12, 'sawtooth');
      tone(466.16, 0.28, 0.38, 'sawtooth');
      break;
    case 'magic_wand':
      [880, 1046.5, 1318.5, 1567.98, 2093].forEach((f, idx) => {
        tone(f, idx * 0.06, 0.2, 'sine');
      });
      break;
    case 'game_win':
      tone(523.25, 0, 0.12, 'square');
      tone(659.25, 0.12, 0.12, 'square');
      tone(783.99, 0.24, 0.12, 'square');
      tone(1046.5, 0.36, 0.32, 'square');
      break;
    case 'pop':
    default:
      tone(520, 0, 0.09, 'sine', 880);
      break;
  }
}

export function playCallStateTone(
  state: 'dialing' | 'connected' | 'ended',
  callType: 'audio' | 'video' = 'audio',
  volume = 0.75
) {
  const normVol = volume > 1 ? volume / 100 : volume;
  if (normVol <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0.05, Math.min(1, normVol)) * 0.14, now);
  master.connect(ctx.destination);

  const tone = (
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = 'sine'
  ) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    g.gain.setValueAtTime(0.005, now + start);
    g.gain.linearRampToValueAtTime(0.85, now + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  if (state === 'dialing') {
    if (callType === 'video') {
      tone(523.25, 0, 0.28, 'sine');
      tone(659.25, 0.12, 0.34, 'sine');
    } else {
      tone(440, 0, 0.42, 'sine');
      tone(480, 0, 0.42, 'sine');
    }
  } else if (state === 'connected') {
    tone(587.33, 0, 0.1, 'triangle');
    tone(880, 0.09, 0.18, 'sine');
  } else if (state === 'ended') {
    tone(659.25, 0, 0.11, 'triangle');
    tone(440, 0.1, 0.22, 'sine');
  }
}

export function getToneLabel(toneId?: NotificationToneId | 'default'): string {
  if (!toneId || toneId === 'default') return 'Default Category Tone';
  const found = NOTIFICATION_TONE_OPTIONS.find((t) => t.id === toneId);
  return found ? `${found.emoji} ${found.label}` : toneId;
}

export function getRingtoneLabel(ringtoneId?: RingtoneId | 'default'): string {
  if (!ringtoneId || ringtoneId === 'default') return 'Default Category Ringtone';
  const found = RINGTONE_OPTIONS.find((r) => r.id === ringtoneId);
  return found ? `${found.emoji} ${found.label}` : ringtoneId;
}

/**
 * Resolves the exact notification sound and vibration pattern for a specific chat conversation
 * Priority:
 * 1. Chat muted or notificationMode === 'disabled' or 'silent' -> silent
 * 2. Chat has a customMessageTone explicitly chosen -> use chat's customMessageTone
 * 3. Chat is marked as Favorite -> use settings.favoriteMessageTone ('sparkle_pop')
 * 4. Chat is a Group Chat -> use settings.groupNotificationTone ('bamboo_pop')
 * 5. Otherwise (normal 1-on-1 person chat) -> use settings.messageNotificationTone ('note_drop')
 */
export function resolveChatNotificationSound(
  chat:
    | {
        isGroup?: boolean;
        favorite?: boolean;
        muted?: boolean;
        notificationMode?: string;
        customMessageTone?: NotificationToneId | 'default';
        customVibrationPattern?: VibrationPatternId | 'default';
        customToneDataUrl?: string;
      }
    | undefined,
  settings: {
    notificationsEnabled?: boolean;
    soundEnabled?: boolean;
    vibrationEnabled?: boolean;
    messageNotifications?: boolean;
    groupNotifications?: boolean;
    messageNotificationTone?: NotificationToneId;
    favoriteMessageTone?: NotificationToneId;
    groupNotificationTone?: NotificationToneId;
    customMessageToneDataUrl?: string;
    vibrationPattern?: VibrationPatternId;
    favoriteVibrationPattern?: VibrationPatternId;
    groupVibrationPattern?: VibrationPatternId;
    notificationVolume?: number;
  }
): {
  toneId: NotificationToneId;
  vibrationId: VibrationPatternId;
  customDataUrl?: string;
  sourceLabel: string;
} {
  if (
    settings.notificationsEnabled === false ||
    chat?.muted ||
    chat?.notificationMode === 'disabled'
  ) {
    return { toneId: 'silent', vibrationId: 'off', sourceLabel: 'Muted' };
  }

  if (chat?.isGroup && settings.groupNotifications === false) {
    return { toneId: 'silent', vibrationId: 'off', sourceLabel: 'Group Alerts Off' };
  }
  if (!chat?.isGroup && settings.messageNotifications === false) {
    return { toneId: 'silent', vibrationId: 'off', sourceLabel: 'Message Alerts Off' };
  }

  let toneId: NotificationToneId = 'note_drop';
  let sourceLabel = 'Personal Chat Default';

  if (chat?.notificationMode === 'silent' || chat?.notificationMode === 'vibrate') {
    toneId = 'silent';
    sourceLabel = chat.notificationMode === 'vibrate' ? 'Vibrate Only' : 'Silent Mode';
  } else if (chat?.customMessageTone && chat.customMessageTone !== 'default') {
    toneId = chat.customMessageTone;
    sourceLabel = 'Custom Person/Chat Sound';
  } else if (chat?.favorite) {
    toneId = settings.favoriteMessageTone || 'sparkle_pop';
    sourceLabel = 'Favorite Contact Sound';
  } else if (chat?.isGroup) {
    toneId = settings.groupNotificationTone || 'bamboo_pop';
    sourceLabel = 'Group Chat Sound';
  } else {
    toneId = settings.messageNotificationTone || 'note_drop';
    sourceLabel = 'Personal Chat Sound';
  }

  if (settings.soundEnabled === false) {
    toneId = 'silent';
  }

  let vibrationId: VibrationPatternId = 'default';
  if (
    settings.vibrationEnabled === false ||
    chat?.notificationMode === 'no_vibration' ||
    chat?.notificationMode === 'silent'
  ) {
    vibrationId = 'off';
  } else if (chat?.customVibrationPattern && chat.customVibrationPattern !== 'default') {
    vibrationId = chat.customVibrationPattern;
  } else if (chat?.favorite) {
    vibrationId = settings.favoriteVibrationPattern || 'heartbeat';
  } else if (chat?.isGroup) {
    vibrationId = settings.groupVibrationPattern || 'rapid';
  } else {
    vibrationId = settings.vibrationPattern || 'default';
  }

  return {
    toneId,
    vibrationId,
    customDataUrl: chat?.customToneDataUrl || settings.customMessageToneDataUrl,
    sourceLabel,
  };
}

/**
 * Resolves the exact Call Ringtone and Vibration Pattern for an incoming Voice or Video Call
 * Priority:
 * 1. Call style silent/vibrate_only -> silent
 * 2. Video Call + Chat has customVideoCallRingtone -> chat.customVideoCallRingtone
 * 3. Voice/Any Call + Chat has customRingtone -> chat.customRingtone
 * 4. Caller is Favorite -> settings.favoriteCallRingtone ('vip_fanfare')
 * 5. Group Call -> settings.groupCallRingtone ('marimba_pulse')
 * 6. Video Call -> settings.videoCallRingtone ('facetime_chime')
 * 7. Personal Voice Call -> settings.callRingtone ('simple_classic')
 */
export function resolveCallRingtone(
  chat:
    | {
        isGroup?: boolean;
        favorite?: boolean;
        customRingtone?: RingtoneId | 'default';
        customVideoCallRingtone?: RingtoneId | 'default';
        customVibrationPattern?: VibrationPatternId | 'default';
        customRingtoneDataUrl?: string;
      }
    | undefined,
  callType: 'audio' | 'video',
  isGroupCall: boolean,
  settings: {
    callNotifications?: boolean;
    soundEnabled?: boolean;
    vibrationEnabled?: boolean;
    incomingCallNotificationStyle?: string;
    callRingtone?: RingtoneId;
    favoriteCallRingtone?: RingtoneId;
    videoCallRingtone?: RingtoneId;
    groupCallRingtone?: RingtoneId;
    customRingtoneDataUrl?: string;
    callVibrationPattern?: VibrationPatternId;
    favoriteVibrationPattern?: VibrationPatternId;
  }
): {
  ringtoneId: RingtoneId;
  vibrationId: VibrationPatternId;
  customDataUrl?: string;
  sourceLabel: string;
} {
  if (
    settings.callNotifications === false ||
    settings.incomingCallNotificationStyle === 'silent'
  ) {
    return { ringtoneId: 'silent', vibrationId: 'off', sourceLabel: 'Silent Calls' };
  }

  let ringtoneId: RingtoneId = 'simple_classic';
  let sourceLabel = 'Voice Call Ringtone';

  if (settings.incomingCallNotificationStyle === 'vibrate_only' || settings.soundEnabled === false) {
    ringtoneId = 'silent';
    sourceLabel = 'Vibrate Only';
  } else if (
    callType === 'video' &&
    chat?.customVideoCallRingtone &&
    chat.customVideoCallRingtone !== 'default'
  ) {
    ringtoneId = chat.customVideoCallRingtone;
    sourceLabel = 'Custom Person Video Ringtone';
  } else if (chat?.customRingtone && chat.customRingtone !== 'default') {
    ringtoneId = chat.customRingtone;
    sourceLabel = 'Custom Person Ringtone';
  } else if (chat?.favorite) {
    ringtoneId = settings.favoriteCallRingtone || 'vip_fanfare';
    sourceLabel = 'Favorite Contact Ringtone';
  } else if (isGroupCall || chat?.isGroup) {
    ringtoneId = settings.groupCallRingtone || 'marimba_pulse';
    sourceLabel = 'Group Call Ringtone';
  } else if (callType === 'video') {
    ringtoneId = settings.videoCallRingtone || 'facetime_chime';
    sourceLabel = 'Video Call Ringtone';
  } else {
    ringtoneId = settings.callRingtone || 'simple_classic';
    sourceLabel = 'Voice Call Ringtone';
  }

  let vibrationId: VibrationPatternId = settings.callVibrationPattern || 'heartbeat';
  if (settings.vibrationEnabled === false) {
    vibrationId = 'off';
  } else if (chat?.customVibrationPattern && chat.customVibrationPattern !== 'default') {
    vibrationId = chat.customVibrationPattern;
  } else if (chat?.favorite && settings.favoriteVibrationPattern) {
    vibrationId = settings.favoriteVibrationPattern;
  }

  return {
    ringtoneId,
    vibrationId,
    customDataUrl: chat?.customRingtoneDataUrl || settings.customRingtoneDataUrl,
    sourceLabel,
  };
}

