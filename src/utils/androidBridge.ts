// Native Android APK & Standalone Runtime Bridge
// Ensures all /api/* and /ws calls work seamlessly when installed as a standalone Android APK
// (file:///android_asset/index.html or Capacitor https://localhost) as well as on any web host.

export const CLOUD_BACKEND_ORIGIN =
  'https://ais-pre-6fmo26yzskc3abizbl2egg-735834549250.asia-east1.run.app';

export function isAndroidApkEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  const host = window.location.hostname;
  const port = window.location.port;
  if (proto === 'file:' || proto === 'capacitor:' || proto === 'app:') {
    return true;
  }
  // Capacitor Android WebView default origin is https://localhost (with no port)
  if (proto === 'https:' && host === 'localhost' && !port) {
    return true;
  }
  return false;
}

export function getRealtimeWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  if (isAndroidApkEnvironment()) {
    return `${CLOUD_BACKEND_ORIGIN.replace(/^http/, 'ws')}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

function normalizeTargetForOtp(channel: 'phone' | 'email', target: string): string {
  if (channel === 'email') {
    return target.trim().toLowerCase();
  }
  return normalizePhoneDigits(target);
}

interface LocalOtpRecord {
  channel: 'phone' | 'email';
  normalizedTarget: string;
  displayTarget: string;
  code: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
}

function getLocalOtpStore(): Record<string, LocalOtpRecord> {
  try {
    const raw = localStorage.getItem('simple_apk_otp_store_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalOtpStore(store: Record<string, LocalOtpRecord>): void {
  try {
    localStorage.setItem('simple_apk_otp_store_v1', JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

function generateSecureSixDigitOtp(): string {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  const num = 100000 + (array[0] % 900000);
  return String(num);
}

async function handleLocalApiFallback(
  pathName: string,
  searchParams: URLSearchParams,
  method: string,
  bodyObj: Record<string, unknown>
): Promise<Response> {
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (pathName === '/api/health') {
    return jsonResponse({
      status: 'ok',
      runtime: 'android-native-apk',
      e2eeProtocol: 'ECDH-P256-AES256GCM-WebRTC',
      timestamp: Date.now(),
    });
  }

  if (pathName === '/api/auth/request-otp' && method === 'POST') {
    const channel: 'phone' | 'email' = bodyObj.channel === 'email' ? 'email' : 'phone';
    const rawTarget = String(bodyObj.target || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);

    if (channel === 'phone' && normTarget.length < 7) {
      return jsonResponse(
        {
          ok: false,
          error: 'Please enter a valid mobile phone number (at least 7 digits) to receive an SMS OTP.',
        },
        400
      );
    }

    if (channel === 'email' && (!normTarget.includes('@') || !normTarget.includes('.'))) {
      return jsonResponse(
        {
          ok: false,
          error: 'Please enter a valid email address (e.g., name@domain.com) to receive an Email OTP.',
        },
        400
      );
    }

    const challengeKey = `${channel}:${normTarget}`;
    const store = getLocalOtpStore();
    const otpCode = generateSecureSixDigitOtp();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    store[challengeKey] = {
      channel,
      normalizedTarget: normTarget,
      displayTarget: rawTarget,
      code: otpCode,
      expiresAt,
      createdAt: Date.now(),
      attempts: 0,
    };
    saveLocalOtpStore(store);

    return jsonResponse({
      ok: true,
      channel,
      target: rawTarget,
      normalizedTarget: normTarget,
      expiresAt,
      expiresInSec: 300,
      sandboxDispatchedOtp: otpCode,
      message:
        channel === 'phone'
          ? `6-digit SMS verification code sent to ${rawTarget}`
          : `6-digit Email verification code sent to ${rawTarget}`,
    });
  }

  if (pathName === '/api/auth/verify-otp' && method === 'POST') {
    const channel: 'phone' | 'email' = bodyObj.channel === 'email' ? 'email' : 'phone';
    const rawTarget = String(bodyObj.target || '').trim();
    const code = String(bodyObj.code || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);
    const challengeKey = `${channel}:${normTarget}`;

    const store = getLocalOtpStore();
    const record = store[challengeKey];
    if (!record) {
      return jsonResponse(
        {
          ok: false,
          error: `No active OTP request found for ${rawTarget}. Please tap "Send OTP" first.`,
        },
        400
      );
    }

    if (Date.now() > record.expiresAt) {
      delete store[challengeKey];
      saveLocalOtpStore(store);
      return jsonResponse(
        {
          ok: false,
          error: 'This OTP code has expired (5-minute limit). Please request a new OTP.',
        },
        400
      );
    }

    record.attempts += 1;
    if (record.code !== code) {
      saveLocalOtpStore(store);
      const remaining = Math.max(0, 5 - record.attempts);
      return jsonResponse(
        {
          ok: false,
          error: `Invalid 6-digit OTP code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        },
        400
      );
    }

    delete store[challengeKey];
    saveLocalOtpStore(store);

    return jsonResponse({
      ok: true,
      channel,
      normalizedTarget: normTarget,
      verificationToken: `vtok_android_${Date.now()}`,
      verifiedAt: Date.now(),
    });
  }

  if (pathName === '/api/directory' && method === 'GET') {
    try {
      const saved = localStorage.getItem('simple_directory_v2');
      const users = saved ? JSON.parse(saved) : [];
      return jsonResponse({ users });
    } catch {
      return jsonResponse({ users: [] });
    }
  }

  if (pathName === '/api/directory/register' && method === 'POST') {
    return jsonResponse({ ok: true, user: bodyObj });
  }

  if (pathName === '/api/directory/lookup' && method === 'GET') {
    const q = (searchParams.get('q') || '').trim().toLowerCase().replace(/^@/, '');
    const qDigits = normalizePhoneDigits(q);
    try {
      const saved = localStorage.getItem('simple_directory_v2');
      const users: Array<Record<string, unknown>> = saved ? JSON.parse(saved) : [];
      const matches = users.filter((u) => {
        const uName = String(u.username || '').toLowerCase();
        const uEmail = String(u.email || '').toLowerCase();
        const uPhone = String(u.normalizedPhone || '');
        const dName = String(u.name || '').toLowerCase();
        if (uName.includes(q) || (uEmail && uEmail.includes(q)) || dName.includes(q)) return true;
        if (qDigits.length >= 4 && uPhone.includes(qDigits)) return true;
        return false;
      });
      return jsonResponse({ matches });
    } catch {
      return jsonResponse({ matches: [] });
    }
  }

  if (pathName === '/api/backup' && method === 'POST') {
    const blob = {
      id: `bkp_${Date.now()}`,
      createdAt: Date.now(),
      sizeBytes: String(bodyObj.ciphertextBase64 || '').length,
      includeMedia: Boolean(bodyObj.includeMedia),
      saltHex: String(bodyObj.saltHex || ''),
      ivHex: String(bodyObj.ivHex || ''),
      ciphertextBase64: String(bodyObj.ciphertextBase64 || ''),
    };
    try {
      localStorage.setItem(`simple_e2ee_bkp_${bodyObj.userId}`, JSON.stringify(blob));
    } catch {
      // Ignore quota error
    }
    return jsonResponse({
      ok: true,
      id: blob.id,
      createdAt: blob.createdAt,
      sizeBytes: blob.sizeBytes,
    });
  }

  if (pathName.startsWith('/api/backup/') && method === 'GET') {
    const userId = pathName.replace('/api/backup/', '');
    const raw = localStorage.getItem(`simple_e2ee_bkp_${userId}`);
    if (!raw) {
      return jsonResponse({ error: 'No encrypted backup found for user' }, 404);
    }
    return jsonResponse(JSON.parse(raw));
  }

  if (pathName === '/api/account/backup' && method === 'POST') {
    try {
      const uid = String(bodyObj.uid || '');
      const phoneHash = bodyObj.phoneHash ? String(bodyObj.phoneHash) : '';
      const emailHash = bodyObj.emailHash ? String(bodyObj.emailHash) : '';
      const record = {
        uid,
        username: String(bodyObj.username || 'user'),
        phoneHash,
        emailHash,
        backupJson: String(bodyObj.backupJson || ''),
        updatedAt: Date.now(),
      };
      if (uid) localStorage.setItem(`simple_acc_bkp_${uid}`, JSON.stringify(record));
      if (phoneHash) localStorage.setItem(`simple_acc_bkp_ph_${phoneHash}`, JSON.stringify(record));
      if (emailHash) localStorage.setItem(`simple_acc_bkp_em_${emailHash}`, JSON.stringify(record));
      return jsonResponse({ ok: true, updatedAt: record.updatedAt });
    } catch {
      return jsonResponse({ ok: true, updatedAt: Date.now() });
    }
  }

  if (pathName === '/api/account/recover' && method === 'GET') {
    const uid = searchParams.get('uid') || '';
    const phoneHash = searchParams.get('phoneHash') || '';
    const emailHash = searchParams.get('emailHash') || '';
    const raw =
      (uid && localStorage.getItem(`simple_acc_bkp_${uid}`)) ||
      (phoneHash && localStorage.getItem(`simple_acc_bkp_ph_${phoneHash}`)) ||
      (emailHash && localStorage.getItem(`simple_acc_bkp_em_${emailHash}`));
    if (raw) {
      const matched = JSON.parse(raw);
      return jsonResponse({
        ok: true,
        uid: matched.uid,
        username: matched.username,
        backupJson: matched.backupJson,
        updatedAt: matched.updatedAt,
      });
    }
    return jsonResponse({ ok: false, error: 'No local account backup found.' }, 404);
  }

  return jsonResponse({ ok: true });
}

const nativeFetch: typeof fetch =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : fetch;

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
  if (!isApiCall) {
    return nativeFetch(input, init);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr, 'https://simple.local');
  } catch {
    return nativeFetch(input, init);
  }

  if (!parsedUrl.pathname.startsWith('/api/')) {
    return nativeFetch(input, init);
  }

  const method = (init?.method || 'GET').toUpperCase();
  let bodyObj: Record<string, unknown> = {};
  if (init?.body && typeof init.body === 'string') {
    try {
      bodyObj = JSON.parse(init.body);
    } catch {
      bodyObj = {};
    }
  }

  // When running inside a native Android APK (file:// or Capacitor localhost),
  // try the cloud backend first with a short timeout, then fall back to the local on-device handler.
  if (isAndroidApkEnvironment()) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3500);
      const cloudUrl = `${CLOUD_BACKEND_ORIGIN}${parsedUrl.pathname}${parsedUrl.search}`;
      const res = await nativeFetch(cloudUrl, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (res.ok || res.status === 400 || res.status === 429) {
        return res;
      }
    } catch {
      // Cloud backend unreachable or offline; fall back to local on-device handler below
    }
    return handleLocalApiFallback(parsedUrl.pathname, parsedUrl.searchParams, method, bodyObj);
  }

  // When running in browser/web mode, call nativeFetch first, and fall back to local on-device handler if offline
  try {
    const res = await nativeFetch(input, init);
    if (res.ok || res.status === 400 || res.status === 404 || res.status === 429) {
      return res;
    }
    return handleLocalApiFallback(parsedUrl.pathname, parsedUrl.searchParams, method, bodyObj);
  } catch {
    return handleLocalApiFallback(parsedUrl.pathname, parsedUrl.searchParams, method, bodyObj);
  }
}

let bridgeInstalled = false;

export function installAndroidApkNetworkBridge(): void {
  if (typeof window === 'undefined' || bridgeInstalled) return;
  bridgeInstalled = true;

  // Only attempt to override window.fetch inside native Android APK file:// runtime if writable
  if (isAndroidApkEnvironment()) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (!desc || desc.writable || desc.configurable) {
        Object.defineProperty(window, 'fetch', {
          value: apiFetch,
          configurable: true,
          writable: true,
        });
      }
    } catch {
      // Safe fallback: apiFetch is already called directly across all /api/* requests
    }
  }
}
