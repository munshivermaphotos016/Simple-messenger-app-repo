# Simple — Private Encrypted Messenger for Android

**Created by Dr. M Verma**

Simple is a privacy-first, end-to-end encrypted (E2EE) native Android messaging, HD voice/video calling, and 24-hour status application built with WebCrypto (`ECDH P-256` + `AES-256-GCM`), WebRTC (`DTLS-SRTP`), Firebase Firestore synchronization, and an Express + WebSocket real-time relay server.

---

## Direct Android `.apk` Download & Installation

This repository includes the ready-to-install, cryptographically signed (JAR v1 + APK Signature Scheme v2) native Android `.apk` files directly in the repository:

- **[`Simple-Android.apk`](./Simple-Android.apk)** (Repository Root — Direct Download)
- **[`releases/Simple-v1.0.0.apk`](./releases/Simple-v1.0.0.apk)** (Releases Folder — Versioned APK)

### How to Install on Your Android Phone from GitHub:
1. Tap **[`Simple-Android.apk`](./Simple-Android.apk)** in this GitHub repository.
2. Tap **Download raw file** (or the `⋯` menu → **Download** on GitHub Mobile).
3. Open the downloaded **`Simple-Android.apk`** on your phone and tap **Install** (allow *Install unknown apps* if prompted by Android).
4. Launch **Simple** from your Android App Drawer (`com.drmverma.simple.messenger`).

---

## Key Features

- **End-to-End Encrypted Messaging**: Real client-side `AES-256-GCM` & `ECDH P-256` encryption, Double Ratchet session progression, safety number verification, disappearing messages, and Locked Chats Vault with PIN protection.
- **Immersive Full-Screen HD Video & Voice Calling**: Edge-to-edge video stage, tap-to-reveal HUD controls, customizable Picture-in-Picture window shapes (Card, Circle, Squircle, Heart, Star, Hexagon, Diamond), split-screen duet layouts, live color filters, 3D AR props, and real-time voice spectrum visualizers.
- **Pro Photo & Video Studio**: Frame-by-frame video trimmer with start/end handles, interactive stickers & emojis with drag, resize, rotate, and flip handles, freehand drawing, pixelate/blur privacy redaction, LUT color filters, and custom aspect ratios.
- **3D Cartoon Avatars & Sticker Packs**: 20 built-in 3D cartoon character & mascot avatars plus 3D sticker packs and custom avatar studio.
- **24-Hour Encrypted Status Updates**: Post photo, trimmed video, or typography status stories with audience privacy controls (`Everyone`, `My Contacts`, `Only Share With`).
- **Cloud & Local Backups**: Encrypted password-protected backups, local `.json` device file export/import, and Google Drive / Firestore cloud account recovery.

---

## Rebuilding the Android `.apk` Locally

To rebuild `Simple-Android.apk` and `releases/Simple-v1.0.0.apk` after modifying the source code:

```bash
npm install
npm run build:apk
```

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

## Creator & Credits

- **Creator & Lead Architect**: **Dr. M Verma**
- **Package ID**: `com.drmverma.simple.messenger`
- **License**: All rights reserved · Created by Dr. M Verma.

