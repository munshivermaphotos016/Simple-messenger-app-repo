export interface CartoonAvatarPreset {
  id: string;
  label: string;
  subtitle: string;
  category: '3D Characters' | '3D Mascots' | '3D Cyber & Sci-Fi' | '3D VIP & Fun';
  accentColor: string;
  url: string;
}

export interface Cartoon3DSticker {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  category: 'reactions' | 'mascots' | 'vibes' | 'props';
  accentColor: string;
  gradient: string;
  url: string;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

interface CharacterConfig {
  id: string;
  bg1: string;
  bg2: string;
  ringColor: string;
  kind: 'human' | 'fox' | 'panda' | 'cat' | 'lion' | 'astro' | 'robot' | 'ninja' | 'koala' | 'unicorn' | 'owl' | 'penguin' | 'dragon' | 'group';
  skinLight?: string;
  skinDark?: string;
  hairColor?: string;
  hairStyle?: 'quiff' | 'wavy' | 'fade' | 'spiky' | 'long' | 'pomp' | 'buns';
  outfitColor1?: string;
  outfitColor2?: string;
  accessory?: 'visor' | 'round_glasses' | 'headphones' | 'shades' | 'crown' | 'gaming_headset' | 'beanie' | 'fedora' | 'none';
  expression?: 'smile' | 'grin' | 'wink' | 'cool' | 'happy';
  badgeEmoji?: string;
}

export function build3DCartoonAvatarSvg(cfg: CharacterConfig): string {
  const skinL = cfg.skinLight || '#FFDFC4';
  const skinD = cfg.skinDark || '#E0A378';
  const hair = cfg.hairColor || '#1E293B';
  const out1 = cfg.outfitColor1 || '#10B981';
  const out2 = cfg.outfitColor2 || '#047857';

  // Common 3D Defs (Radial specular lighting, soft clay drop shadows, ambient rim light)
  const defs = `
    <defs>
      <linearGradient id="bg_${cfg.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${cfg.bg1}" />
        <stop offset="100%" stop-color="${cfg.bg2}" />
      </linearGradient>
      <radialGradient id="glow_${cfg.id}" cx="32%" cy="25%" r="70%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28" />
        <stop offset="55%" stop-color="${cfg.ringColor}" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.35" />
      </radialGradient>
      <radialGradient id="skin_${cfg.id}" cx="35%" cy="28%" r="68%">
        <stop offset="0%" stop-color="${skinL}" />
        <stop offset="72%" stop-color="${skinD}" />
        <stop offset="100%" stop-color="#B67650" />
      </radialGradient>
      <linearGradient id="out_${cfg.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${out1}" />
        <stop offset="100%" stop-color="${out2}" />
      </linearGradient>
      <radialGradient id="eye_${cfg.id}" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#334155" />
        <stop offset="100%" stop-color="#020617" />
      </radialGradient>
      <filter id="shadow_${cfg.id}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.42" />
      </filter>
      <filter id="soft_${cfg.id}" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.28" />
      </filter>
    </defs>
  `;

  const baseBg = `
    <rect width="400" height="400" rx="200" fill="url(#bg_${cfg.id})" />
    <circle cx="200" cy="200" r="192" fill="url(#glow_${cfg.id})" />
    <circle cx="200" cy="200" r="176" fill="none" stroke="${cfg.ringColor}" stroke-opacity="0.28" stroke-width="4" />
    <circle cx="115" cy="85" r="42" fill="#FFFFFF" fill-opacity="0.07" />
  `;

  let characterBody = '';

  if (cfg.kind === 'fox') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <!-- 3D Hoodie Shoulders -->
        <path d="M85 390 C85 305 135 280 200 280 C265 280 315 305 315 390 Z" fill="url(#out_${cfg.id})" />
        <!-- 3D Fox Ears -->
        <polygon points="105,175 125,68 175,140" fill="#EA580C" />
        <polygon points="118,162 130,88 164,140" fill="#FDE68A" />
        <polygon points="295,175 275,68 225,140" fill="#EA580C" />
        <polygon points="282,162 270,88 236,140" fill="#FDE68A" />
        <!-- 3D Fox Head -->
        <ellipse cx="200" cy="200" rx="88" ry="76" fill="#F97316" />
        <path d="M112 205 C140 205 168 235 200 265 C232 235 260 205 288 205 C282 248 245 276 200 276 C155 276 118 248 112 205 Z" fill="#FFFBEB" />
        <!-- 3D Glossy Eyes -->
        <circle cx="162" cy="190" r="15" fill="#0F172A" />
        <circle cx="157" cy="184" r="5" fill="#FFFFFF" />
        <circle cx="238" cy="190" r="15" fill="#0F172A" />
        <circle cx="233" cy="184" r="5" fill="#FFFFFF" />
        <!-- 3D Nose & Smile -->
        <ellipse cx="200" cy="222" rx="13" ry="9" fill="#0F172A" />
        <ellipse cx="196" cy="219" rx="4" ry="2.5" fill="#FFFFFF" fill-opacity="0.7" />
        <path d="M186 238 Q200 250 214 238" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'panda') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <path d="M85 390 C85 305 135 280 200 280 C265 280 315 305 315 390 Z" fill="url(#out_${cfg.id})" />
        <circle cx="122" cy="118" r="32" fill="#0F172A" />
        <circle cx="278" cy="118" r="32" fill="#0F172A" />
        <circle cx="200" cy="198" r="84" fill="#F8FAFC" />
        <!-- Eye Patches -->
        <ellipse cx="160" cy="192" rx="24" ry="20" transform="rotate(-14 160 192)" fill="#0F172A" />
        <ellipse cx="240" cy="192" rx="24" ry="20" transform="rotate(14 240 192)" fill="#0F172A" />
        <circle cx="162" cy="190" r="11" fill="#FFFFFF" />
        <circle cx="162" cy="190" r="7" fill="#0F172A" />
        <circle cx="159" cy="187" r="3" fill="#FFFFFF" />
        <circle cx="238" cy="190" r="11" fill="#FFFFFF" />
        <circle cx="238" cy="190" r="7" fill="#0F172A" />
        <circle cx="235" cy="187" r="3" fill="#FFFFFF" />
        <!-- Cheeks & Nose -->
        <ellipse cx="132" cy="216" rx="12" ry="7" fill="#FB7185" fill-opacity="0.55" />
        <ellipse cx="268" cy="216" rx="12" ry="7" fill="#FB7185" fill-opacity="0.55" />
        <ellipse cx="200" cy="215" rx="12" ry="8" fill="#0F172A" />
        <path d="M186 232 Q200 245 214 232" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'cat') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <path d="M85 390 C85 305 135 280 200 280 C265 280 315 305 315 390 Z" fill="url(#out_${cfg.id})" />
        <polygon points="112,175 124,78 180,136" fill="#C084FC" />
        <polygon points="124,160 132,96 168,136" fill="#F472B6" />
        <polygon points="288,175 276,78 220,136" fill="#C084FC" />
        <polygon points="276,160 268,96 232,136" fill="#F472B6" />
        <ellipse cx="200" cy="198" rx="84" ry="74" fill="#E9D5FF" />
        <circle cx="162" cy="192" r="15" fill="#1E1B4B" />
        <circle cx="157" cy="186" r="5" fill="#FFFFFF" />
        <circle cx="238" cy="192" r="15" fill="#1E1B4B" />
        <circle cx="233" cy="186" r="5" fill="#FFFFFF" />
        <polygon points="192,214 208,214 200,224" fill="#F43F5E" />
        <path d="M184 232 Q192 240 200 232 Q208 240 216 232" fill="none" stroke="#1E1B4B" stroke-width="4" stroke-linecap="round" />
        <!-- Whiskers -->
        <line x1="102" y1="205" x2="134" y2="210" stroke="#9333EA" stroke-width="3" stroke-linecap="round" />
        <line x1="102" y1="220" x2="134" y2="220" stroke="#9333EA" stroke-width="3" stroke-linecap="round" />
        <line x1="298" y1="205" x2="266" y2="210" stroke="#9333EA" stroke-width="3" stroke-linecap="round" />
        <line x1="298" y1="220" x2="266" y2="220" stroke="#9333EA" stroke-width="3" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'lion') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <path d="M85 390 C85 305 135 280 200 280 C265 280 315 305 315 390 Z" fill="url(#out_${cfg.id})" />
        <!-- 3D Lion Mane -->
        <circle cx="200" cy="196" r="102" fill="#B45309" />
        <circle cx="135" cy="128" r="24" fill="#D97706" />
        <circle cx="265" cy="128" r="24" fill="#D97706" />
        <circle cx="200" cy="198" r="74" fill="#FBBF24" />
        <circle cx="166" cy="188" r="13" fill="#0F172A" />
        <circle cx="162" cy="183" r="4.5" fill="#FFFFFF" />
        <circle cx="234" cy="188" r="13" fill="#0F172A" />
        <circle cx="230" cy="183" r="4.5" fill="#FFFFFF" />
        <ellipse cx="200" cy="218" rx="26" ry="20" fill="#FEF3C7" />
        <polygon points="190,208 210,208 200,220" fill="#78350F" />
        <path d="M186 228 Q200 240 214 228" fill="none" stroke="#78350F" stroke-width="4" stroke-linecap="round" />
        <!-- 3D Golden Crown -->
        <polygon points="152,112 168,72 200,98 232,72 248,112" fill="#FACC15" stroke="#CA8A04" stroke-width="3" />
        <circle cx="200" cy="92" r="5" fill="#10B981" />
      </g>
    `;
  } else if (cfg.kind === 'astro') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <!-- 3D Space Suit -->
        <path d="M75 395 C75 298 130 272 200 272 C270 272 325 298 325 395 Z" fill="#F8FAFC" />
        <rect x="162" y="305" width="76" height="44" rx="12" fill="#0F172A" stroke="#38BDF8" stroke-width="3" />
        <!-- 3D Helmet -->
        <circle cx="200" cy="188" r="96" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="4" />
        <!-- Reflective Nebula Visor -->
        <rect x="122" y="132" width="156" height="106" rx="52" fill="#090D16" stroke="#38BDF8" stroke-width="4" />
        <path d="M142 152 Q200 135 252 162" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="8" stroke-linecap="round" />
        <!-- Glowing Eyes Inside Visor -->
        <ellipse cx="168" cy="186" rx="14" ry="18" fill="#38BDF8" />
        <circle cx="164" cy="180" r="5" fill="#FFFFFF" />
        <ellipse cx="232" cy="186" rx="14" ry="18" fill="#38BDF8" />
        <circle cx="228" cy="180" r="5" fill="#FFFFFF" />
        <path d="M185 212 Q200 224 215 212" fill="none" stroke="#34D399" stroke-width="4" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'robot') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <path d="M90 390 C90 308 138 282 200 282 C262 282 310 308 310 390 Z" fill="url(#out_${cfg.id})" />
        <!-- Antenna -->
        <line x1="200" y1="68" x2="200" y2="108" stroke="#38BDF8" stroke-width="6" stroke-linecap="round" />
        <circle cx="200" cy="64" r="12" fill="#10B981" />
        <!-- 3D Bot Head -->
        <rect x="114" y="106" width="172" height="148" rx="44" fill="#F1F5F9" stroke="#94A3B8" stroke-width="4" />
        <rect x="134" y="130" width="132" height="96" rx="28" fill="#0F172A" stroke="#10B981" stroke-width="3" />
        <!-- LED Eyes -->
        <circle cx="170" cy="172" r="16" fill="#10B981" />
        <circle cx="166" cy="167" r="5" fill="#FFFFFF" />
        <circle cx="230" cy="172" r="16" fill="#10B981" />
        <circle cx="226" cy="167" r="5" fill="#FFFFFF" />
        <path d="M180 202 Q200 216 220 202" fill="none" stroke="#38BDF8" stroke-width="5" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'koala' || cfg.kind === 'owl' || cfg.kind === 'penguin' || cfg.kind === 'unicorn' || cfg.kind === 'dragon') {
    const bodyCol =
      cfg.kind === 'koala'
        ? '#94A3B8'
        : cfg.kind === 'owl'
        ? '#0284C7'
        : cfg.kind === 'penguin'
        ? '#1E293B'
        : cfg.kind === 'unicorn'
        ? '#FDF4FF'
        : '#10B981';
    const bellyCol =
      cfg.kind === 'koala'
        ? '#E2E8F0'
        : cfg.kind === 'owl'
        ? '#BAE6FD'
        : cfg.kind === 'penguin'
        ? '#F8FAFC'
        : cfg.kind === 'unicorn'
        ? '#FCE7F3'
        : '#A7F3D0';
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <path d="M85 390 C85 305 135 280 200 280 C265 280 315 305 315 390 Z" fill="url(#out_${cfg.id})" />
        <circle cx="120" cy="138" r="36" fill="${bodyCol}" />
        <circle cx="120" cy="138" r="20" fill="${bellyCol}" />
        <circle cx="280" cy="138" r="36" fill="${bodyCol}" />
        <circle cx="280" cy="138" r="20" fill="${bellyCol}" />
        ${
          cfg.kind === 'unicorn'
            ? '<polygon points="184,118 216,118 200,52" fill="#FACC15" stroke="#CA8A04" stroke-width="3" />'
            : ''
        }
        <circle cx="200" cy="196" r="82" fill="${bodyCol}" />
        <ellipse cx="200" cy="212" rx="60" ry="52" fill="${bellyCol}" />
        <circle cx="164" cy="184" r="14" fill="#0F172A" />
        <circle cx="160" cy="179" r="5" fill="#FFFFFF" />
        <circle cx="236" cy="184" r="14" fill="#0F172A" />
        <circle cx="232" cy="179" r="5" fill="#FFFFFF" />
        <ellipse cx="200" cy="206" rx="14" ry="10" fill="${cfg.kind === 'penguin' || cfg.kind === 'owl' ? '#F59E0B' : '#0F172A'}" />
        <path d="M185 228 Q200 242 215 228" fill="none" stroke="#0F172A" stroke-width="4" stroke-linecap="round" />
      </g>
    `;
  } else if (cfg.kind === 'group') {
    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        <!-- Left Member -->
        <circle cx="118" cy="195" r="46" fill="#FBBF24" />
        <path d="M62 340 C62 278 88 255 118 255 C148 255 174 278 174 340 Z" fill="#6366F1" />
        <circle cx="104" cy="190" r="6" fill="#0F172A" />
        <circle cx="132" cy="190" r="6" fill="#0F172A" />
        <path d="M106 208 Q118 218 130 208" fill="none" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round" />
        <!-- Right Member -->
        <circle cx="282" cy="195" r="46" fill="#F472B6" />
        <path d="M226 340 C226 278 252 255 282 255 C312 255 338 278 338 340 Z" fill="#06B6D4" />
        <circle cx="268" cy="190" r="6" fill="#0F172A" />
        <circle cx="296" cy="190" r="6" fill="#0F172A" />
        <path d="M270 208 Q282 218 294 208" fill="none" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round" />
        <!-- Center Lead Character -->
        <path d="M115 385 C115 298 152 270 200 270 C248 270 285 298 285 385 Z" fill="url(#out_${cfg.id})" />
        <circle cx="200" cy="178" r="62" fill="url(#skin_${cfg.id})" />
        <path d="M138 168 C138 118 262 118 262 168 C250 142 150 142 138 168 Z" fill="#0F172A" />
        <circle cx="178" cy="176" r="9" fill="#0F172A" />
        <circle cx="175" cy="173" r="3" fill="#FFFFFF" />
        <circle cx="222" cy="176" r="9" fill="#0F172A" />
        <circle cx="219" cy="173" r="3" fill="#FFFFFF" />
        <path d="M184 202 Q200 215 216 202" fill="none" stroke="#0F172A" stroke-width="4" stroke-linecap="round" />
      </g>
    `;
  } else {
    // 3D Stylized Human Cartoon Character (Pixar / Memoji / 3D Clay Aesthetic)
    const hairBack =
      cfg.hairStyle === 'long' || cfg.hairStyle === 'wavy'
        ? `<path d="M108 175 C102 255 112 310 132 325 L268 325 C288 310 298 255 292 175 Z" fill="${hair}" />`
        : '';

    let hairTop = '';
    if (cfg.hairStyle === 'quiff' || cfg.hairStyle === 'pomp') {
      hairTop = `<path d="M112 172 C108 105 155 76 212 82 C268 88 292 122 288 172 C265 132 225 122 175 130 C142 135 122 152 112 172 Z" fill="${hair}" />`;
    } else if (cfg.hairStyle === 'spiky') {
      hairTop = `<path d="M110 172 L125 98 L158 118 L195 75 L228 112 L265 88 L288 168 C258 132 145 132 110 172 Z" fill="${hair}" />`;
    } else if (cfg.hairStyle === 'wavy' || cfg.hairStyle === 'long') {
      hairTop = `<path d="M108 182 C106 104 152 84 200 84 C248 84 294 104 292 182 C268 136 232 126 200 128 C168 126 132 136 108 182 Z" fill="${hair}" />`;
    } else {
      hairTop = `<path d="M115 168 C115 106 154 88 200 88 C246 88 285 106 285 168 C262 138 138 138 115 168 Z" fill="${hair}" />`;
    }

    let accessorySvg = '';
    if (cfg.accessory === 'visor') {
      accessorySvg = `
        <rect x="126" y="162" width="148" height="38" rx="19" fill="#06B6D4" fill-opacity="0.82" stroke="#67E8F9" stroke-width="3.5" />
        <path d="M142 172 L215 172" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="4" stroke-linecap="round" />
      `;
    } else if (cfg.accessory === 'round_glasses') {
      accessorySvg = `
        <circle cx="162" cy="182" r="24" fill="#FFFFFF" fill-opacity="0.12" stroke="#FBBF24" stroke-width="4" />
        <circle cx="238" cy="182" r="24" fill="#FFFFFF" fill-opacity="0.12" stroke="#FBBF24" stroke-width="4" />
        <line x1="186" y1="182" x2="214" y2="182" stroke="#FBBF24" stroke-width="4" />
      `;
    } else if (cfg.accessory === 'shades') {
      accessorySvg = `
        <rect x="132" y="164" width="62" height="34" rx="10" fill="#0F172A" stroke="#F8FAFC" stroke-width="3" />
        <rect x="206" y="164" width="62" height="34" rx="10" fill="#0F172A" stroke="#F8FAFC" stroke-width="3" />
        <line x1="194" y1="176" x2="206" y2="176" stroke="#F8FAFC" stroke-width="4" />
      `;
    } else if (cfg.accessory === 'headphones' || cfg.accessory === 'gaming_headset') {
      const hpCol = cfg.accessory === 'gaming_headset' ? '#EC4899' : '#10B981';
      accessorySvg = `
        <path d="M104 190 C104 102 296 102 296 190" fill="none" stroke="${hpCol}" stroke-width="12" stroke-linecap="round" />
        <rect x="92" y="162" width="26" height="58" rx="13" fill="${hpCol}" stroke="#0F172A" stroke-width="3" />
        <rect x="282" y="162" width="26" height="58" rx="13" fill="${hpCol}" stroke="#0F172A" stroke-width="3" />
      `;
    } else if (cfg.accessory === 'crown') {
      accessorySvg = `
        <polygon points="148,104 166,64 200,90 234,64 252,104" fill="#FACC15" stroke="#CA8A04" stroke-width="3" />
        <circle cx="200" cy="84" r="5" fill="#F43F5E" />
      `;
    }

    characterBody = `
      <g filter="url(#shadow_${cfg.id})">
        ${hairBack}
        <!-- 3D Neck & Stylized Hoodie/Jacket Torso -->
        <rect x="176" y="248" width="48" height="48" rx="20" fill="url(#skin_${cfg.id})" />
        <path d="M78 395 C78 302 128 274 200 274 C272 274 322 302 322 395 Z" fill="url(#out_${cfg.id})" />
        <path d="M156 276 Q200 315 244 276" fill="none" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="5" stroke-linecap="round" />
        <!-- 3D Ears -->
        <circle cx="116" cy="192" r="18" fill="url(#skin_${cfg.id})" />
        <circle cx="284" cy="192" r="18" fill="url(#skin_${cfg.id})" />
        <!-- 3D Sculpted Head -->
        <rect x="120" y="108" width="160" height="156" rx="76" fill="url(#skin_${cfg.id})" />
        <!-- Cheek Blush / Subsurface Warmth -->
        <ellipse cx="146" cy="204" rx="14" ry="8" fill="#F43F5E" fill-opacity="0.26" />
        <ellipse cx="254" cy="204" rx="14" ry="8" fill="#F43F5E" fill-opacity="0.26" />
        <!-- Eyebrows -->
        <path d="M146 160 Q162 152 178 158" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round" />
        <path d="M222 158 Q238 152 254 160" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round" />
        <!-- 3D Eyes with Catchlights -->
        <circle cx="162" cy="182" r="12.5" fill="url(#eye_${cfg.id})" />
        <circle cx="158" cy="177" r="4.5" fill="#FFFFFF" />
        <circle cx="166" cy="186" r="2" fill="#FFFFFF" fill-opacity="0.8" />
        <circle cx="238" cy="182" r="12.5" fill="url(#eye_${cfg.id})" />
        <circle cx="234" cy="177" r="4.5" fill="#FFFFFF" />
        <circle cx="242" cy="186" r="2" fill="#FFFFFF" fill-opacity="0.8" />
        <!-- 3D Nose -->
        <path d="M196 188 Q200 204 208 202" fill="none" stroke="#B67650" stroke-width="4" stroke-linecap="round" />
        <!-- 3D Mouth / Expression -->
        ${
          cfg.expression === 'grin'
            ? `<path d="M178 220 Q200 242 222 220 Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="3" />`
            : `<path d="M180 222 Q200 238 220 222" fill="none" stroke="#7C2D12" stroke-width="5" stroke-linecap="round" />`
        }
        ${hairTop}
        ${accessorySvg}
      </g>
    `;
  }

  const badge = cfg.badgeEmoji
    ? `
      <g filter="url(#soft_${cfg.id})">
        <circle cx="318" cy="318" r="38" fill="#0F172A" stroke="${cfg.ringColor}" stroke-width="3.5" />
        <text x="318" y="331" font-size="36" text-anchor="middle">${cfg.badgeEmoji}</text>
      </g>
    `
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">${defs}${baseBg}${characterBody}${badge}</svg>`;
}

export const CARTOON_3D_AVATARS: CartoonAvatarPreset[] = [
  {
    id: 'alex_3d',
    label: 'Alex · 3D Cyber Explorer',
    subtitle: 'Emerald Visor & Tech Hoodie',
    category: '3D Characters',
    accentColor: '#10B981',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'alex_3d',
        bg1: '#064E3B',
        bg2: '#022C22',
        ringColor: '#10B981',
        kind: 'human',
        skinLight: '#FFE0C8',
        skinDark: '#E2A780',
        hairColor: '#0F172A',
        hairStyle: 'quiff',
        outfitColor1: '#10B981',
        outfitColor2: '#047857',
        accessory: 'visor',
        expression: 'grin',
        badgeEmoji: '⚡',
      })
    ),
  },
  {
    id: 'elena_3d',
    label: 'Elena · 3D Crypto Scientist',
    subtitle: 'Gold Frames & Emerald Glow',
    category: '3D Characters',
    accentColor: '#14B8A6',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'elena_3d',
        bg1: '#0F766E',
        bg2: '#0F172A',
        ringColor: '#2DD4BF',
        kind: 'human',
        skinLight: '#FFECE0',
        skinDark: '#E6B89C',
        hairColor: '#7C2D12',
        hairStyle: 'wavy',
        outfitColor1: '#06B6D4',
        outfitColor2: '#0E7490',
        accessory: 'round_glasses',
        expression: 'smile',
        badgeEmoji: '🔐',
      })
    ),
  },
  {
    id: 'marcus_3d',
    label: 'Marcus · 3D Audio Producer',
    subtitle: 'Studio Headphones & Indigo Vibe',
    category: '3D Characters',
    accentColor: '#6366F1',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'marcus_3d',
        bg1: '#3730A3',
        bg2: '#1E1B4B',
        ringColor: '#818CF8',
        kind: 'human',
        skinLight: '#C6865A',
        skinDark: '#8D5524',
        hairColor: '#090D16',
        hairStyle: 'fade',
        outfitColor1: '#6366F1',
        outfitColor2: '#4338CA',
        accessory: 'headphones',
        expression: 'grin',
        badgeEmoji: '🎧',
      })
    ),
  },
  {
    id: 'sora_3d',
    label: 'Sora · 3D Neo Designer',
    subtitle: 'Spiky Hair & Solar Gold Jacket',
    category: '3D Characters',
    accentColor: '#F59E0B',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'sora_3d',
        bg1: '#9A3412',
        bg2: '#431407',
        ringColor: '#FBBF24',
        kind: 'human',
        skinLight: '#FFF0E5',
        skinDark: '#E8BC9E',
        hairColor: '#1E1B4B',
        hairStyle: 'spiky',
        outfitColor1: '#F59E0B',
        outfitColor2: '#B45309',
        accessory: 'shades',
        expression: 'grin',
        badgeEmoji: '🎨',
      })
    ),
  },
  {
    id: 'priya_3d',
    label: 'Priya · 3D Security Architect',
    subtitle: 'Rose-Violet Studio & Crown Pin',
    category: '3D Characters',
    accentColor: '#EC4899',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'priya_3d',
        bg1: '#831843',
        bg2: '#2E1065',
        ringColor: '#F472B6',
        kind: 'human',
        skinLight: '#E5A97E',
        skinDark: '#B87A50',
        hairColor: '#0F172A',
        hairStyle: 'long',
        outfitColor1: '#EC4899',
        outfitColor2: '#BE185D',
        accessory: 'round_glasses',
        expression: 'smile',
        badgeEmoji: '🛡️',
      })
    ),
  },
  {
    id: 'david_3d',
    label: 'David · 3D Tech Strategist',
    subtitle: 'Oceanic Cyan & Classic Quiff',
    category: '3D Characters',
    accentColor: '#06B6D4',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'david_3d',
        bg1: '#155E75',
        bg2: '#082F49',
        ringColor: '#38BDF8',
        kind: 'human',
        skinLight: '#FFE4CE',
        skinDark: '#DCA27A',
        hairColor: '#451A03',
        hairStyle: 'pomp',
        outfitColor1: '#0284C7',
        outfitColor2: '#0369A1',
        accessory: 'none',
        expression: 'grin',
        badgeEmoji: '🚀',
      })
    ),
  },
  {
    id: 'fox_3d',
    label: 'Blaze · 3D Cyber Fox',
    subtitle: '3D Plush Fox Mascot',
    category: '3D Mascots',
    accentColor: '#F97316',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'fox_3d',
        bg1: '#7C2D12',
        bg2: '#0F172A',
        ringColor: '#FB923C',
        kind: 'fox',
        outfitColor1: '#10B981',
        outfitColor2: '#047857',
        badgeEmoji: '🦊',
      })
    ),
  },
  {
    id: 'panda_3d',
    label: 'Boba · 3D Chill Panda',
    subtitle: '3D Plush Panda Mascot',
    category: '3D Mascots',
    accentColor: '#10B981',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'panda_3d',
        bg1: '#065F46',
        bg2: '#0F172A',
        ringColor: '#34D399',
        kind: 'panda',
        outfitColor1: '#10B981',
        outfitColor2: '#059669',
        badgeEmoji: '🐼',
      })
    ),
  },
  {
    id: 'cat_3d',
    label: 'Neko · 3D Neon Cat',
    subtitle: '3D Cyber Kitty Mascot',
    category: '3D Mascots',
    accentColor: '#A855F7',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'cat_3d',
        bg1: '#581C87',
        bg2: '#1E1B4B',
        ringColor: '#C084FC',
        kind: 'cat',
        outfitColor1: '#EC4899',
        outfitColor2: '#9333EA',
        badgeEmoji: '🐱',
      })
    ),
  },
  {
    id: 'lion_3d',
    label: 'Leo · 3D Royal Lion',
    subtitle: 'Golden Crown & Mane',
    category: '3D Mascots',
    accentColor: '#FACC15',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'lion_3d',
        bg1: '#78350F',
        bg2: '#1E1B4B',
        ringColor: '#FACC15',
        kind: 'lion',
        outfitColor1: '#F59E0B',
        outfitColor2: '#B45309',
        badgeEmoji: '🦁',
      })
    ),
  },
  {
    id: 'astro_3d',
    label: 'Nova · 3D Starlight Astronaut',
    subtitle: 'Reflective Nebula Space Visor',
    category: '3D Cyber & Sci-Fi',
    accentColor: '#38BDF8',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'astro_3d',
        bg1: '#0F172A',
        bg2: '#1E1B4B',
        ringColor: '#38BDF8',
        kind: 'astro',
        badgeEmoji: '👩‍🚀',
      })
    ),
  },
  {
    id: 'robot_3d',
    label: 'Bit-9 · 3D Friendly Bot',
    subtitle: 'Glossy AI Companion Droid',
    category: '3D Cyber & Sci-Fi',
    accentColor: '#2DD4BF',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'robot_3d',
        bg1: '#134E4A',
        bg2: '#090D16',
        ringColor: '#2DD4BF',
        kind: 'robot',
        outfitColor1: '#06B6D4',
        outfitColor2: '#0E7490',
        badgeEmoji: '🤖',
      })
    ),
  },
  {
    id: 'gamer_3d',
    label: 'Rex · 3D Pro Gamer',
    subtitle: 'RGB Headset & Neon Hoodie',
    category: '3D Cyber & Sci-Fi',
    accentColor: '#EC4899',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'gamer_3d',
        bg1: '#4C1D95',
        bg2: '#090D16',
        ringColor: '#F472B6',
        kind: 'human',
        skinLight: '#FFE2CC',
        skinDark: '#DAA078',
        hairColor: '#6366F1',
        hairStyle: 'spiky',
        outfitColor1: '#EC4899',
        outfitColor2: '#7E22CE',
        accessory: 'gaming_headset',
        expression: 'grin',
        badgeEmoji: '🎮',
      })
    ),
  },
  {
    id: 'queen_3d',
    label: 'Zara · 3D Royal VIP',
    subtitle: 'Golden Crown & Starlight Glow',
    category: '3D VIP & Fun',
    accentColor: '#FBBF24',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'queen_3d',
        bg1: '#713F12',
        bg2: '#31102F',
        ringColor: '#FDE047',
        kind: 'human',
        skinLight: '#D8966C',
        skinDark: '#9E613A',
        hairColor: '#1E1B4B',
        hairStyle: 'wavy',
        outfitColor1: '#F59E0B',
        outfitColor2: '#BE185D',
        accessory: 'crown',
        expression: 'smile',
        badgeEmoji: '👑',
      })
    ),
  },
  {
    id: 'koala_3d',
    label: 'Koko · 3D Cozy Koala',
    subtitle: 'Fluffy Eucalyptus Friend',
    category: '3D Mascots',
    accentColor: '#38BDF8',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'koala_3d',
        bg1: '#1E293B',
        bg2: '#0F172A',
        ringColor: '#38BDF8',
        kind: 'koala',
        outfitColor1: '#10B981',
        outfitColor2: '#059669',
        badgeEmoji: '🐨',
      })
    ),
  },
  {
    id: 'unicorn_3d',
    label: 'Starlight · 3D Magic Unicorn',
    subtitle: 'Golden Horn & Pastel Dream',
    category: '3D VIP & Fun',
    accentColor: '#F472B6',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'unicorn_3d',
        bg1: '#701A75',
        bg2: '#1E1B4B',
        ringColor: '#F472B6',
        kind: 'unicorn',
        outfitColor1: '#EC4899',
        outfitColor2: '#8B5CF6',
        badgeEmoji: '🦄',
      })
    ),
  },
  {
    id: 'owl_3d',
    label: 'Athena · 3D Night Owl',
    subtitle: 'Wise Cyber Scholar',
    category: '3D Mascots',
    accentColor: '#38BDF8',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'owl_3d',
        bg1: '#0C4A6E',
        bg2: '#090D16',
        ringColor: '#38BDF8',
        kind: 'owl',
        outfitColor1: '#0284C7',
        outfitColor2: '#1D4ED8',
        badgeEmoji: '🦉',
      })
    ),
  },
  {
    id: 'penguin_3d',
    label: 'Tux · 3D Arctic Penguin',
    subtitle: 'Cool Ice Explorer',
    category: '3D Mascots',
    accentColor: '#06B6D4',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'penguin_3d',
        bg1: '#164E63',
        bg2: '#0F172A',
        ringColor: '#67E8F9',
        kind: 'penguin',
        outfitColor1: '#06B6D4',
        outfitColor2: '#2563EB',
        badgeEmoji: '🐧',
      })
    ),
  },
  {
    id: 'dragon_3d',
    label: 'Draco · 3D Jade Dragon',
    subtitle: 'Mythic Emerald Guardian',
    category: '3D VIP & Fun',
    accentColor: '#10B981',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'dragon_3d',
        bg1: '#064E3B',
        bg2: '#090D16',
        ringColor: '#34D399',
        kind: 'dragon',
        outfitColor1: '#F59E0B',
        outfitColor2: '#D97706',
        badgeEmoji: '🐉',
      })
    ),
  },
  {
    id: 'team_group_3d',
    label: 'Squad · 3D Core Team Trio',
    subtitle: '3D Group Avatar',
    category: '3D VIP & Fun',
    accentColor: '#06B6D4',
    url: svgToDataUrl(
      build3DCartoonAvatarSvg({
        id: 'team_group_3d',
        bg1: '#0F766E',
        bg2: '#1E1B4B',
        ringColor: '#2DD4BF',
        kind: 'group',
        skinLight: '#FFE0C8',
        skinDark: '#DCA078',
        outfitColor1: '#10B981',
        outfitColor2: '#059669',
        badgeEmoji: '🛡️',
      })
    ),
  },
];

export const AVATAR_3D_BY_ID: Record<string, string> = Object.fromEntries(
  CARTOON_3D_AVATARS.map((a) => [a.id, a.url])
);

/**
 * Automatically replaces any legacy real-life person Unsplash URL with a 3D Cartoon Avatar
 */
export function ensure3DCartoonAvatarUrl(url?: string, nameOrId?: string): string {
  const key = (nameOrId || '').toLowerCase();
  const isLegacyUnsplash = !url || url.includes('images.unsplash.com');

  if (!isLegacyUnsplash && url) {
    return url;
  }

  if (key.includes('elena')) return AVATAR_3D_BY_ID.elena_3d;
  if (key.includes('marcus') || key.includes('mvance')) return AVATAR_3D_BY_ID.marcus_3d;
  if (key.includes('sora')) return AVATAR_3D_BY_ID.sora_3d;
  if (key.includes('priya')) return AVATAR_3D_BY_ID.priya_3d;
  if (key.includes('david')) return AVATAR_3D_BY_ID.david_3d;
  if (key.includes('team') || key.includes('group') || key.includes('archive')) {
    return AVATAR_3D_BY_ID.team_group_3d;
  }
  if (key.includes('source') || key.includes('vault')) return AVATAR_3D_BY_ID.astro_3d;
  if (key.includes('alex') || key.includes('usr_self')) return AVATAR_3D_BY_ID.alex_3d;

  // Deterministic pick from CARTOON_3D_AVATARS
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CARTOON_3D_AVATARS[hash % CARTOON_3D_AVATARS.length].url;
}

export function getDeterministic3DAvatar(seed: string): CartoonAvatarPreset {
  const key = (seed || 'user').toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CARTOON_3D_AVATARS[hash % CARTOON_3D_AVATARS.length];
}

/**
 * Build a 3D Cartoon Sticker Badge SVG Data URL for Chats & Media Editor
 */
function build3DStickerSvg(
  id: string,
  emoji: string,
  label: string,
  c1: string,
  c2: string,
  accent: string
): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260" width="260" height="260">
      <defs>
        <radialGradient id="stk_bg_${id}" cx="35%" cy="28%" r="72%">
          <stop offset="0%" stop-color="${c1}" />
          <stop offset="100%" stop-color="${c2}" />
        </radialGradient>
        <filter id="stk_sh_${id}" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#stk_sh_${id})">
        <circle cx="130" cy="122" r="96" fill="url(#stk_bg_${id})" stroke="#FFFFFF" stroke-width="6" />
        <ellipse cx="98" cy="72" rx="36" ry="18" transform="rotate(-22 98 72)" fill="#FFFFFF" fill-opacity="0.28" />
        <text x="130" y="142" font-size="86" text-anchor="middle">${emoji}</text>
        <rect x="24" y="192" width="212" height="44" rx="22" fill="#0F172A" stroke="${accent}" stroke-width="3.5" />
        <text x="130" y="220" font-family="system-ui, sans-serif" font-weight="900" font-size="18" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.8">${label}</text>
      </g>
    </svg>
  `;
  return svgToDataUrl(svg);
}

export const CARTOON_3D_STICKERS: Cartoon3DSticker[] = [
  {
    id: 'stk3d_rocket',
    title: 'TO THE MOON!',
    subtitle: 'Full speed ahead',
    emoji: '🚀',
    category: 'vibes',
    accentColor: '#10B981',
    gradient: 'from-emerald-500/30 via-teal-500/20 to-cyan-500/30 border-emerald-400/50',
    url: build3DStickerSvg('rocket', '🚀', 'TO THE MOON!', '#10B981', '#047857', '#34D399'),
  },
  {
    id: 'stk3d_fire',
    title: 'ABSOLUTE FIRE',
    subtitle: '100% Legendary',
    emoji: '🔥',
    category: 'reactions',
    accentColor: '#F59E0B',
    gradient: 'from-amber-500/30 via-orange-500/25 to-rose-500/30 border-amber-400/50',
    url: build3DStickerSvg('fire', '🔥', 'LIT 100%', '#F97316', '#9A3412', '#FBBF24'),
  },
  {
    id: 'stk3d_love',
    title: 'SENDING LOVE',
    subtitle: 'Warmest 3D vibes',
    emoji: '🥰',
    category: 'reactions',
    accentColor: '#EC4899',
    gradient: 'from-rose-500/30 via-pink-500/25 to-fuchsia-500/30 border-rose-400/50',
    url: build3DStickerSvg('love', '🥰', 'MUCH LOVE', '#EC4899', '#9D174D', '#F472B6'),
  },
  {
    id: 'stk3d_laugh',
    title: 'TOO FUNNY!',
    subtitle: 'Rolling on the floor',
    emoji: '🤣',
    category: 'reactions',
    accentColor: '#EAB308',
    gradient: 'from-yellow-500/30 via-amber-500/20 to-orange-500/30 border-yellow-400/50',
    url: build3DStickerSvg('laugh', '🤣', 'SO FUNNY!', '#EAB308', '#A16207', '#FDE047'),
  },
  {
    id: 'stk3d_party',
    title: 'PARTY TIME!',
    subtitle: 'Let’s celebrate',
    emoji: '🥳',
    category: 'vibes',
    accentColor: '#A855F7',
    gradient: 'from-purple-500/30 via-indigo-500/25 to-cyan-500/30 border-purple-400/50',
    url: build3DStickerSvg('party', '🥳', 'PARTY TIME', '#9333EA', '#4C1D95', '#C084FC'),
  },
  {
    id: 'stk3d_fox',
    title: '3D CYBER FOX',
    subtitle: 'Clever & fast',
    emoji: '🦊',
    category: 'mascots',
    accentColor: '#F97316',
    gradient: 'from-orange-500/30 via-amber-500/20 to-slate-900 border-orange-400/50',
    url: AVATAR_3D_BY_ID.fox_3d,
  },
  {
    id: 'stk3d_panda',
    title: 'CHILL PANDA',
    subtitle: 'Zero stress mode',
    emoji: '🐼',
    category: 'mascots',
    accentColor: '#10B981',
    gradient: 'from-emerald-500/30 via-teal-500/20 to-slate-900 border-emerald-400/50',
    url: AVATAR_3D_BY_ID.panda_3d,
  },
  {
    id: 'stk3d_cat',
    title: 'NEON KITTY',
    subtitle: 'Purr-fect vibes',
    emoji: '🐱',
    category: 'mascots',
    accentColor: '#C084FC',
    gradient: 'from-purple-500/30 via-pink-500/20 to-slate-900 border-purple-400/50',
    url: AVATAR_3D_BY_ID.cat_3d,
  },
  {
    id: 'stk3d_astro',
    title: 'SPACE RANGER',
    subtitle: 'Out of this world',
    emoji: '👩‍🚀',
    category: 'mascots',
    accentColor: '#38BDF8',
    gradient: 'from-cyan-500/30 via-blue-500/20 to-slate-900 border-cyan-400/50',
    url: AVATAR_3D_BY_ID.astro_3d,
  },
  {
    id: 'stk3d_robot',
    title: 'BEEP BOOP!',
    subtitle: '3D Bot approved',
    emoji: '🤖',
    category: 'mascots',
    accentColor: '#2DD4BF',
    gradient: 'from-teal-500/30 via-emerald-500/20 to-slate-900 border-teal-400/50',
    url: AVATAR_3D_BY_ID.robot_3d,
  },
  {
    id: 'stk3d_king',
    title: 'VIP LEGEND',
    subtitle: 'Boss mode activated',
    emoji: '👑',
    category: 'props',
    accentColor: '#FACC15',
    gradient: 'from-amber-400/30 via-yellow-500/20 to-emerald-500/25 border-amber-300/50',
    url: build3DStickerSvg('king', '👑', 'VIP LEGEND', '#CA8A04', '#713F12', '#FACC15'),
  },
  {
    id: 'stk3d_mindblown',
    title: 'MIND BLOWN',
    subtitle: 'Next-level genius',
    emoji: '🤯',
    category: 'reactions',
    accentColor: '#E879F9',
    gradient: 'from-fuchsia-500/30 via-purple-500/25 to-indigo-500/30 border-fuchsia-400/50',
    url: build3DStickerSvg('mindblown', '🤯', 'MIND BLOWN', '#C026D3', '#4A044E', '#F0ABFC'),
  },
  {
    id: 'stk3d_cool',
    title: 'STAY COOL',
    subtitle: 'Smooth operator',
    emoji: '😎',
    category: 'reactions',
    accentColor: '#06B6D4',
    gradient: 'from-cyan-500/30 via-sky-500/25 to-indigo-500/30 border-cyan-400/50',
    url: build3DStickerSvg('cool', '😎', 'STAY COOL', '#0284C7', '#0C4A6E', '#38BDF8'),
  },
  {
    id: 'stk3d_coffee',
    title: 'COFFEE FUEL',
    subtitle: 'Ready to roll',
    emoji: '☕',
    category: 'vibes',
    accentColor: '#D97706',
    gradient: 'from-amber-600/30 via-orange-500/20 to-yellow-500/25 border-amber-400/50',
    url: build3DStickerSvg('coffee', '☕', 'COFFEE TIME', '#D97706', '#78350F', '#FBBF24'),
  },
  {
    id: 'stk3d_gem',
    title: 'DIAMOND TIER',
    subtitle: 'Flawless quality',
    emoji: '💎',
    category: 'props',
    accentColor: '#38BDF8',
    gradient: 'from-sky-500/30 via-cyan-500/25 to-indigo-500/30 border-sky-400/50',
    url: build3DStickerSvg('gem', '💎', 'DIAMOND', '#0284C7', '#1E3A8A', '#7DD3FC'),
  },
  {
    id: 'stk3d_unicorn',
    title: 'PURE MAGIC',
    subtitle: '3D Unicorn Vibes',
    emoji: '🦄',
    category: 'mascots',
    accentColor: '#F472B6',
    gradient: 'from-pink-500/30 via-purple-500/25 to-indigo-500/30 border-pink-400/50',
    url: AVATAR_3D_BY_ID.unicorn_3d,
  },
];

/**
 * Stylized 3D / Illustrated Scene Artworks (Resilient SVG Data URLs — Never fail in sandboxes!)
 */
export const STYLED_3D_SCENES = {
  alpineSunset: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
      <defs>
        <linearGradient id="sky1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0F172A" />
          <stop offset="45%" stop-color="#1E1B4B" />
          <stop offset="80%" stop-color="#047857" />
          <stop offset="100%" stop-color="#10B981" />
        </linearGradient>
        <radialGradient id="sun1" cx="50%" cy="55%" r="35%">
          <stop offset="0%" stop-color="#FDE047" />
          <stop offset="50%" stop-color="#F97316" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#F97316" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#sky1)" />
      <circle cx="600" cy="430" r="240" fill="url(#sun1)" />
      <circle cx="600" cy="430" r="95" fill="#FEF08A" />
      <polygon points="0,620 260,310 520,620" fill="#1E293B" />
      <polygon points="260,310 355,425 260,395 185,435" fill="#38BDF8" fill-opacity="0.45" />
      <polygon points="340,620 640,240 940,620" fill="#0F172A" />
      <polygon points="640,240 740,365 640,335 550,375" fill="#34D399" fill-opacity="0.5" />
      <polygon points="720,620 1010,330 1200,560 1200,620" fill="#1E293B" />
      <rect y="600" width="1200" height="200" fill="#064E3B" />
      <ellipse cx="600" cy="680" rx="420" ry="32" fill="#34D399" fill-opacity="0.25" />
    </svg>
  `),
  cyberLab: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
      <defs>
        <linearGradient id="cbg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="50%" stop-color="#0F172A" />
          <stop offset="100%" stop-color="#064E3B" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#cbg)" />
      <g stroke="#10B981" stroke-opacity="0.2" stroke-width="2">
        <line x1="0" y1="200" x2="1200" y2="200" />
        <line x1="0" y1="400" x2="1200" y2="400" />
        <line x1="0" y1="600" x2="1200" y2="600" />
        <line x1="300" y1="0" x2="300" y2="800" />
        <line x1="600" y1="0" x2="600" y2="800" />
        <line x1="900" y1="0" x2="900" y2="800" />
      </g>
      <circle cx="600" cy="400" r="210" fill="#10B981" fill-opacity="0.12" stroke="#10B981" stroke-width="6" />
      <circle cx="600" cy="400" r="145" fill="#06B6D4" fill-opacity="0.15" stroke="#38BDF8" stroke-width="4" />
      <rect x="490" y="290" width="220" height="220" rx="36" fill="#0F172A" stroke="#34D399" stroke-width="5" />
      <text x="600" y="425" font-size="96" text-anchor="middle">🔐</text>
    </svg>
  `),
  neonHorizon: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
      <defs>
        <linearGradient id="nbg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E1B4B" />
          <stop offset="50%" stop-color="#4C1D95" />
          <stop offset="100%" stop-color="#831843" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#nbg)" />
      <circle cx="600" cy="360" r="180" fill="#F43F5E" fill-opacity="0.7" />
      <polygon points="100,650 380,340 660,650" fill="#1E1B4B" />
      <polygon points="520,650 840,290 1140,650" fill="#0F172A" />
      <rect y="640" width="1200" height="160" fill="#090D16" />
      <line x1="0" y1="640" x2="1200" y2="640" stroke="#38BDF8" stroke-width="5" />
    </svg>
  `),
  siliconChip: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
      <rect width="1200" height="800" fill="#090D16" />
      <rect x="320" y="160" width="560" height="480" rx="48" fill="#0F172A" stroke="#06B6D4" stroke-width="6" />
      <rect x="420" y="260" width="360" height="280" rx="28" fill="#064E3B" stroke="#10B981" stroke-width="4" />
      <text x="600" y="425" font-size="96" text-anchor="middle">⚡</text>
    </svg>
  `),
  get aurora_peaks() {
    return this.alpineSunset;
  },
  get neon_city() {
    return this.neonHorizon;
  },
  get cyber_studio() {
    return this.cyberLab;
  },
  get tropical_beach() {
    return this.alpineSunset;
  },
};
