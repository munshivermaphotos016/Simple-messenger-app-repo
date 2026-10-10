# Simple — Private Encrypted Messenger for Android

**Created by Dr. M Verma**

Simple is a privacy-first, end-to-end encrypted (E2EE) native-grade Android messaging, HD voice/video calling, and 24-hour status application built with WebCrypto (`ECDH P-256` + `AES-256-GCM`), WebRTC (`DTLS-SRTP`), Firebase Firestore synchronization, and an Express + WebSocket real-time relay server.

---

## Key Features

- **End-to-End Encrypted Messaging**: Real client-side `AES-256-GCM` & `ECDH P-256` encryption, Double Ratchet session progression, safety number verification, disappearing messages, and Locked Chats Vault with PIN protection.
- **Immersive Full-Screen HD Video & Voice Calling**: Edge-to-edge video stage, tap-to-reveal HUD controls, customizable Picture-in-Picture window shapes (Card, Circle, Squircle, Heart, Star, Hexagon, Diamond), split-screen duet layouts, live color filters, 3D AR props, and real-time voice spectrum visualizers.
- **Pro Photo & Video Studio**: Frame-by-frame video trimmer with start/end handles, interactive stickers & emojis with drag, resize, rotate, and flip handles, freehand drawing, pixelate/blur privacy redaction, LUT color filters, and custom aspect ratios.
- **3D Cartoon Avatars & Sticker Packs**: 20 built-in 3D cartoon character & mascot avatars plus 3D sticker packs and custom avatar studio.
- **24-Hour Encrypted Status Updates**: Post photo, trimmed video, or typography status stories with audience privacy controls (`Everyone`, `My Contacts`, `Only Share With`).
- **Cloud & Local Backups**: Encrypted password-protected backups, local `.json` device file export/import, and Google Drive / Firestore cloud account recovery.

---

## Quick Start (Local Development & Server)

```bash
# 1. Install dependencies
npm install

# 2. Start the full-stack server (Express API + WebSocket Relay + Vite) on port 3000
npm run dev
```

Open `http://localhost:3000` in your browser or on your Android device.

---

## Installing as a Native Android App

### Option A: Direct Android WebAPK / Standalone Installation
1. Open the app URL in **Chrome on Android**.
2. Tap **Install App** in the top bar (or open **Settings → About & App Info → Install Android App**).
3. Simple installs directly to your Android App Drawer and launches full-screen in native standalone mode with offline caching and hardware back-button navigation.

### Option B: Building a Native Android `.apk` with Capacitor
The repository includes `capacitor.config.json` (`com.drmverma.simple.messenger`) pre-configured for Android Studio:

```bash
npm run build
npx @capacitor/cli add android
npx @capacitor/cli sync android
npx @capacitor/cli open android
```

---

## Creator & Credits

- **Creator & Lead Architect**: **Dr. M Verma**
- **License**: All rights reserved · Created by Dr. M Verma.
