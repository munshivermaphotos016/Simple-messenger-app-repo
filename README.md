# Simple — Private Encrypted Messenger for Android (`v4.0.0`)

**Created by Dr. M Verma**

Simple is a privacy-first, end-to-end encrypted (E2EE) native Android messaging, HD voice/video calling, and 24-hour status application built with WebCrypto (`ECDH P-256` + `AES-256-GCM`), WebRTC (`DTLS-SRTP`), Firebase Firestore synchronization, and an Express + WebSocket real-time relay server.

---

## Direct Android `.apk` Download & Installation (`v4.0.0`)

This repository includes the ready-to-install, cryptographically signed (JAR v1 + APK Signature Scheme v2) native Android `.apk` files directly in the repository and in **GitHub Releases**:

- **[`Simple-Android-v4.0.0.apk`](./Simple-Android-v4.0.0.apk)** (Repository Root — Latest Versioned `v4.0.0` APK)
- **[`releases/Simple-v4.0.0.apk`](./releases/Simple-v4.0.0.apk)** (`releases/` Folder — Versioned `v4.0.0` APK)
- **[`Simple-Android.apk`](./Simple-Android.apk)** (Repository Root — Latest APK Alias)

> **Automatic GitHub Sync & Build**: Every time changes are synced to this GitHub repository, the `.github/workflows/build-android-apk.yml` workflow automatically compiles the latest source code into `Simple-Android-v4.0.0.apk` and commits the updated `.apk` directly into the repository root, `releases/Simple-v4.0.0.apk`, and **GitHub Releases (`v4.0.0`)**.

### How to Install on Your Android Phone:
1. Tap **[`Simple-Android-v4.0.0.apk`](./Simple-Android-v4.0.0.apk)** in this GitHub repository (or open the **Releases** section and tap `Simple-Android-v4.0.0.apk`).
2. Tap **Download raw file** (or the `⋯` menu → **Download** on GitHub Mobile).
3. Open the downloaded **`Simple-Android-v4.0.0.apk`** on your phone and tap **Install** (allow *Install unknown apps* if prompted by Android).
4. Launch **Simple** from your Android App Drawer (`com.drmverma.simple`).

---

## What's New in `v3.0.0`

- **100% Real Account Verification (Zero Dummy In-App OTPs)**:
  - **Official Google Sign-In (1-Tap Verification)**: Cryptographically verifies email ownership directly with Google OAuth2 servers.
  - **Authenticator App (RFC 6238 TOTP)**: Generates a real Base32 cryptographic secret (`otpauth://totp/...`) for Google Authenticator, Authy, Microsoft Authenticator, or 1Password with 30-second rolling 6-digit HMAC-SHA1 verification.
  - **Live SMTP Email & Carrier SMS Gateways**: Dispatches real 6-digit OTPs via Nodemailer SMTP or Twilio / Fast2SMS / Textbelt carrier gateways.
- **Hardened Account Database & Anti-Takeover Security**:
  - Mandatory PBKDF2-SHA256 (`120,000` iterations) Account Password and optional 6-digit Two-Step Verification PIN.
  - Strict separation between new account registration and existing account sign-in (`409 Conflict` on duplicate phone/email/username registration; cryptographic `verificationToken` + password hash required for sign-in and cloud backup recovery).
  - Removed all unverified account switching and dummy fallback contacts.

---

## Rebuilding the Android `.apk` Locally

To rebuild `Simple-Android-v3.0.0.apk`, `releases/Simple-v3.0.0.apk`, and `Simple-Android.apk` after modifying the source code (bump `"version"` in `package.json` to automatically emit the next versioned `.apk`):

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
- **Package ID**: `com.drmverma.simple`
- **Version**: `3.0.0` (`versionCode: 3`)
- **License**: All rights reserved · Created by Dr. M Verma.
