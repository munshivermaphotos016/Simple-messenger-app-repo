# Simple — Private Encrypted Messenger for Android (`v6.0.0`)

**Created by Dr. M Verma**

Simple is a privacy-first, end-to-end encrypted (E2EE) native Android messaging, HD voice/video calling, and 24-hour status application.

---

## Direct Android `.apk` Download & Installation (`v6.0.0`)

This repository includes the ready-to-install, cryptographically signed (JAR v1 + APK Signature Scheme v2) native Android `.apk` files directly in the repository and in **GitHub Releases**:

- **[`Simple-Android-v6.0.0.apk`](./Simple-Android-v6.0.0.apk)** (Repository Root — Latest Versioned `v6.0.0` APK)
- **[`releases/Simple-v6.0.0.apk`](./releases/Simple-v6.0.0.apk)** (`releases/` Folder — Versioned `v6.0.0` APK)
- **[`Simple-Android.apk`](./Simple-Android.apk)** (Repository Root — Latest APK Alias)

> **Automatic GitHub Sync & Build**: Every time changes are synced to this GitHub repository, the `.github/workflows/build-android-apk.yml` workflow automatically compiles the latest source code into `Simple-Android-v6.0.0.apk` and commits the updated `.apk` directly into the repository root, `releases/Simple-v6.0.0.apk`, and **GitHub Releases (`v6.0.0`)**.

### How to Install on Your Android Phone:
1. Tap **[`Simple-Android-v6.0.0.apk`](./Simple-Android-v6.0.0.apk)** in this GitHub repository (or open the **Releases** section and tap `Simple-Android-v6.0.0.apk`).
2. Tap **Download raw file** (or the `⋯` menu → **Download** on GitHub Mobile).
3. Open the downloaded **`Simple-Android-v6.0.0.apk`** on your phone and tap **Install** (allow *Install unknown apps* if prompted by Android).
4. Launch **Simple** from your Android App Drawer (`com.drmverma.simple`).

---

## Rebuilding the Android `.apk` Locally

```bash
npm install
npm run build:apk
```

---

## Creator & Credits

- **Creator & Lead Architect**: **Dr. M Verma**
- **Package ID**: `com.drmverma.simple`
- **Version**: `6.0.0` (`versionCode: 600`)
- **License**: All rights reserved · Created by Dr. M Verma.
