import React, { useMemo, useState } from 'react';
import { Search, Sparkles, X, Send, Smile } from 'lucide-react';
import { CARTOON_3D_AVATARS, CARTOON_3D_STICKERS } from '../utils/cartoonAvatars';

export interface EmojiItem {
  char: string;
  name: string;
  keywords: string;
  skinSupport?: boolean;
}

export interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  items: EmojiItem[];
}

export interface ExpressiveSticker {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  gradient: string;
}

const SKIN_TONES = [
  { id: 'default', label: 'Default', modifier: '', preview: '👋' },
  { id: 'light', label: 'Light', modifier: '\u{1F3FB}', preview: '👋🏻' },
  { id: 'medium-light', label: 'Medium-Light', modifier: '\u{1F3FC}', preview: '👋🏼' },
  { id: 'medium', label: 'Medium', modifier: '\u{1F3FD}', preview: '👋🏽' },
  { id: 'medium-dark', label: 'Medium-Dark', modifier: '\u{1F3FE}', preview: '👋🏾' },
  { id: 'dark', label: 'Dark', modifier: '\u{1F3FF}', preview: '👋🏿' },
] as const;

export const EXPRESSIVE_STICKERS: ExpressiveSticker[] = [
  {
    id: 'stk_rocket',
    emoji: '🚀✨',
    title: 'TO THE MOON!',
    subtitle: 'Full speed ahead',
    gradient: 'from-emerald-500/30 via-teal-500/20 to-cyan-500/30 border-emerald-400/50',
  },
  {
    id: 'stk_fire',
    emoji: '🔥💯',
    title: 'ABSOLUTE FIRE',
    subtitle: '100% Legendary',
    gradient: 'from-amber-500/30 via-orange-500/25 to-rose-500/30 border-amber-400/50',
  },
  {
    id: 'stk_love',
    emoji: '❤️🥰',
    title: 'SENDING LOVE',
    subtitle: 'Warmest vibes',
    gradient: 'from-rose-500/30 via-pink-500/25 to-fuchsia-500/30 border-rose-400/50',
  },
  {
    id: 'stk_laugh',
    emoji: '🤣💀',
    title: 'TOO FUNNY!',
    subtitle: 'Cannot stop laughing',
    gradient: 'from-yellow-500/30 via-amber-500/20 to-orange-500/30 border-yellow-400/50',
  },
  {
    id: 'stk_party',
    emoji: '🎉🥳',
    title: 'PARTY TIME!',
    subtitle: 'Let’s celebrate',
    gradient: 'from-purple-500/30 via-indigo-500/25 to-cyan-500/30 border-purple-400/50',
  },
  {
    id: 'stk_crypto',
    emoji: '🔐🛡️',
    title: 'ZERO-KNOWLEDGE LOCKED',
    subtitle: 'Verified End-to-End Encrypted',
    gradient: 'from-emerald-600/30 via-cyan-600/25 to-slate-800 border-emerald-400/50',
  },
  {
    id: 'stk_king',
    emoji: '👑😎',
    title: 'VIP LEGEND',
    subtitle: 'Boss mode activated',
    gradient: 'from-amber-400/30 via-yellow-500/20 to-emerald-500/25 border-amber-300/50',
  },
  {
    id: 'stk_salute',
    emoji: '🫡⚡',
    title: 'ON IT, CAPTAIN!',
    subtitle: 'Mission accepted',
    gradient: 'from-cyan-500/30 via-sky-500/25 to-indigo-500/30 border-cyan-400/50',
  },
  {
    id: 'stk_mindblown',
    emoji: '🤯🌌',
    title: 'MIND BLOWN',
    subtitle: 'Next-level genius',
    gradient: 'from-fuchsia-500/30 via-purple-500/25 to-indigo-500/30 border-fuchsia-400/50',
  },
  {
    id: 'stk_deal',
    emoji: '🤝✅',
    title: 'DEAL CONFIRMED',
    subtitle: 'Signed & sealed',
    gradient: 'from-emerald-500/30 via-green-500/20 to-teal-500/30 border-emerald-400/50',
  },
  {
    id: 'stk_coffee',
    emoji: '☕⚡',
    title: 'POWERED BY COFFEE',
    subtitle: 'Coding & grinding',
    gradient: 'from-amber-600/30 via-orange-500/20 to-yellow-500/25 border-amber-400/50',
  },
  {
    id: 'stk_magic',
    emoji: '✨🪄',
    title: 'PURE MAGIC',
    subtitle: 'Flawless execution',
    gradient: 'from-indigo-500/30 via-violet-500/25 to-pink-500/30 border-indigo-400/50',
  },
];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'popular',
    label: 'Popular & Hot',
    icon: '🔥',
    items: [
      { char: '😂', name: 'Joy / Laughing Tears', keywords: 'laugh cry funny lol joy' },
      { char: '❤️', name: 'Red Heart', keywords: 'love heart red like' },
      { char: '🤣', name: 'Rolling on the Floor Laughing', keywords: 'rofl lol funny laugh' },
      { char: '👍', name: 'Thumbs Up', keywords: 'yes ok good like approve', skinSupport: true },
      { char: '🔥', name: 'Fire / Lit', keywords: 'hot burn lit awesome flame' },
      { char: '🥰', name: 'Smiling Face with Hearts', keywords: 'love crush adore cute' },
      { char: '😍', name: 'Heart Eyes', keywords: 'love crush amazing' },
      { char: '🙏', name: 'Folded Hands / Thank You', keywords: 'please thanks pray namaste', skinSupport: true },
      { char: '🎉', name: 'Party Popper', keywords: 'celebrate congrats party' },
      { char: '🚀', name: 'Rocket', keywords: 'launch fast space moon' },
      { char: '✨', name: 'Sparkles', keywords: 'magic shine stars clean' },
      { char: '💯', name: 'Hundred Points', keywords: '100 perfect score full' },
      { char: '😭', name: 'Loudly Crying Face', keywords: 'sad cry tears sob' },
      { char: '😎', name: 'Smiling Face with Sunglasses', keywords: 'cool boss chill' },
      { char: '🫡', name: 'Saluting Face', keywords: 'salute respect yes sir' },
      { char: '🤯', name: 'Exploding Head', keywords: 'mind blown shock wow' },
      { char: '🥳', name: 'Partying Face', keywords: 'birthday party celebrate' },
      { char: '🔐', name: 'Locked with Key', keywords: 'security encrypted lock crypto' },
      { char: '🛡️', name: 'Shield', keywords: 'privacy security safe guard' },
      { char: '✅', name: 'Check Mark Button', keywords: 'done verified success yes' },
      { char: '👀', name: 'Eyes', keywords: 'look see watch' },
      { char: '🙌', name: 'Raising Hands', keywords: 'celebrate hooray praise', skinSupport: true },
      { char: '👏', name: 'Clapping Hands', keywords: 'applause bravo clap', skinSupport: true },
      { char: '🤝', name: 'Handshake', keywords: 'deal agree partner' },
    ],
  },
  {
    id: 'smileys',
    label: 'Smileys & Faces',
    icon: '😀',
    items: [
      { char: '😀', name: 'Grinning Face', keywords: 'smile happy joy' },
      { char: '😃', name: 'Grinning Face with Big Eyes', keywords: 'smile happy' },
      { char: '😄', name: 'Grinning Face with Smiling Eyes', keywords: 'happy laugh smile' },
      { char: '😁', name: 'Beaming Face', keywords: 'grin happy teeth' },
      { char: '😆', name: 'Grinning Squinting Face', keywords: 'laughxd happy' },
      { char: '😅', name: 'Grinning Face with Sweat', keywords: 'phew relief laugh' },
      { char: '🤣', name: 'ROFL', keywords: 'laugh funny floor' },
      { char: '😂', name: 'Face with Tears of Joy', keywords: 'laugh cry lol' },
      { char: '🙂', name: 'Slightly Smiling Face', keywords: 'smile friendly' },
      { char: '🙃', name: 'Upside-Down Face', keywords: 'silly sarcasm' },
      { char: '🫠', name: 'Melting Face', keywords: 'melt hot awkward' },
      { char: '😉', name: 'Winking Face', keywords: 'wink flirt joke' },
      { char: '😊', name: 'Smiling Face with Smiling Eyes', keywords: 'blush happy sweet' },
      { char: '😇', name: 'Smiling Face with Halo', keywords: 'angel innocent good' },
      { char: '🥰', name: 'Smiling Face with Hearts', keywords: 'love adore' },
      { char: '😍', name: 'Smiling Face with Heart-Eyes', keywords: 'love crush' },
      { char: '🤩', name: 'Star-Struck', keywords: 'excited stars wow' },
      { char: '😘', name: 'Face Blowing a Kiss', keywords: 'kiss love' },
      { char: '😗', name: 'Kissing Face', keywords: 'kiss' },
      { char: '😚', name: 'Kissing Face with Closed Eyes', keywords: 'kiss blush' },
      { char: '😙', name: 'Kissing Face with Smiling Eyes', keywords: 'kiss smile' },
      { char: '🥲', name: 'Smiling Face with Tear', keywords: 'proud grateful bittersweet' },
      { char: '😋', name: 'Face Savoring Food', keywords: 'yum delicious tasty' },
      { char: '😛', name: 'Face with Tongue', keywords: 'playful silly' },
      { char: '😜', name: 'Winking Face with Tongue', keywords: 'crazy joke wink' },
      { char: '🤪', name: 'Zany Face', keywords: 'goofy wild crazy' },
      { char: '😝', name: 'Squinting Face with Tongue', keywords: 'playful' },
      { char: '🤑', name: 'Money-Mouth Face', keywords: 'rich money cash' },
      { char: '🤗', name: 'Smiling Face with Open Hands', keywords: 'hug warm' },
      { char: '🤭', name: 'Face with Hand Over Mouth', keywords: 'oops giggle secret' },
      { char: '🫢', name: 'Face with Open Eyes and Hand Over Mouth', keywords: 'gasp shock' },
      { char: '🫣', name: 'Face with Peeking Eye', keywords: 'peek scared curious' },
      { char: '🤫', name: 'Shushing Face', keywords: 'quiet secret shh' },
      { char: '🤔', name: 'Thinking Face', keywords: 'think hmm ponder' },
      { char: '🫡', name: 'Saluting Face', keywords: 'salute respect' },
      { char: '🤐', name: 'Zipper-Mouth Face', keywords: 'secret mute zip' },
      { char: '🤨', name: 'Face with Raised Eyebrow', keywords: 'skeptical doubt' },
      { char: '😐', name: 'Neutral Face', keywords: 'meh blank' },
      { char: '😑', name: 'Expressionless Face', keywords: 'unamused' },
      { char: '😶', name: 'Face Without Mouth', keywords: 'speechless silent' },
      { char: '🫥', name: 'Dotted Line Face', keywords: 'invisible hidden' },
      { char: '😏', name: 'Smirking Face', keywords: 'smirk sly' },
      { char: '😒', name: 'Unamused Face', keywords: 'bored side eye' },
      { char: '🙄', name: 'Face with Rolling Eyes', keywords: 'eyeroll whatever' },
      { char: '😬', name: 'Grimacing Face', keywords: 'awkward yikes' },
      { char: '😮‍💨', name: 'Face Exhaling', keywords: 'sigh relief' },
      { char: '🤥', name: 'Lying Face', keywords: 'pinocchio lie' },
      { char: '😌', name: 'Relieved Face', keywords: 'calm peace' },
      { char: '😔', name: 'Pensive Face', keywords: 'sad sorry' },
      { char: '😪', name: 'Sleepy Face', keywords: 'tired' },
      { char: '🤤', name: 'Drooling Face', keywords: 'drool yummy' },
      { char: '😴', name: 'Sleeping Face', keywords: 'sleep zzz' },
      { char: '😷', name: 'Face with Medical Mask', keywords: 'mask sick' },
      { char: '🤒', name: 'Face with Thermometer', keywords: 'fever sick' },
      { char: '🤕', name: 'Face with Head-Bandage', keywords: 'hurt injured' },
      { char: '🤢', name: 'Nauseated Face', keywords: 'gross sick' },
      { char: '🤮', name: 'Face Vomiting', keywords: 'puke sick' },
      { char: '🤧', name: 'Sneezing Face', keywords: 'sneeze allergy' },
      { char: '🥵', name: 'Hot Face', keywords: 'heat sweat spicy' },
      { char: '🥶', name: 'Cold Face', keywords: 'freezing ice' },
      { char: '🥴', name: 'Woozy Face', keywords: 'dizzy tipsy' },
      { char: '😵', name: 'Face with Crossed-Out Eyes', keywords: 'knocked out stunned' },
      { char: '😵‍💫', name: 'Face with Spiral Eyes', keywords: 'hypnotized dizzy' },
      { char: '🤯', name: 'Exploding Head', keywords: 'mind blown' },
      { char: '🤠', name: 'Cowboy Hat Face', keywords: 'yeehaw western' },
      { char: '🥳', name: 'Partying Face', keywords: 'celebrate party' },
      { char: '🥸', name: 'Disguised Face', keywords: 'incognito spy glasses' },
      { char: '😎', name: 'Smiling Face with Sunglasses', keywords: 'cool chill' },
      { char: '🤓', name: 'Nerd Face', keywords: 'geek smart glasses' },
      { char: '🧐', name: 'Face with Monocle', keywords: 'inspect fancy' },
      { char: '😕', name: 'Confused Face', keywords: 'puzzled' },
      { char: '🫤', name: 'Face with Diagonal Mouth', keywords: 'unsure meh' },
      { char: '😟', name: 'Worried Face', keywords: 'anxious concern' },
      { char: '🙁', name: 'Slightly Frowning Face', keywords: 'sad frown' },
      { char: '😮', name: 'Face with Open Mouth', keywords: 'wow surprised' },
      { char: '😯', name: 'Hushed Face', keywords: 'surprised' },
      { char: '😲', name: 'Astonished Face', keywords: 'shocked gasp' },
      { char: '😳', name: 'Flushed Face', keywords: 'blush embarrassed' },
      { char: '🥺', name: 'Pleading Face', keywords: 'puppy eyes please cute' },
      { char: '🥹', name: 'Face Holding Back Tears', keywords: 'touched emotional proud' },
      { char: '😦', name: 'Frowning Face with Open Mouth', keywords: 'aw' },
      { char: '😧', name: 'Anguished Face', keywords: 'stressed' },
      { char: '😨', name: 'Fearful Face', keywords: 'scared fear' },
      { char: '😰', name: 'Anxious Face with Sweat', keywords: 'nervous' },
      { char: '😥', name: 'Sad but Relieved Face', keywords: 'sweat sad' },
      { char: '😢', name: 'Crying Face', keywords: 'tear sad' },
      { char: ' 😭', name: 'Loudly Crying Face', keywords: 'sob bawling' },
      { char: '😱', name: 'Face Screaming in Fear', keywords: 'scream omg' },
      { char: '😖', name: 'Confounded Face', keywords: 'frustrated' },
      { char: '😣', name: 'Persevering Face', keywords: 'struggle' },
      { char: '😞', name: 'Disappointed Face', keywords: 'let down' },
      { char: '😓', name: 'Downcast Face with Sweat', keywords: 'hard work' },
      { char: '😩', name: 'Weary Face', keywords: 'exhausted' },
      { char: '😫', name: 'Tired Face', keywords: 'upset' },
      { char: '🥱', name: 'Yawning Face', keywords: 'sleepy bored yawn' },
      { char: '😤', name: 'Face with Steam From Nose', keywords: 'proud mad' },
      { char: '😡', name: 'Enraged Face', keywords: 'angry mad red' },
      { char: '😠', name: 'Angry Face', keywords: 'mad' },
      { char: '🤬', name: 'Face with Symbols on Mouth', keywords: 'swear curse angry' },
      { char: '😈', name: 'Smiling Face with Horns', keywords: 'devil mischief' },
      { char: '👿', name: 'Angry Face with Horns', keywords: 'villain' },
      { char: '💀', name: 'Skull', keywords: 'dead funny skeleton' },
      { char: '☠️', name: 'Skull and Crossbones', keywords: 'danger pirate' },
      { char: '🤡', name: 'Clown Face', keywords: 'clown circus' },
      { char: '👻', name: 'Ghost', keywords: 'spooky halloween boo' },
      { char: '👽', name: 'Alien', keywords: 'ufo space' },
      { char: '👾', name: 'Alien Monster', keywords: 'arcade game' },
      { char: '🤖', name: 'Robot', keywords: 'bot tech' },
    ],
  },
  {
    id: 'gestures',
    label: 'Hands & People',
    icon: '👋',
    items: [
      { char: '👋', name: 'Waving Hand', keywords: 'hello hi bye wave', skinSupport: true },
      { char: '🤚', name: 'Raised Back of Hand', keywords: 'stop hand', skinSupport: true },
      { char: '🖐️', name: 'Hand with Fingers Splayed', keywords: 'high five', skinSupport: true },
      { char: '✋', name: 'Raised Hand', keywords: 'stop high five', skinSupport: true },
      { char: '🖖', name: 'Vulcan Salute', keywords: 'spock trek', skinSupport: true },
      { char: '🫱', name: 'Rightwards Hand', keywords: 'reach', skinSupport: true },
      { char: '🫲', name: 'Leftwards Hand', keywords: 'reach', skinSupport: true },
      { char: '🫳', name: 'Palm Down Hand', keywords: 'drop', skinSupport: true },
      { char: '🫴', name: 'Palm Up Hand', keywords: 'offer', skinSupport: true },
      { char: '👌', name: 'OK Hand', keywords: 'ok perfect nice', skinSupport: true },
      { char: '🤌', name: 'Pinched Fingers', keywords: 'chefs kiss italian', skinSupport: true },
      { char: '🤏', name: 'Pinching Hand', keywords: 'tiny little bit', skinSupport: true },
      { char: '✌️', name: 'Victory Hand', keywords: 'peace two', skinSupport: true },
      { char: '🤞', name: 'Crossed Fingers', keywords: 'luck hope wish', skinSupport: true },
      { char: '🫰', name: 'Hand with Index Finger and Thumb Crossed', keywords: 'finger heart money', skinSupport: true },
      { char: '🤟', name: 'Love-You Gesture', keywords: 'ily rock', skinSupport: true },
      { char: '🤘', name: 'Sign of the Horns', keywords: 'rock metal', skinSupport: true },
      { char: '🤙', name: 'Call Me Hand', keywords: 'shaka hang loose', skinSupport: true },
      { char: '👈', name: 'Backhand Index Pointing Left', keywords: 'left point', skinSupport: true },
      { char: '👉', name: 'Backhand Index Pointing Right', keywords: 'right point', skinSupport: true },
      { char: '👆', name: 'Backhand Index Pointing Up', keywords: 'up point', skinSupport: true },
      { char: '👇', name: 'Backhand Index Pointing Down', keywords: 'down point', skinSupport: true },
      { char: '☝️', name: 'Index Pointing Up', keywords: 'one point', skinSupport: true },
      { char: '🫵', name: 'Index Pointing at the Viewer', keywords: 'you point', skinSupport: true },
      { char: '👍', name: 'Thumbs Up', keywords: 'like yes approve', skinSupport: true },
      { char: '👎', name: 'Thumbs Down', keywords: 'dislike no', skinSupport: true },
      { char: '✊', name: 'Raised Fist', keywords: 'power solidarity', skinSupport: true },
      { char: '👊', name: 'Oncoming Fist', keywords: 'fist bump bro', skinSupport: true },
      { char: '🤛', name: 'Left-Facing Fist', keywords: 'bump', skinSupport: true },
      { char: '🤜', name: 'Right-Facing Fist', keywords: 'bump', skinSupport: true },
      { char: '👏', name: 'Clapping Hands', keywords: 'clap bravo', skinSupport: true },
      { char: '🙌', name: 'Raising Hands', keywords: 'hooray hands', skinSupport: true },
      { char: '🫶', name: 'Heart Hands', keywords: 'love heart hands', skinSupport: true },
      { char: '👐', name: 'Open Hands', keywords: 'open', skinSupport: true },
      { char: '🤲', name: 'Palms Up Together', keywords: 'prayer', skinSupport: true },
      { char: '🤝', name: 'Handshake', keywords: 'deal agreement' },
      { char: '🙏', name: 'Folded Hands', keywords: 'pray thank you please', skinSupport: true },
      { char: '✍️', name: 'Writing Hand', keywords: 'write note', skinSupport: true },
      { char: '💅', name: 'Nail Polish', keywords: 'slay fabulous', skinSupport: true },
      { char: '🤳', name: 'Selfie', keywords: 'camera phone', skinSupport: true },
      { char: '💪', name: 'Flexed Biceps', keywords: 'strong muscle gym', skinSupport: true },
      { char: '🧠', name: 'Brain', keywords: 'smart genius mind' },
      { char: '👀', name: 'Eyes', keywords: 'look watch see' },
      { char: '🫂', name: 'People Hugging', keywords: 'hug comfort care' },
      { char: '💃', name: 'Woman Dancing', keywords: 'dance party', skinSupport: true },
      { char: '🕺', name: 'Man Dancing', keywords: 'dance disco', skinSupport: true },
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts & Symbols',
    icon: '❤️',
    items: [
      { char: '❤️', name: 'Red Heart', keywords: 'love heart red' },
      { char: '🧡', name: 'Orange Heart', keywords: 'love heart orange' },
      { char: '💛', name: 'Yellow Heart', keywords: 'love heart yellow' },
      { char: '💚', name: 'Green Heart', keywords: 'love heart green' },
      { char: '💙', name: 'Blue Heart', keywords: 'love heart blue' },
      { char: '💜', name: 'Purple Heart', keywords: 'love heart purple' },
      { char: '🖤', name: 'Black Heart', keywords: 'love heart black' },
      { char: '🤍', name: 'White Heart', keywords: 'love heart pure' },
      { char: '🤎', name: 'Brown Heart', keywords: 'love heart' },
      { char: '🩷', name: 'Pink Heart', keywords: 'love heart pink' },
      { char: '🩵', name: 'Light Blue Heart', keywords: 'love heart cyan' },
      { char: '🩶', name: 'Grey Heart', keywords: 'love heart silver' },
      { char: '💔', name: 'Broken Heart', keywords: 'sad heartbreak' },
      { char: '❤️‍🔥', name: 'Heart on Fire', keywords: 'passion burning love' },
      { char: '❤️‍🩹', name: 'Mending Heart', keywords: 'healing love' },
      { char: '❣️', name: 'Heart Exclamation', keywords: 'love' },
      { char: '💕', name: 'Two Hearts', keywords: 'love' },
      { char: '💞', name: 'Revolving Hearts', keywords: 'love' },
      { char: '💓', name: 'Beating Heart', keywords: 'pulse love' },
      { char: '💗', name: 'Growing Heart', keywords: 'love' },
      { char: '💖', name: 'Sparkling Heart', keywords: 'love sparkle' },
      { char: '💘', name: 'Heart with Arrow', keywords: 'cupid love' },
      { char: '💝', name: 'Heart with Ribbon', keywords: 'gift love' },
      { char: '💟', name: 'Heart Decoration', keywords: 'love' },
      { char: '💋', name: 'Kiss Mark', keywords: 'lips kiss' },
      { char: '💯', name: 'Hundred Points', keywords: '100 score' },
      { char: '💢', name: 'Anger Symbol', keywords: 'mad' },
      { char: '💥', name: 'Collision / Boom', keywords: 'explosion bang' },
      { char: '💫', name: 'Dizzy Star', keywords: 'shooting star sparkle' },
      { char: '💦', name: 'Sweat Droplets', keywords: 'water splash' },
      { char: '💨', name: 'Dashing Away', keywords: 'fast wind' },
      { char: '🔥', name: 'Fire', keywords: 'hot flame lit' },
      { char: '✨', name: 'Sparkles', keywords: 'shine magic' },
      { char: '🌟', name: 'Glowing Star', keywords: 'star shine' },
      { char: '⚡', name: 'High Voltage', keywords: 'lightning zap fast' },
      { char: '🌈', name: 'Rainbow', keywords: 'colorful sky' },
      { char: '☀️', name: 'Sun', keywords: 'sunny bright' },
      { char: '🌙', name: 'Crescent Moon', keywords: 'night moon' },
      { char: '✅', name: 'Check Mark Button', keywords: 'yes done' },
      { char: '☑️', name: 'Check Box with Check', keywords: 'verified' },
      { char: '❌', name: 'Cross Mark', keywords: 'no cancel wrong' },
      { char: '⚠️', name: 'Warning', keywords: 'alert caution' },
      { char: '♻️', name: 'Recycling Symbol', keywords: 'eco green' },
      { char: '♾️', name: 'Infinity', keywords: 'forever limitless' },
    ],
  },
  {
    id: 'animals',
    label: 'Animals & Nature',
    icon: '🐶',
    items: [
      { char: '🐶', name: 'Dog Face', keywords: 'puppy pet dog' },
      { char: '🐱', name: 'Cat Face', keywords: 'kitty cat pet' },
      { char: '🐭', name: 'Mouse Face', keywords: 'mouse' },
      { char: '🐹', name: 'Hamster', keywords: 'pet cute' },
      { char: '🐰', name: 'Rabbit Face', keywords: 'bunny' },
      { char: '🦊', name: 'Fox', keywords: 'clever fox' },
      { char: '🐻', name: 'Bear', keywords: 'bear' },
      { char: '🐼', name: 'Panda', keywords: 'panda cute' },
      { char: '🐻‍❄️', name: 'Polar Bear', keywords: 'arctic bear' },
      { char: '🐨', name: 'Koala', keywords: 'australia cute' },
      { char: '🐯', name: 'Tiger Face', keywords: 'tiger fierce' },
      { char: '🦁', name: 'Lion', keywords: 'king jungle' },
      { char: '🐮', name: 'Cow Face', keywords: 'moo cow' },
      { char: '🐷', name: 'Pig Face', keywords: 'pig' },
      { char: '🐸', name: 'Frog', keywords: 'pepe frog' },
      { char: '🐵', name: 'Monkey Face', keywords: 'monkey' },
      { char: '🙈', name: 'See-No-Evil Monkey', keywords: 'shy monkey' },
      { char: '🙉', name: 'Hear-No-Evil Monkey', keywords: 'monkey' },
      { char: '🙊', name: 'Speak-No-Evil Monkey', keywords: 'oops secret monkey' },
      { char: '🐧', name: 'Penguin', keywords: 'penguin linux' },
      { char: '🐦', name: 'Bird', keywords: 'bird' },
      { char: '🦅', name: 'Eagle', keywords: 'eagle fly' },
      { char: '🦉', name: 'Owl', keywords: 'wise night' },
      { char: '🐺', name: 'Wolf', keywords: 'wolf howl' },
      { char: '🦄', name: 'Unicorn', keywords: 'magic unicorn' },
      { char: '🐝', name: 'Honeybee', keywords: 'bee buzz' },
      { char: '🦋', name: 'Butterfly', keywords: 'pretty nature' },
      { char: '🐢', name: 'Turtle', keywords: 'slow shell' },
      { char: '🐍', name: 'Snake', keywords: 'python snake' },
      { char: '🦖', name: 'T-Rex', keywords: 'dinosaur' },
      { char: '🐙', name: 'Octopus', keywords: 'sea ocean' },
      { char: '🐬', name: 'Dolphin', keywords: 'ocean smart' },
      { char: '🦈', name: 'Shark', keywords: 'jaws ocean' },
      { char: '🐋', name: 'Whale', keywords: 'ocean big' },
      { char: '🌸', name: 'Cherry Blossom', keywords: 'flower spring pink' },
      { char: '🌹', name: 'Rose', keywords: 'flower romance red' },
      { char: '🌻', name: 'Sunflower', keywords: 'yellow flower sun' },
      { char: '🌷', name: 'Tulip', keywords: 'flower spring' },
      { char: '🍀', name: 'Four Leaf Clover', keywords: 'luck irish' },
      { char: '🌴', name: 'Palm Tree', keywords: 'beach vacation' },
      { char: '🌍', name: 'Globe Europe-Africa', keywords: 'earth world global' },
      { char: '🪐', name: 'Ringed Planet', keywords: 'saturn space' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Drinks',
    icon: '🍕',
    items: [
      { char: '🍕', name: 'Pizza', keywords: 'slice italian food' },
      { char: '🍔', name: 'Hamburger', keywords: 'burger fast food' },
      { char: '🍟', name: 'French Fries', keywords: 'fries snack' },
      { char: '🌭', name: 'Hot Dog', keywords: 'sausage' },
      { char: '🌮', name: 'Taco', keywords: 'mexican food' },
      { char: '🌯', name: 'Burrito', keywords: 'wrap mexican' },
      { char: '🥗', name: 'Green Salad', keywords: 'healthy food' },
      { char: '🍿', name: 'Popcorn', keywords: 'movie snack' },
      { char: '🍣', name: 'Sushi', keywords: 'japanese fish' },
      { char: '🍜', name: 'Steaming Bowl / Ramen', keywords: 'noodles soup' },
      { char: '🍝', name: 'Spaghetti', keywords: 'pasta italian' },
      { char: '🍛', name: 'Curry Rice', keywords: 'spicy food' },
      { char: '🍱', name: 'Bento Box', keywords: 'lunch japanese' },
      { char: '🥟', name: 'Dumpling', keywords: 'momos dim sum' },
      { char: '🍗', name: 'Poultry Leg', keywords: 'chicken drumstick' },
      { char: '🥩', name: 'Cut of Meat', keywords: 'steak' },
      { char: '🥞', name: 'Pancakes', keywords: 'breakfast' },
      { char: '🥐', name: 'Croissant', keywords: 'bakery french' },
      { char: '🍎', name: 'Red Apple', keywords: 'fruit' },
      { char: '🍓', name: 'Strawberry', keywords: 'berry fruit' },
      { char: '🍉', name: 'Watermelon', keywords: 'summer fruit' },
      { char: '🥭', name: 'Mango', keywords: 'tropical fruit' },
      { char: '🥑', name: 'Avocado', keywords: 'guacamole toast' },
      { char: '🍦', name: 'Soft Ice Cream', keywords: 'dessert sweet' },
      { char: '🍩', name: 'Doughnut', keywords: 'donut sweet' },
      { char: '🍪', name: 'Cookie', keywords: 'chocolate chip' },
      { char: '🎂', name: 'Birthday Cake', keywords: 'party celebration cake' },
      { char: '🍰', name: 'Shortcake', keywords: 'cake slice' },
      { char: '🍫', name: 'Chocolate Bar', keywords: 'candy sweet' },
      { char: '☕', name: 'Hot Beverage / Coffee', keywords: 'coffee tea morning' },
      { char: '🧋', name: 'Bubble Tea', keywords: 'boba drink' },
      { char: '🧃', name: 'Beverage Box', keywords: 'juice' },
      { char: '🥤', name: 'Cup with Straw', keywords: 'soda drink' },
      { char: '🍺', name: 'Beer Mug', keywords: 'drink cheers' },
      { char: '🍻', name: 'Clinking Beer Mugs', keywords: 'cheers party' },
      { char: '🥂', name: 'Clinking Glasses', keywords: 'champagne toast celebrate' },
    ],
  },
  {
    id: 'activities',
    label: 'Activities & Travel',
    icon: '⚽',
    items: [
      { char: '⚽', name: 'Soccer Ball', keywords: 'football sport' },
      { char: '🏀', name: 'Basketball', keywords: 'hoops sport' },
      { char: '🏈', name: 'American Football', keywords: 'nfl sport' },
      { char: '⚾', name: 'Baseball', keywords: 'sport' },
      { char: '🎾', name: 'Tennis', keywords: 'racket sport' },
      { char: '🏐', name: 'Volleyball', keywords: 'sport' },
      { char: '🏏', name: 'Cricket Game', keywords: 'bat ball sport' },
      { char: '🏆', name: 'Trophy', keywords: 'winner champion award' },
      { char: '🥇', name: '1st Place Medal', keywords: 'gold winner' },
      { char: '🎮', name: 'Video Game Controller', keywords: 'gaming play console' },
      { char: '🕹️', name: 'Joystick', keywords: 'arcade game' },
      { char: '🎲', name: 'Game Die', keywords: 'dice luck' },
      { char: '🎯', name: 'Bullseye / Direct Hit', keywords: 'target goal dart' },
      { char: '🎸', name: 'Guitar', keywords: 'music rock' },
      { char: '🎧', name: 'Headphone', keywords: 'music audio listen' },
      { char: '🎤', name: 'Microphone', keywords: 'sing karaoke podcast' },
      { char: '🎬', name: 'Clapper Board', keywords: 'movie film cinema' },
      { char: '🎨', name: 'Artist Palette', keywords: 'art paint design' },
      { char: '🎉', name: 'Party Popper', keywords: 'celebrate congrats' },
      { char: '🎊', name: 'Confetti Ball', keywords: 'party' },
      { char: '🎈', name: 'Balloon', keywords: 'birthday party' },
      { char: '🎁', name: 'Wrapped Gift', keywords: 'present birthday' },
      { char: '🚀', name: 'Rocket', keywords: 'space launch fast' },
      { char: '✈️', name: 'Airplane', keywords: 'flight travel trip' },
      { char: '🚗', name: 'Automobile', keywords: 'car drive' },
      { char: '🏎️', name: 'Racing Car', keywords: 'fast f1 speed' },
      { char: '🏍️', name: 'Motorcycle', keywords: 'bike ride' },
      { char: '🚲', name: 'Bicycle', keywords: 'cycle ride' },
      { char: '⛵', name: 'Sailboat', keywords: 'sea yacht' },
      { char: '🏖️', name: 'Beach with Umbrella', keywords: 'vacation holiday' },
      { char: '🏔️', name: 'Snow-Capped Mountain', keywords: 'hike nature' },
      { char: '⛺', name: 'Tent', keywords: 'camping outdoors' },
    ],
  },
  {
    id: 'objects',
    label: 'Security & Tech',
    icon: '🔐',
    items: [
      { char: '🔐', name: 'Locked with Key', keywords: 'e2ee security encrypted' },
      { char: '🔒', name: 'Locked Padlock', keywords: 'private safe lock' },
      { char: '🔓', name: 'Unlocked', keywords: 'open unlock' },
      { char: '🔑', name: 'Key', keywords: 'private key password' },
      { char: '🗝️', name: 'Old Key', keywords: 'secret vault key' },
      { char: '🛡️', name: 'Shield', keywords: 'protection security firewall' },
      { char: '📱', name: 'Mobile Phone', keywords: 'smartphone app call' },
      { char: '💻', name: 'Laptop', keywords: 'computer code dev' },
      { char: '🖥️', name: 'Desktop Computer', keywords: 'workstation monitor' },
      { char: '⌚', name: 'Watch', keywords: 'smartwatch time' },
      { char: '📷', name: 'Camera', keywords: 'photo picture' },
      { char: '📹', name: 'Video Camera', keywords: 'record video' },
      { char: '🔋', name: 'Battery', keywords: 'power energy full' },
      { char: '💡', name: 'Light Bulb', keywords: 'idea bright tip' },
      { char: '💎', name: 'Gem Stone / Diamond', keywords: 'diamond valuable crystal' },
      { char: '👑', name: 'Crown', keywords: 'king queen royal vip' },
      { char: '💰', name: 'Money Bag', keywords: 'cash wealth' },
      { char: '💸', name: 'Money with Wings', keywords: 'spend transfer' },
      { char: '💳', name: 'Credit Card', keywords: 'payment' },
      { char: '📈', name: 'Chart Increasing', keywords: 'growth stocks up' },
      { char: '📌', name: 'Pushpin', keywords: 'pin important' },
      { char: '📎', name: 'Paperclip', keywords: 'attachment file' },
      { char: '📝', name: 'Memo', keywords: 'note write document' },
      { char: '📁', name: 'File Folder', keywords: 'directory archive' },
      { char: '🔔', name: 'Bell', keywords: 'notification alert' },
      { char: '🔕', name: 'Bell with Slash', keywords: 'mute silent' },
      { char: '📢', name: 'Loudspeaker', keywords: 'announce broadcast' },
      { char: '🧲', name: 'Magnet', keywords: 'attract' },
      { char: '🧪', name: 'Test Tube', keywords: 'science lab experiment' },
      { char: '🧬', name: 'DNA', keywords: 'genetics life' },
      { char: '🔭', name: 'Telescope', keywords: 'astronomy stars' },
      { char: '⚡', name: 'High Voltage', keywords: 'instant power' },
    ],
  },
];

export interface EmojiPickerPanelProps {
  onSelectEmoji: (emoji: string) => void;
  onSendExpressiveSticker?: (stickerText: string) => void;
  onSendComboSticker?: (stickerText: string) => void;
  onSend3DSticker?: (sticker: { url: string; title: string; emoji: string }) => void;
  onInsertFormatting?: (snippet: string) => void;
  onClose?: () => void;
  compactMode?: boolean;
  compact?: boolean;
}

export const EmojiPickerPanel: React.FC<EmojiPickerPanelProps> = ({
  onSelectEmoji,
  onSendExpressiveSticker,
  onSendComboSticker,
  onSend3DSticker,
  onInsertFormatting,
  onClose,
  compactMode = false,
  compact = false,
}) => {
  const isCompact = compactMode || compact;
  const sendStickerHandler = onSendExpressiveSticker || onSendComboSticker;
  const [activeCategoryId, setActiveCategoryId] = useState<string>('popular');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [skinToneIdx, setSkinToneIdx] = useState<number>(0);
  const [hoveredEmoji, setHoveredEmoji] = useState<EmojiItem | null>(null);
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('simple_recent_emojis_v1');
      return saved ? JSON.parse(saved) : ['😂', '❤️', '🔥', '👍', '🚀', '🥰', '🎉', '🔐'];
    } catch {
      return ['😂', '❤️', '🔥', '👍', '🚀', '🥰', '🎉', '🔐'];
    }
  });

  const applySkinTone = (item: EmojiItem): string => {
    const mod = SKIN_TONES[skinToneIdx]?.modifier || '';
    if (!mod || !item.skinSupport) return item.char;
    // Apply Fitzpatrick modifier to base character
    const codePoints = Array.from(item.char);
    if (codePoints.length === 1) {
      return codePoints[0] + mod;
    }
    return item.char;
  };

  const handlePick = (item: EmojiItem) => {
    const finalChar = applySkinTone(item);
    onSelectEmoji(finalChar);
    const updated = [finalChar, ...recentEmojis.filter((e) => e !== finalChar)].slice(0, 16);
    setRecentEmojis(updated);
    try {
      localStorage.setItem('simple_recent_emojis_v1', JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCategoryId) || EMOJI_CATEGORIES[0];
      return cat.items;
    }
    const all: EmojiItem[] = [];
    const seen = new Set<string>();
    for (const cat of EMOJI_CATEGORIES) {
      for (const it of cat.items) {
        if (
          !seen.has(it.char) &&
          (it.name.toLowerCase().includes(q) ||
            it.keywords.toLowerCase().includes(q) ||
            it.char.includes(q))
        ) {
          seen.add(it.char);
          all.push(it);
        }
      }
    }
    return all;
  }, [activeCategoryId, searchQuery]);

  return (
    <div className="w-full rounded-2xl bg-slate-950/95 border border-slate-800/90 p-2.5 sm:p-3 space-y-2.5 shadow-2xl">
      {/* Top Search Bar + Skin Tone Selector + Optional Close */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search 300+ emojis (e.g. heart, fire, laugh, party, rocket)…"
            className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Skin Tone Selector Pills */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-1.5 py-1">
          {SKIN_TONES.map((tone, idx) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => setSkinToneIdx(idx)}
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-sm transition-transform ${
                skinToneIdx === idx
                  ? 'bg-emerald-500/25 ring-1 ring-emerald-400 scale-110'
                  : 'hover:bg-slate-800 opacity-75 hover:opacity-100'
              }`}
              title={`Skin tone: ${tone.label}`}
            >
              {tone.preview}
            </button>
          ))}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center shrink-0"
            title="Close emoji picker"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Navigation Bar */}
      {!searchQuery.trim() && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 border-b border-slate-800/80">
          {EMOJI_CATEGORIES.map((cat) => {
            const active = activeCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all ${
                  active
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-sm">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
          {!isCompact && (
            <>
              <button
                type="button"
                onClick={() => setActiveCategoryId('stickers_3d')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all ${
                  activeCategoryId === 'stickers_3d'
                    ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900/70 text-emerald-300 hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>3D Stickers</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCategoryId('stickers')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all ${
                  activeCategoryId === 'stickers'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Combo Stickers</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Frequently / Recently Used Quick Strip */}
      {!searchQuery.trim() && activeCategoryId !== 'stickers' && recentEmojis.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1 shrink-0">
            Recent:
          </span>
          {recentEmojis.map((em, i) => (
            <button
              key={`${em}_${i}`}
              type="button"
              onClick={() => onSelectEmoji(em)}
              className="w-8 h-8 rounded-xl bg-slate-900/80 hover:bg-emerald-500/20 hover:scale-125 border border-slate-800/70 hover:border-emerald-500/40 flex items-center justify-center text-lg shrink-0 transition-all duration-150"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* 3D Cartoon Stickers View, Expressive Stickers View, OR Emoji Grid */}
      {activeCategoryId === 'stickers_3d' && !searchQuery.trim() ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
          {CARTOON_3D_STICKERS.map((stk) => (
            <button
              key={stk.id}
              type="button"
              onClick={() => {
                if (onSend3DSticker) {
                  onSend3DSticker({ url: stk.url, title: stk.title, emoji: stk.emoji });
                } else if (sendStickerHandler) {
                  sendStickerHandler(`${stk.emoji} **${stk.title}** — *${stk.subtitle}*`);
                } else {
                  onSelectEmoji(stk.emoji);
                }
              }}
              className="p-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 flex flex-col items-center gap-1 hover:scale-105 active:scale-95 transition-transform group"
              title={`Send 3D Sticker: ${stk.title}`}
            >
              <img
                src={stk.url}
                alt={stk.title}
                className="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform"
              />
              <span className="text-[10px] font-extrabold text-white truncate w-full text-center">
                {stk.title}
              </span>
            </button>
          ))}
          {CARTOON_3D_AVATARS.slice(0, 8).map((av) => (
            <button
              key={av.id}
              type="button"
              onClick={() => {
                const label = av.label.split('·')[0].trim();
                if (onSend3DSticker) {
                  onSend3DSticker({ url: av.url, title: `${label} 3D Vibe`, emoji: '✨' });
                } else if (sendStickerHandler) {
                  sendStickerHandler(`✨ **${av.label}** — *${av.subtitle}*`);
                } else {
                  onSelectEmoji('✨');
                }
              }}
              className="p-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 flex flex-col items-center gap-1 hover:scale-105 active:scale-95 transition-transform group"
              title={`Send 3D Avatar Sticker: ${av.label}`}
            >
              <img
                src={av.url}
                alt={av.label}
                className="w-14 h-14 rounded-full object-cover shadow-md group-hover:scale-110 transition-transform"
              />
              <span className="text-[10px] font-bold text-cyan-300 truncate w-full text-center">
                {av.label.split('·')[0].trim()}
              </span>
            </button>
          ))}
        </div>
      ) : activeCategoryId === 'stickers' && !searchQuery.trim() ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
          {EXPRESSIVE_STICKERS.map((stk) => (
            <button
              key={stk.id}
              type="button"
              onClick={() => {
                const payload = `${stk.emoji} **${stk.title}** — *${stk.subtitle}*`;
                if (sendStickerHandler) {
                  sendStickerHandler(payload);
                } else {
                  onSelectEmoji(`${stk.emoji} ${stk.title} `);
                }
              }}
              className={`p-2.5 rounded-2xl bg-gradient-to-br ${stk.gradient} border text-left flex items-center justify-between gap-2 hover:scale-[1.02] active:scale-95 transition-transform group`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl group-hover:scale-125 transition-transform shrink-0">
                  {stk.emoji}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold text-white truncate">
                    {stk.title}
                  </div>
                  <div className="text-[10px] text-slate-300 truncate">{stk.subtitle}</div>
                </div>
              </div>
              <Send className="w-3.5 h-3.5 text-emerald-300 opacity-75 group-hover:opacity-100 shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1 max-h-48 overflow-y-auto pr-1">
          {filteredItems.length === 0 ? (
            <div className="col-span-full py-6 text-center text-xs text-slate-400">
              No emojis found matching "{searchQuery}". Try "heart", "fire", "party", or "smile".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const displayChar = applySkinTone(item);
              return (
                <button
                  key={`${item.char}_${idx}`}
                  type="button"
                  onMouseEnter={() => setHoveredEmoji(item)}
                  onClick={() => handlePick(item)}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-transparent flex items-center justify-center text-xl sm:text-2xl hover:scale-125 active:scale-95 transition-all duration-150 select-none"
                  title={item.name}
                >
                  {displayChar}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Bottom Live Emoji Preview + Rich Text Formatting Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">
            {hoveredEmoji ? applySkinTone(hoveredEmoji) : '😊'}
          </span>
          <span className="text-[11px] text-slate-300 font-medium truncate">
            {hoveredEmoji
              ? hoveredEmoji.name
              : 'Tap any emoji to insert · Switch tabs for 300+ emojis & stickers'}
          </span>
        </div>

        {onInsertFormatting && (
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => onInsertFormatting(' **bold** ')}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200"
            >
              **B**
            </button>
            <button
              type="button"
              onClick={() => onInsertFormatting(' *italic* ')}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 italic"
            >
              *I*
            </button>
            <button
              type="button"
              onClick={() => onInsertFormatting(' ~~strike~~ ')}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 line-through"
            >
              ~~S~~
            </button>
            <button
              type="button"
              onClick={() => onInsertFormatting(' `code` ')}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-300"
            >
              `Code`
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
