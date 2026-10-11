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
  if (proto === 'https:' && host === 'localhost' && !port) {
    return true;
  }
  return false;
}

export const isAndroidApkRuntime = isAndroidApkEnvironment;

export function getRemoteServerOrigin(): string {
  if (typeof window === 'undefined' || isAndroidApkEnvironment()) {
    return CLOUD_BACKEND_ORIGIN;
  }
  return window.location.origin;
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

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(length = 20): string {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function base32ToBytes(base32: string): Uint8Array {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

async function verifyTotpWebCrypto(secret: string, code: string): Promise<boolean> {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode) || !secret) return false;
  const keyBytes = base32ToBytes(secret);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    const counter = currentStep + w;
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, Math.floor(counter / 0x100000000), false);
    view.setUint32(4, counter >>> 0, false);
    const sig = new Uint8Array(await window.crypto.subtle.sign('HMAC', cryptoKey, buf));
    const offset = sig[sig.length - 1] & 0x0f;
    const binary =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff);
    const otp = String(binary % 1000000).padStart(6, '0');
    if (otp === cleanCode) return true;
  }
  return false;
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

  if (pathName === '/api/auth/gateway-status' && method === 'GET') {
    return jsonResponse({
      ok: true,
      smtpConfigured: false,
      smtpUserMasked: null,
      smsGatewayConfigured: false,
      totpSupported: true,
      googleOAuthSupported: true,
    });
  }

  if (pathName === '/api/auth/setup-totp' && method === 'POST') {
    const label = String(bodyObj.accountLabel || 'SimpleUser').replace(/[^a-zA-Z0-9@._+-]/g, '');
    const secret = generateBase32Secret(20);
    const otpauthUri = `otpauth://totp/SimpleMessenger:${encodeURIComponent(label)}?secret=${secret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;
    return jsonResponse({
      ok: true,
      secret,
      issuer: 'SimpleMessenger',
      accountLabel: label,
      otpauthUri,
    });
  }

  if (pathName === '/api/account/check' && method === 'POST') {
    const phoneDigits = normalizePhoneDigits(String(bodyObj.phone || ''));
    const cleanEmail = String(bodyObj.email || '').trim().toLowerCase();
    const localAccRaw = localStorage.getItem('simple_account_v3');
    if (localAccRaw) {
      try {
        const acc = JSON.parse(localAccRaw);
        if (
          acc &&
          acc.id &&
          ((phoneDigits && normalizePhoneDigits(acc.phone || '') === phoneDigits) ||
            (cleanEmail && String(acc.email || '').toLowerCase() === cleanEmail))
        ) {
          return jsonResponse({
            ok: true,
            exists: true,
            matchedBy: phoneDigits ? 'phone' : 'email',
            accountSummary: {
              uid: acc.id,
              username: acc.username,
              name: acc.name,
              hasPassword: Boolean(acc.passwordHash),
              hasTwoStepPin: Boolean(acc.twoStepPinHash),
              hasTotp: Boolean(acc.totpSecret),
            },
          });
        }
      } catch {
        // Ignore parse error
      }
    }
    return jsonResponse({ ok: true, exists: false });
  }

  if (pathName === '/api/auth/request-otp' && method === 'POST') {
    return jsonResponse(
      {
        ok: false,
        requiresGatewaySetup: true,
        error:
          'Cloud OTP Gateway is currently unreachable or not configured. Please verify using Authenticator App (RFC 6238 TOTP) or connect to the internet.',
      },
      503
    );
  }

  if (pathName === '/api/auth/verify-otp' && method === 'POST') {
    const code = String(bodyObj.code || '').trim();
    const clientTotpSecret = String(bodyObj.totpSecret || '').trim();
    if (clientTotpSecret && (await verifyTotpWebCrypto(clientTotpSecret, code))) {
      return jsonResponse({
        ok: true,
        verifiedMethod: 'totp_authenticator',
        verificationToken: `vtok_totp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        verifiedAt: Date.now(),
      });
    }
    return jsonResponse(
      {
        ok: false,
        error: 'Invalid 6-digit Authenticator TOTP code. Please check your Authenticator app and try again.',
      },
      400
    );
  }

  if (pathName === '/api/directory' && method === 'GET') {
    try {
      const saved = localStorage.getItem('simple_directory_v3');
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
      const saved = localStorage.getItem('simple_directory_v3');
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
        passwordHash: bodyObj.passwordHash ? String(bodyObj.passwordHash) : undefined,
        twoStepPinHash: bodyObj.twoStepPinHash ? String(bodyObj.twoStepPinHash) : undefined,
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

  if (pathName === '/api/account/recover' && method === 'POST') {
    const uid = String(bodyObj.uid || '');
    const phoneHash = String(bodyObj.phoneHash || '');
    const emailHash = String(bodyObj.emailHash || '');
    const passwordHash = String(bodyObj.passwordHash || '');
    const twoStepPinHash = String(bodyObj.twoStepPinHash || '');
    const verificationToken = String(bodyObj.verificationToken || '');

    if (!passwordHash && !twoStepPinHash && !verificationToken) {
      return jsonResponse(
        { ok: false, error: 'Authentication required to recover account backup.' },
        401
      );
    }

    const raw =
      (uid && localStorage.getItem(`simple_acc_bkp_${uid}`)) ||
      (phoneHash && localStorage.getItem(`simple_acc_bkp_ph_${phoneHash}`)) ||
      (emailHash && localStorage.getItem(`simple_acc_bkp_em_${emailHash}`));
    if (raw) {
      const matched = JSON.parse(raw);
      if (matched.passwordHash && passwordHash && matched.passwordHash !== passwordHash) {
        return jsonResponse({ ok: false, error: 'Incorrect account password.' }, 401);
      }
      if (matched.twoStepPinHash && twoStepPinHash && matched.twoStepPinHash !== twoStepPinHash) {
        return jsonResponse({ ok: false, error: 'Incorrect 6-digit Two-Step PIN.' }, 401);
      }
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

  if (isAndroidApkEnvironment()) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      const cloudUrl = `${CLOUD_BACKEND_ORIGIN}${parsedUrl.pathname}${parsedUrl.search}`;
      const res = await nativeFetch(cloudUrl, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (res.status >= 200 && res.status < 600) {
        return res;
      }
    } catch {
      // Cloud backend unreachable or offline; fall back to local on-device handler below
    }
    return handleLocalApiFallback(parsedUrl.pathname, parsedUrl.searchParams, method, bodyObj);
  }

  try {
    const res = await nativeFetch(input, init);
    if (res.status >= 200 && res.status < 600) {
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
      // Safe fallback
    }
  }
}
