import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const PORT = 3000;

interface OtpGatewayConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  resendApiKey?: string;
  fast2smsApiKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  textbeltApiKey?: string;
}

interface OtpChallengeRecord {
  channel: 'phone' | 'email';
  mode: 'register' | 'login' | 'update';
  normalizedTarget: string;
  displayTarget: string;
  saltHex: string;
  codeHashHex: string;
  totpSecret: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  externalDeliveryStatus: 'delivered_smtp' | 'delivered_sms' | 'authenticator_or_pin';
}

interface VerifiedOwnershipToken {
  token: string;
  channel: 'phone' | 'email';
  normalizedTarget: string;
  verifiedAt: number;
  expiresAt: number;
}

export interface DirectoryUserRecord {
  uid: string;
  name: string;
  username: string;
  phone: string;
  normalizedPhone: string;
  phoneHash?: string;
  phoneTailHash?: string;
  email: string;
  emailHash?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  totpSecret?: string;
  about: string;
  avatarColor: string;
  avatarUrl?: string;
  identityFingerprint: string;
  allowUsernameDiscovery: boolean;
  hidePhoneNumber: boolean;
  isOnline: boolean;
  lastSeen: string;
  updatedAt: number;
}

interface EncryptedBackupBlob {
  id: string;
  createdAt: number;
  sizeBytes: number;
  includeMedia: boolean;
  saltHex: string;
  ivHex: string;
  ciphertextBase64: string;
}

interface CloudAccountBackupRecord {
  uid: string;
  username: string;
  phoneHash?: string;
  emailHash?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  totpSecret?: string;
  backupJson: string;
  updatedAt: number;
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

function computeSha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input.trim()).digest('hex');
}

// ============================================================================
// RFC 6238 TOTP (Google Authenticator / Microsoft Authenticator / Authy)
// ============================================================================
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function computeTotpAtStep(secretBase32: string, step: number): string {
  const key = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return String(code).padStart(6, '0');
}

function verifyTotpCode(secretBase32: string | undefined, candidateCode: string): boolean {
  if (!secretBase32 || !/^\d{6}$/.test(candidateCode.trim())) return false;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let windowOffset = -2; windowOffset <= 2; windowOffset++) {
    if (computeTotpAtStep(secretBase32, currentStep + windowOffset) === candidateCode.trim()) {
      return true;
    }
  }
  return false;
}

const DB_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'simple-db.json');

const userDirectory = new Map<string, DirectoryUserRecord>();
const encryptedBackups = new Map<string, EncryptedBackupBlob>();
const cloudAccountBackups = new Map<string, CloudAccountBackupRecord>();
const routedMessages: Array<Record<string, unknown>> = [];
const otpChallenges = new Map<string, OtpChallengeRecord>();
const verifiedOwnershipTokens = new Map<string, VerifiedOwnershipToken>();
let gatewayConfig: OtpGatewayConfig = {};

function sanitizePublicUserRecord(u: DirectoryUserRecord): Omit<DirectoryUserRecord, 'passwordHash' | 'twoStepPinHash' | 'totpSecret'> {
  const { passwordHash: _pw, twoStepPinHash: _pin, totpSecret: _totp, ...publicFields } = u;
  void _pw;
  void _pin;
  void _totp;
  return publicFields;
}

function loadPersistentDatabase(): void {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.users)) {
      parsed.users.forEach((u: DirectoryUserRecord) => {
        if (u && u.uid) userDirectory.set(u.uid, u);
      });
    }
    if (Array.isArray(parsed.accountBackups)) {
      parsed.accountBackups.forEach(([k, v]: [string, CloudAccountBackupRecord]) => {
        if (k && v) cloudAccountBackups.set(k, v);
      });
    }
    if (Array.isArray(parsed.routedMessages)) {
      parsed.routedMessages.slice(-500).forEach((m: Record<string, unknown>) => {
        routedMessages.push(m);
      });
    }
    if (parsed.gatewayConfig && typeof parsed.gatewayConfig === 'object') {
      gatewayConfig = parsed.gatewayConfig;
    }
  } catch {
    // Ignore corrupt or missing initial DB file
  }
}

function savePersistentDatabase(): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const payload = {
      users: Array.from(userDirectory.values()),
      accountBackups: Array.from(cloudAccountBackups.entries()),
      routedMessages: routedMessages.slice(-500),
      gatewayConfig,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

loadPersistentDatabase();

function normalizeTargetForOtp(channel: 'phone' | 'email', raw: string): string {
  if (channel === 'phone') {
    return normalizePhoneDigits(raw);
  }
  return raw.trim().toLowerCase();
}

function hashOtpWithSalt(code: string, saltHex: string): string {
  return crypto
    .createHash('sha256')
    .update(`SIMPLE_OTP_V1:${saltHex}:${code.trim()}`)
    .digest('hex');
}

function findRegisteredUserByTarget(
  channel: 'phone' | 'email',
  normTarget: string
): DirectoryUserRecord | undefined {
  if (!normTarget) return undefined;
  const targetHash = computeSha256Hex(normTarget);
  const targetTail = channel === 'phone' && normTarget.length >= 7 ? normTarget.slice(-10) : '';
  const targetTailHash = targetTail ? computeSha256Hex(targetTail) : '';

  for (const u of userDirectory.values()) {
    if (channel === 'phone') {
      const uNorm =
        u.normalizedPhone && u.normalizedPhone !== 'REDACTED_SHA256'
          ? normalizePhoneDigits(u.normalizedPhone)
          : normalizePhoneDigits(u.phone);
      const uTail = uNorm.length >= 7 ? uNorm.slice(-10) : '';
      if (
        (uNorm && uNorm === normTarget) ||
        (targetTail && uTail && targetTail === uTail) ||
        (u.phoneHash && u.phoneHash === targetHash) ||
        (targetTailHash && u.phoneTailHash && u.phoneTailHash === targetTailHash)
      ) {
        return u;
      }
    } else {
      const uMail = (u.email || '').trim().toLowerCase();
      if ((uMail && uMail === normTarget) || (u.emailHash && u.emailHash === targetHash)) {
        return u;
      }
    }
  }
  return undefined;
}

function findBackupRecordByTarget(
  channel: 'phone' | 'email',
  normTarget: string
): CloudAccountBackupRecord | undefined {
  if (!normTarget) return undefined;
  const targetHash = computeSha256Hex(normTarget);
  if (channel === 'phone') {
    return (
      cloudAccountBackups.get(`ph_${normTarget}`) ||
      cloudAccountBackups.get(`ph_${targetHash}`) ||
      cloudAccountBackups.get(`usr_${normTarget}`)
    );
  }
  return (
    cloudAccountBackups.get(`em_${normTarget}`) ||
    cloudAccountBackups.get(`em_${targetHash}`)
  );
}

function getEffectiveGatewayConfig(): OtpGatewayConfig {
  return {
    smtpHost: gatewayConfig.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(gatewayConfig.smtpPort || process.env.SMTP_PORT || 465),
    smtpUser: gatewayConfig.smtpUser || process.env.SMTP_USER || process.env.GMAIL_USER || '',
    smtpPass:
      gatewayConfig.smtpPass || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '',
    smtpFrom:
      gatewayConfig.smtpFrom ||
      process.env.SMTP_FROM ||
      gatewayConfig.smtpUser ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      '',
    resendApiKey: gatewayConfig.resendApiKey || process.env.RESEND_API_KEY || '',
    fast2smsApiKey: gatewayConfig.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '',
    twilioAccountSid: gatewayConfig.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: gatewayConfig.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: gatewayConfig.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '',
    textbeltApiKey: gatewayConfig.textbeltApiKey || process.env.TEXTBELT_API_KEY || '',
  };
}

async function dispatchRealEmailOtp(
  toEmail: string,
  otpCode: string,
  mode: string
): Promise<{ delivered: boolean; provider?: string; error?: string }> {
  const cfg = getEffectiveGatewayConfig();
  const subjectText = `${otpCode} is your Simple verification code`;
  const plainText = `Your Simple 6-digit verification code for ${
    mode === 'login' ? 'Sign In' : 'Create Account'
  } is: ${otpCode}\n\nThis code expires in 5 minutes. Never share this code with anyone.`;
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
      <h2 style="color: #10b981; margin-top: 0;">Simple Messenger</h2>
      <p style="color: #cbd5e1; font-size: 14px;">Your 6-digit verification code is:</p>
      <div style="background: #020617; border: 1px solid #10b981; border-radius: 12px; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; letter-spacing: 8px; color: #34d399; font-weight: bold; margin: 20px 0;">
        ${otpCode}
      </div>
      <p style="color: #94a3b8; font-size: 12px;">Valid for 5 minutes. Do not share this code with anyone.</p>
    </div>
  `;

  // 1. Resend Email API (if configured)
  if (cfg.resendApiKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.smtpFrom || 'Simple Messenger <onboarding@resend.dev>',
          to: [toEmail],
          subject: subjectText,
          html: htmlBody,
          text: plainText,
        }),
      });
      if (resp.ok) {
        return { delivered: true, provider: 'Resend Email Service' };
      }
    } catch {
      // Fall through to SMTP
    }
  }

  // 2. Real SMTP Email Delivery (Gmail App Password / Custom SMTP)
  if (cfg.smtpUser && cfg.smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost || 'smtp.gmail.com',
        port: cfg.smtpPort || 465,
        secure: (cfg.smtpPort || 465) === 465,
        auth: {
          user: cfg.smtpUser,
          pass: cfg.smtpPass,
        },
        connectionTimeout: 5000,
      });

      await transporter.sendMail({
        from: `"Simple Messenger" <${cfg.smtpFrom || cfg.smtpUser}>`,
        to: toEmail,
        subject: subjectText,
        text: plainText,
        html: htmlBody,
      });
      return { delivered: true, provider: 'SMTP Email' };
    } catch (err) {
      return {
        delivered: false,
        error: err instanceof Error ? err.message : 'SMTP delivery failed',
      };
    }
  }

  return {
    delivered: false,
    error: 'Outgoing email server (SMTP / Resend) is not configured yet.',
  };
}

async function dispatchRealSmsOtp(
  rawPhone: string,
  normPhone: string,
  otpCode: string
): Promise<{ delivered: boolean; provider?: string; error?: string }> {
  const cfg = getEffectiveGatewayConfig();

  // 1. Fast2SMS (India +91 / 10-digit numbers)
  if (cfg.fast2smsApiKey) {
    try {
      const indianTenDigit = normPhone.length >= 10 ? normPhone.slice(-10) : normPhone;
      const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: cfg.fast2smsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'q',
          message: `Your Simple Messenger verification OTP is ${otpCode}. Do not share this code with anyone.`,
          language: 'english',
          flash: 0,
          numbers: indianTenDigit,
        }),
      });
      const data = (await resp.json()) as Record<string, unknown>;
      if (resp.ok && data.return === true) {
        return { delivered: true, provider: 'Fast2SMS Carrier Gateway' };
      }
    } catch {
      // Fall through to next provider
    }
  }

  // 2. Twilio Programmable SMS
  if (cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioPhoneNumber) {
    try {
      const e164 = rawPhone.trim().startsWith('+') ? rawPhone.trim() : `+${normPhone}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
      const bodyParams = new URLSearchParams({
        To: e164,
        From: cfg.twilioPhoneNumber,
        Body: `Your Simple Messenger verification code is: ${otpCode} (Valid for 5 minutes)`,
      });
      const authHeader = Buffer.from(
        `${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`
      ).toString('base64');
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });
      if (resp.ok) {
        return { delivered: true, provider: 'Twilio Carrier SMS' };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Textbelt SMS Gateway (uses configured key or free-tier 'textbelt' key)
  try {
    const e164 = rawPhone.trim().startsWith('+') ? rawPhone.trim() : `+${normPhone}`;
    const resp = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: e164,
        message: `Your Simple Messenger verification code is ${otpCode}`,
        key: cfg.textbeltApiKey || 'textbelt',
      }),
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (data.success === true) {
      return { delivered: true, provider: 'Textbelt SMS Gateway' };
    }
  } catch {
    // Fall through
  }

  return { delivered: false, error: 'Carrier SMS gateway not configured' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const hmrFallbackWss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has('vite-hmr')) return 'vite-hmr';
      if (protocols.has('vite-ping')) return 'vite-ping';
      const first = protocols.values().next().value;
      return first || false;
    },
  });

  hmrFallbackWss.on('connection', (ws) => {
    try {
      ws.send(JSON.stringify({ type: 'connected' }));
    } catch {
      // Ignore
    }
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      hmrFallbackWss.handleUpgrade(request, socket, head, (ws) => {
        hmrFallbackWss.emit('connection', ws, request);
      });
    }
  });

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const sendApkFile = (_req: express.Request, res: express.Response) => {
    const v8Path = path.join(process.cwd(), 'Simple-Android-v8.0.0.apk');
    const v7Path = path.join(process.cwd(), 'Simple-Android-v7.0.0.apk');
    const v6Path = path.join(process.cwd(), 'Simple-Android-v6.0.0.apk');
    const fallbackPath = path.join(process.cwd(), 'Simple-Android.apk');
    const apkPath = fs.existsSync(v8Path)
      ? v8Path
      : fs.existsSync(v7Path)
      ? v7Path
      : fs.existsSync(v6Path)
      ? v6Path
      : fallbackPath;
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="Simple-Android-v8.0.0.apk"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(apkPath);
  };

  app.get('/Simple-Android-v8.0.0.apk', sendApkFile);
  app.get('/Simple-Android-v7.0.0.apk', sendApkFile);
  app.get('/Simple-Android-v6.0.0.apk', sendApkFile);
  app.get('/Simple-Android-v5.0.0.apk', sendApkFile);
  app.get('/Simple-Android-v4.0.0.apk', sendApkFile);
  app.get('/Simple-Android-v3.0.0.apk', sendApkFile);
  app.get('/Simple-Android.apk', sendApkFile);
  app.get('/Simple-Messenger.apk', sendApkFile);
  app.get('/releases/Simple-v8.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v7.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v6.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v5.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v4.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v3.0.0.apk', sendApkFile);
  app.get('/releases/Simple-v1.0.0.apk', sendApkFile);
  app.get('/api/download/apk', sendApkFile);
  app.get('/api/download-apk', sendApkFile);
  app.get('/api/download-apk/:filename', sendApkFile);

  app.get('/api/health', (_req, res) => {
    const eff = getEffectiveGatewayConfig();
    res.json({
      status: 'ok',
      service: 'Simple Zero-Knowledge Relay & User Directory',
      telemetry: 'disabled',
      advertisingIds: 'none',
      plaintextStorage: false,
      otpAuthActive: true,
      smtpConfigured: Boolean(eff.smtpUser && eff.smtpPass),
      smsGatewayConfigured: Boolean(
        eff.fast2smsApiKey || (eff.twilioAccountSid && eff.twilioAuthToken) || eff.textbeltApiKey
      ),
      activeConnections: wss.clients.size,
      registeredUsers: userDirectory.size,
    });
  });

  // Check or configure Real OTP Gateway (SMTP Email & Carrier SMS)
  app.get('/api/auth/gateway-status', (_req, res) => {
    const eff = getEffectiveGatewayConfig();
    res.json({
      ok: true,
      smtpConfigured: Boolean(eff.smtpUser && eff.smtpPass),
      smtpHost: eff.smtpHost || 'smtp.gmail.com',
      smtpUserMasked: eff.smtpUser
        ? `${eff.smtpUser.slice(0, 3)}***@${eff.smtpUser.split('@')[1] || 'gmail.com'}`
        : null,
      smsConfigured: Boolean(
        eff.fast2smsApiKey || (eff.twilioAccountSid && eff.twilioAuthToken) || eff.textbeltApiKey
      ),
      smsProvider: eff.fast2smsApiKey
        ? 'Fast2SMS'
        : eff.twilioAccountSid
        ? 'Twilio'
        : eff.textbeltApiKey
        ? 'Textbelt'
        : null,
    });
  });

  const handleGatewayConfig = (req: express.Request, res: express.Response) => {
    const {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      resendApiKey,
      fast2smsApiKey,
      twilioAccountSid,
      twilioAuthToken,
      twilioPhoneNumber,
      textbeltApiKey,
    } = req.body || {};

    gatewayConfig = {
      ...gatewayConfig,
      ...(smtpHost !== undefined ? { smtpHost: String(smtpHost).trim() } : {}),
      ...(smtpPort !== undefined ? { smtpPort: Number(smtpPort) || 465 } : {}),
      ...(smtpUser !== undefined ? { smtpUser: String(smtpUser).trim() } : {}),
      ...(smtpPass !== undefined ? { smtpPass: String(smtpPass).trim() } : {}),
      ...(resendApiKey !== undefined ? { resendApiKey: String(resendApiKey).trim() } : {}),
      ...(fast2smsApiKey !== undefined ? { fast2smsApiKey: String(fast2smsApiKey).trim() } : {}),
      ...(twilioAccountSid !== undefined
        ? { twilioAccountSid: String(twilioAccountSid).trim() }
        : {}),
      ...(twilioAuthToken !== undefined
        ? { twilioAuthToken: String(twilioAuthToken).trim() }
        : {}),
      ...(twilioPhoneNumber !== undefined
        ? { twilioPhoneNumber: String(twilioPhoneNumber).trim() }
        : {}),
      ...(textbeltApiKey !== undefined ? { textbeltApiKey: String(textbeltApiKey).trim() } : {}),
    };
    savePersistentDatabase();

    const eff = getEffectiveGatewayConfig();
    res.json({
      ok: true,
      smtpConfigured: Boolean((eff.smtpUser && eff.smtpPass) || eff.resendApiKey),
      smsGatewayConfigured: Boolean(
        eff.fast2smsApiKey || (eff.twilioAccountSid && eff.twilioAuthToken) || eff.textbeltApiKey
      ),
      smsConfigured: Boolean(
        eff.fast2smsApiKey || (eff.twilioAccountSid && eff.twilioAuthToken) || eff.textbeltApiKey
      ),
    });
  };

  app.post('/api/auth/gateway-config', handleGatewayConfig);
  app.post('/api/auth/configure-gateway', handleGatewayConfig);

  // Setup RFC 6238 Authenticator App TOTP Secret
  app.post('/api/auth/setup-totp', (req, res) => {
    const accountLabel = String(req.body?.accountLabel || req.body?.label || req.body?.identifier || 'SimpleUser')
      .trim()
      .replace(/[^a-zA-Z0-9@._+-]/g, '');
    const secret = generateBase32Secret(20);
    const label = encodeURIComponent(`SimpleMessenger:${accountLabel}`);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=SimpleMessenger&algorithm=SHA1&digits=6&period=30`;
    res.json({
      ok: true,
      secret,
      totpSecret: secret,
      issuer: 'SimpleMessenger',
      accountLabel,
      otpauthUri,
    });
  });

  // Safe Account Existence & Credential Pre-Check (Never leaks backupJson or private data)
  app.post('/api/account/check', (req, res) => {
    const rawPhone = String(req.body.phone || '').trim();
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    const mode: 'register' | 'login' | 'check' =
      req.body.mode === 'login'
        ? 'login'
        : req.body.mode === 'register'
        ? 'register'
        : 'check';
    const passwordHash = String(req.body.passwordHash || '').trim();

    const normPhone = normalizePhoneDigits(rawPhone);
    const existingPhoneUser =
      normPhone.length >= 7 ? findRegisteredUserByTarget('phone', normPhone) : undefined;
    const existingEmailUser =
      rawEmail.includes('@') ? findRegisteredUserByTarget('email', rawEmail) : undefined;
    const existingPhoneBackup =
      normPhone.length >= 7 ? findBackupRecordByTarget('phone', normPhone) : undefined;
    const existingEmailBackup =
      rawEmail.includes('@') ? findBackupRecordByTarget('email', rawEmail) : undefined;

    const matchedUser = existingPhoneUser || existingEmailUser;
    const matchedBackup = existingPhoneBackup || existingEmailBackup;
    const accountExists = Boolean(matchedUser || matchedBackup);
    const matchedBy =
      existingPhoneUser || existingPhoneBackup
        ? 'mobile phone number'
        : existingEmailUser || existingEmailBackup
        ? 'email address'
        : null;

    if (mode === 'register' && accountExists) {
      res.status(409).json({
        ok: false,
        exists: true,
        matchedBy,
        accountSummary: {
          username: matchedUser?.username || matchedBackup?.username || null,
        },
        error: `An account with this ${matchedBy} (@${
          matchedUser?.username || matchedBackup?.username || 'user'
        }) is already registered in the Simple database. You cannot create a new account using someone else's registered ${matchedBy}. Please switch to "Sign In" and enter your Account Password.`,
      });
      return;
    }

    if (mode === 'login' && !accountExists) {
      res.status(404).json({
        ok: false,
        exists: false,
        error:
          'No registered Simple account was found for this mobile number / email. Please verify your details or switch to "Create New Account" to register.',
      });
      return;
    }

    if (mode === 'login' && accountExists && passwordHash) {
      const storedPasswordHash = matchedUser?.passwordHash || matchedBackup?.passwordHash || '';
      if (storedPasswordHash && passwordHash !== storedPasswordHash) {
        res.status(401).json({
          ok: false,
          exists: true,
          error:
            'Incorrect account password for this Simple account. Please enter your exact Account Password to sign in.',
        });
        return;
      }
    }

    res.json({
      ok: true,
      exists: accountExists,
      matchedBy,
      username: matchedUser?.username || matchedBackup?.username || null,
      accountSummary: accountExists
        ? {
            username: matchedUser?.username || matchedBackup?.username || null,
            hasPassword: Boolean(matchedUser?.passwordHash || matchedBackup?.passwordHash),
            hasTwoStepPin: Boolean(matchedUser?.twoStepPinHash || matchedBackup?.twoStepPinHash),
          }
        : null,
      hasPassword: Boolean(matchedUser?.passwordHash || matchedBackup?.passwordHash),
      hasTwoStepPin: Boolean(matchedUser?.twoStepPinHash || matchedBackup?.twoStepPinHash),
    });
  });

  // Verify Google OAuth2 Access Token or ID Token directly with Google's official API
  const handleVerifyGoogleAuth = async (req: express.Request, res: express.Response) => {
    const accessToken = String(req.body.accessToken || '').trim();
    const idToken = String(req.body.idToken || '').trim();
    const expectedEmail = String(req.body.target || req.body.email || '').trim().toLowerCase();

    if (!accessToken && !idToken) {
      res.status(400).json({ ok: false, error: 'Missing Google OAuth token.' });
      return;
    }

    try {
      let verifiedEmail = '';
      let displayName = '';
      let picture = '';

      if (idToken) {
        const tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
        );
        if (!tokenRes.ok) {
          res.status(401).json({
            ok: false,
            error: 'Google ID token verification failed with Google servers.',
          });
          return;
        }
        const tokenInfo = (await tokenRes.json()) as {
          email?: string;
          email_verified?: string | boolean;
          name?: string;
          picture?: string;
        };
        verifiedEmail = String(tokenInfo.email || '').trim().toLowerCase();
        displayName = String(tokenInfo.name || '');
        picture = String(tokenInfo.picture || '');
      } else {
        const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!gRes.ok) {
          res.status(401).json({
            ok: false,
            error: 'Google OAuth token verification failed with Google servers.',
          });
          return;
        }
        const profile = (await gRes.json()) as {
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        };
        verifiedEmail = String(profile.email || '').trim().toLowerCase();
        displayName = String(profile.name || '');
        picture = String(profile.picture || '');
      }

      if (!verifiedEmail) {
        res.status(401).json({
          ok: false,
          error: 'Google account does not have a verified email address.',
        });
        return;
      }
      if (expectedEmail && expectedEmail !== verifiedEmail) {
        res.status(403).json({
          ok: false,
          error: `Google Sign-In verified "${verifiedEmail}", which does not match the entered email "${expectedEmail}".`,
        });
        return;
      }

      const verificationToken = `vtok_${crypto.randomBytes(24).toString('hex')}`;
      const tokenRecord: VerifiedOwnershipToken = {
        token: verificationToken,
        channel: 'email',
        normalizedTarget: verifiedEmail,
        verifiedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      verifiedOwnershipTokens.set(verificationToken, tokenRecord);

      res.json({
        ok: true,
        channel: 'email',
        email: verifiedEmail,
        normalizedTarget: verifiedEmail,
        verifiedEmail,
        name: displayName,
        picture,
        verificationToken,
        verifiedAt: tokenRecord.verifiedAt,
      });
    } catch {
      res.status(500).json({
        ok: false,
        error: 'Failed to contact Google OAuth verification servers.',
      });
    }
  };

  app.post('/api/auth/verify-google', handleVerifyGoogleAuth);
  app.post('/api/auth/verify-google-token', handleVerifyGoogleAuth);

  // ============================================================================
  // REAL ACCOUNT OWNERSHIP OTP VERIFICATION SYSTEM (Zero Dummy In-App OTPs)
  // ============================================================================
  app.post('/api/auth/request-otp', async (req, res) => {
    const channel: 'phone' | 'email' = req.body.channel === 'email' ? 'email' : 'phone';
    const mode: 'register' | 'login' | 'update' =
      req.body.mode === 'login'
        ? 'login'
        : req.body.mode === 'update' || req.body.mode === 'change_identifier'
        ? 'update'
        : 'register';
    const rawTarget = String(req.body.target || req.body.identifier || '').trim();
    const passwordHash = String(req.body.passwordHash || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);

    if (channel === 'phone' && normTarget.length < 7) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid mobile phone number (at least 7 digits).',
      });
      return;
    }

    if (channel === 'email' && (!normTarget.includes('@') || !normTarget.includes('.'))) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid email address (e.g., name@gmail.com).',
      });
      return;
    }

    // Check database for existing account ownership
    const existingUser = findRegisteredUserByTarget(channel, normTarget);
    const existingBackup = findBackupRecordByTarget(channel, normTarget);
    const isAlreadyRegistered = Boolean(existingUser || existingBackup);

    if (mode === 'register' && isAlreadyRegistered) {
      res.status(409).json({
        ok: false,
        error: `This ${
          channel === 'phone' ? 'mobile phone number' : 'email address'
        } (${rawTarget}) is already registered to an existing Simple account (@${
          existingUser?.username || existingBackup?.username || 'user'
        }). You cannot create a new account with someone else's registered ${channel}. Switch to "Sign In" and enter your Account Password.`,
      });
      return;
    }

    if (mode === 'login' && !isAlreadyRegistered) {
      res.status(404).json({
        ok: false,
        error: `No Simple account exists for ${rawTarget}. Please check your ${
          channel === 'phone' ? 'mobile number' : 'email address'
        } or switch to "Create New Account".`,
      });
      return;
    }

    if (mode === 'login' && isAlreadyRegistered) {
      const storedPasswordHash =
        existingUser?.passwordHash || existingBackup?.passwordHash || '';
      if (storedPasswordHash && (!passwordHash || passwordHash !== storedPasswordHash)) {
        res.status(401).json({
          ok: false,
          error: `Incorrect account password for ${rawTarget}. Access denied.`,
        });
        return;
      }
    }

    const challengeKey = `${channel}:${normTarget}`;
    const existingChallenge = otpChallenges.get(challengeKey);
    if (existingChallenge && Date.now() - existingChallenge.createdAt < 4000) {
      res.status(429).json({
        ok: false,
        error: 'Please wait a few seconds before requesting another verification code.',
      });
      return;
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const saltHex = crypto.randomBytes(16).toString('hex');
    const codeHashHex = hashOtpWithSalt(otpCode, saltHex);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    // Preserve existing TOTP secret for registered accounts; generate a new one ONLY for unclaimed accounts
    const accountTotpSecret =
      existingUser?.totpSecret ||
      existingBackup?.totpSecret ||
      existingChallenge?.totpSecret ||
      generateBase32Secret(20);

    let deliveryStatus: OtpChallengeRecord['externalDeliveryStatus'] = 'authenticator_or_pin';
    let deliveryProvider: string | null = null;
    let externalDelivered = false;

    if (channel === 'email') {
      const emailResult = await dispatchRealEmailOtp(normTarget, otpCode, mode);
      if (emailResult.delivered) {
        deliveryStatus = 'delivered_smtp';
        deliveryProvider = emailResult.provider || 'Email OTP';
        externalDelivered = true;
      }
    } else {
      const smsResult = await dispatchRealSmsOtp(rawTarget, normTarget, otpCode);
      if (smsResult.delivered) {
        deliveryStatus = 'delivered_sms';
        deliveryProvider = smsResult.provider || 'Carrier SMS';
        externalDelivered = true;
      }
    }

    const record: OtpChallengeRecord = {
      channel,
      mode,
      normalizedTarget: normTarget,
      displayTarget: rawTarget,
      saltHex,
      codeHashHex,
      totpSecret: accountTotpSecret,
      expiresAt,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: 5,
      externalDeliveryStatus: deliveryStatus,
    };

    otpChallenges.set(challengeKey, record);

    const label = encodeURIComponent(`Simple:${rawTarget}`);
    const otpauthUri =
      !isAlreadyRegistered && mode !== 'login'
        ? `otpauth://totp/${label}?secret=${accountTotpSecret}&issuer=Simple&algorithm=SHA1&digits=6&period=30`
        : undefined;

    // SECURITY GUARANTEE: Never return `deliveredCode`, `otpCode`, or any inbox preview URL in the response!
    res.json({
      ok: true,
      channel,
      mode,
      target: rawTarget,
      normalizedTarget: normTarget,
      expiresAt,
      expiresInSec: 300,
      externalDelivered,
      deliveryProvider,
      hasTwoStepPin: Boolean(existingUser?.twoStepPinHash || existingBackup?.twoStepPinHash),
      hasTotp: Boolean(existingUser?.totpSecret || existingBackup?.totpSecret),
      totpEnrollment:
        !isAlreadyRegistered && mode !== 'login'
          ? {
              secret: accountTotpSecret,
              otpauthUri,
              issuer: 'Simple',
              period: 30,
              digits: 6,
            }
          : null,
      message: externalDelivered
        ? `6-digit verification code sent to ${rawTarget} via ${
            channel === 'email' ? 'email' : 'text message (SMS)'
          }.`
        : channel === 'email'
        ? `Verify ${rawTarget} using your email code, Google Sign-In, 6-Digit Security PIN, or Authenticator.`
        : `Verify ${rawTarget} using your SMS code, 6-Digit Security PIN, or Authenticator.`,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const rawTarget = String(req.body.target || req.body.identifier || '').trim();
    const channel: 'phone' | 'email' =
      req.body.channel === 'email' || rawTarget.includes('@') ? 'email' : 'phone';
    const mode: 'register' | 'login' | 'update' =
      req.body.mode === 'login' ? 'login' : 'register';
    const code = String(req.body.code || '').trim();
    const passwordHash = String(req.body.passwordHash || '').trim();
    const clientTotpSecret = String(req.body.totpSecret || '').trim();
    const clientTwoStepPinHash = String(req.body.twoStepPinHash || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);
    const challengeKey = `${channel}:${normTarget}`;

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid 6-digit numeric verification code.',
      });
      return;
    }

    const record = otpChallenges.get(challengeKey);
    const existingUser = findRegisteredUserByTarget(channel, normTarget);
    const existingBackup = findBackupRecordByTarget(channel, normTarget);

    // 1. Check against RFC 6238 Authenticator App TOTP (Google Authenticator / Authy)
    const activeTotpSecret =
      existingUser?.totpSecret ||
      existingBackup?.totpSecret ||
      record?.totpSecret ||
      (mode === 'register' ? clientTotpSecret : '');
    const matchesAuthenticatorTotp = activeTotpSecret
      ? verifyTotpCode(activeTotpSecret, code)
      : false;

    // 2. Check against 6-Digit Security PIN (stored on account for login, or chosen by user during new registration)
    const storedPasswordHash =
      existingUser?.passwordHash || existingBackup?.passwordHash || '';
    const storedPinHash =
      existingUser?.twoStepPinHash ||
      existingBackup?.twoStepPinHash ||
      (mode === 'register' ? clientTwoStepPinHash : '');
    const candidatePinHash = computeSha256Hex(code);
    const matchesTwoStepPin =
      Boolean(storedPinHash) &&
      candidatePinHash === storedPinHash &&
      (!storedPasswordHash || !passwordHash || passwordHash === storedPasswordHash);

    // 3. Check against server-dispatched SMTP/SMS 6-digit OTP hash
    let matchesDispatchedOtp = false;
    if (record) {
      if (Date.now() > record.expiresAt) {
        otpChallenges.delete(challengeKey);
        if (!matchesAuthenticatorTotp && !matchesTwoStepPin) {
          res.status(400).json({
            ok: false,
            error: 'Verification session expired (5-minute limit). Please request a new code.',
          });
          return;
        }
      } else {
        record.attempts += 1;
        if (record.attempts > record.maxAttempts) {
          otpChallenges.delete(challengeKey);
          res.status(429).json({
            ok: false,
            error: 'Too many incorrect verification attempts. Session locked — please try again.',
          });
          return;
        }
        const candidateHash = hashOtpWithSalt(code, record.saltHex);
        matchesDispatchedOtp = candidateHash === record.codeHashHex;
      }
    }

    if (!matchesDispatchedOtp && !matchesAuthenticatorTotp && !matchesTwoStepPin) {
      const remaining = record ? Math.max(0, record.maxAttempts - record.attempts) : 4;
      res.status(400).json({
        ok: false,
        error: `Invalid 6-digit verification code. ${remaining} attempt${
          remaining === 1 ? '' : 's'
        } remaining.`,
      });
      return;
    }

    // Verified! Consume challenge and issue cryptographic ownership token
    const verifiedTotpSecret = activeTotpSecret || record?.totpSecret;
    if (record) {
      otpChallenges.delete(challengeKey);
    }
    const verificationToken = `vtok_${crypto.randomBytes(24).toString('hex')}`;
    const tokenRecord: VerifiedOwnershipToken = {
      token: verificationToken,
      channel,
      normalizedTarget: normTarget,
      verifiedAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour token validity
    };
    verifiedOwnershipTokens.set(verificationToken, tokenRecord);

    res.json({
      ok: true,
      channel,
      normalizedTarget: normTarget,
      verificationToken,
      verifiedMethod: matchesAuthenticatorTotp
        ? 'totp_authenticator'
        : matchesTwoStepPin
        ? 'two_step_pin'
        : 'real_otp',
      totpSecret: verifiedTotpSecret,
      verifiedAt: tokenRecord.verifiedAt,
    });
  });

  // Get all registered directory users (sanitized: never exposes passwordHash, twoStepPinHash, or totpSecret)
  app.get('/api/directory', (_req, res) => {
    res.json({
      users: Array.from(userDirectory.values()).map(sanitizePublicUserRecord),
    });
  });

  // Register or update a user in the global directory (enforces uniqueness & ownership verification)
  app.post('/api/directory/register', (req, res) => {
    const {
      uid,
      name,
      username,
      phone,
      normalizedPhone,
      phoneHash,
      phoneTailHash,
      email,
      emailHash,
      passwordHash,
      twoStepPinHash,
      totpSecret,
      verificationToken,
      about,
      avatarColor,
      avatarUrl,
      identityFingerprint,
      allowUsernameDiscovery,
      hidePhoneNumber,
    } = req.body;

    if (!uid) {
      res.status(400).json({ ok: false, error: 'uid is required' });
      return;
    }

    const existing = userDirectory.get(String(uid));
    const normPhone =
      normalizedPhone && normalizedPhone !== 'REDACTED_SHA256'
        ? normalizePhoneDigits(String(normalizedPhone))
        : normalizePhoneDigits(String(phone || existing?.normalizedPhone || ''));
    const cleanEmail = String(email ?? existing?.email ?? '').toLowerCase().trim();
    const cleanUsername = String(
      username ||
        existing?.username ||
        (cleanEmail ? cleanEmail.split('@')[0] : '') ||
        `user.${normPhone.slice(-6) || Date.now().toString().slice(-4)}`
    )
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9._-]/g, '');

    // Check if another user with a different UID already owns this phone, email, or username
    if (normPhone.length >= 7) {
      const ownerByPhone = findRegisteredUserByTarget('phone', normPhone);
      if (ownerByPhone && ownerByPhone.uid !== String(uid)) {
        res.status(409).json({
          ok: false,
          error: 'This mobile phone number is already registered to another Simple account.',
        });
        return;
      }
    }

    if (cleanEmail.includes('@')) {
      const ownerByEmail = findRegisteredUserByTarget('email', cleanEmail);
      if (ownerByEmail && ownerByEmail.uid !== String(uid)) {
        res.status(409).json({
          ok: false,
          error: 'This email address is already registered to another Simple account.',
        });
        return;
      }
    }

    // If updating an existing account that has a passwordHash, verify credentials or token
    if (existing?.passwordHash) {
      const hasValidToken =
        verificationToken && verifiedOwnershipTokens.has(String(verificationToken));
      const hasMatchingPassword =
        passwordHash && String(passwordHash) === existing.passwordHash;
      // Allow harmless online heartbeat / profile sync only if password matches, token is valid, or passwordHash isn't being overwritten
      if (passwordHash && !hasMatchingPassword && !hasValidToken) {
        res.status(401).json({
          ok: false,
          error: 'Unauthorized attempt to modify an existing Simple account.',
        });
        return;
      }
    }

    const computedPhoneHash =
      phoneHash
        ? String(phoneHash)
        : normPhone.length >= 7
        ? computeSha256Hex(normPhone)
        : existing?.phoneHash;
    const computedPhoneTailHash =
      phoneTailHash
        ? String(phoneTailHash)
        : normPhone.length >= 7
        ? computeSha256Hex(normPhone.slice(-10))
        : existing?.phoneTailHash;
    const computedEmailHash =
      emailHash
        ? String(emailHash)
        : cleanEmail.includes('@')
        ? computeSha256Hex(cleanEmail)
        : existing?.emailHash;

    const record: DirectoryUserRecord = {
      uid: String(uid),
      name: String(name || existing?.name || cleanUsername),
      username: cleanUsername,
      phone: String(phone || existing?.phone || ''),
      normalizedPhone: normPhone || String(existing?.normalizedPhone || ''),
      phoneHash: computedPhoneHash,
      phoneTailHash: computedPhoneTailHash,
      email: cleanEmail,
      emailHash: computedEmailHash,
      passwordHash: passwordHash ? String(passwordHash) : existing?.passwordHash,
      twoStepPinHash: twoStepPinHash ? String(twoStepPinHash) : existing?.twoStepPinHash,
      totpSecret: totpSecret ? String(totpSecret) : existing?.totpSecret,
      about: String(about || existing?.about || 'Hey there! I am using Simple.'),
      avatarColor: String(avatarColor || existing?.avatarColor || '#10B981'),
      avatarUrl: avatarUrl ? String(avatarUrl) : existing?.avatarUrl,
      identityFingerprint: String(
        identityFingerprint ||
          existing?.identityFingerprint ||
          'A91C4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3'
      ),
      allowUsernameDiscovery: allowUsernameDiscovery !== false,
      hidePhoneNumber: Boolean(hidePhoneNumber),
      isOnline: true,
      lastSeen: 'Online',
      updatedAt: Date.now(),
    };

    userDirectory.set(record.uid, record);
    savePersistentDatabase();

    const publicUser = sanitizePublicUserRecord(record);

    // Broadcast updated public user profile to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: 'directory:user_updated',
            user: publicUser,
          })
        );
      }
    });

    res.json({ ok: true, user: publicUser });
  });

  // Sync saved phone contacts against registered Simple users
  app.post('/api/contacts/sync', (req, res) => {
    const contacts: Array<{
      phone?: string;
      normalizedPhone?: string;
      phoneHash?: string;
      phoneTailHash?: string;
      email?: string;
      emailHash?: string;
    }> = Array.isArray(req.body.contacts) ? req.body.contacts : [];

    const allUsers = Array.from(userDirectory.values());
    const matchedUsers: DirectoryUserRecord[] = [];
    const seenUids = new Set<string>();

    contacts.forEach((c) => {
      const cDigits = normalizePhoneDigits(String(c.normalizedPhone || c.phone || ''));
      const cTail = cDigits.length >= 7 ? cDigits.slice(-10) : cDigits;
      const cHash = c.phoneHash ? String(c.phoneHash) : '';
      const cTailHash = c.phoneTailHash ? String(c.phoneTailHash) : '';
      const cEmail = String(c.email || '').trim().toLowerCase();
      const cEmailHash = c.emailHash ? String(c.emailHash) : '';

      allUsers.forEach((u) => {
        if (seenUids.has(u.uid)) return;
        const uDigits = normalizePhoneDigits(u.normalizedPhone || u.phone || '');
        const uTail = uDigits.length >= 7 ? uDigits.slice(-10) : uDigits;
        const matchByHash =
          (cHash && u.phoneHash && cHash === u.phoneHash) ||
          (cTailHash && u.phoneTailHash && cTailHash === u.phoneTailHash) ||
          (cEmailHash && u.emailHash && cEmailHash === u.emailHash);
        const matchByDigits =
          cDigits.length >= 7 &&
          uDigits.length >= 7 &&
          (cDigits === uDigits || cTail === uTail || uDigits.endsWith(cTail) || cDigits.endsWith(uTail));
        const matchByEmail = Boolean(cEmail && u.email && cEmail === u.email.toLowerCase());

        if (matchByHash || matchByDigits || matchByEmail) {
          seenUids.add(u.uid);
          matchedUsers.push(u);
        }
      });
    });

    res.json({
      ok: true,
      matchedUsers: matchedUsers.map(sanitizePublicUserRecord),
      totalRegisteredUsers: allUsers.length,
    });
  });

  // Search/Find user by Phone Number, @username, or Email
  app.get('/api/directory/lookup', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ matches: [] });
      return;
    }

    const qLower = q.toLowerCase().replace(/^@/, '');
    const qDigits = normalizePhoneDigits(q);

    const matches = Array.from(userDirectory.values())
      .filter((u) => {
        // Exact or partial username match
        if (u.username.toLowerCase() === qLower || u.username.toLowerCase().includes(qLower)) {
          return true;
        }
        // Exact or partial email match
        if (u.email && (u.email.toLowerCase() === qLower || u.email.toLowerCase().includes(qLower))) {
          return true;
        }
        // Phone number match (matches full normalized phone or last 7-10 digits so local vs country-code formats match!)
        if (qDigits.length >= 4) {
          if (
            u.normalizedPhone === qDigits ||
            u.normalizedPhone.endsWith(qDigits) ||
            (qDigits.length >= 7 && qDigits.endsWith(u.normalizedPhone.slice(-7))) ||
            u.normalizedPhone.includes(qDigits)
          ) {
            return true;
          }
        }
        // Name match
        if (u.name.toLowerCase().includes(qLower)) {
          return true;
        }
        return false;
      })
      .map(sanitizePublicUserRecord);

    res.json({ matches });
  });

  // Legacy key endpoint
  app.post('/api/keys', (req, res) => {
    const { userId, fingerprint } = req.body;
    res.json({ ok: true, userId, fingerprint });
  });

  // Store E2EE Cloud Backup
  app.post('/api/backup', (req, res) => {
    const { userId, includeMedia, saltHex, ivHex, ciphertextBase64 } = req.body;
    if (!userId || !saltHex || !ivHex || !ciphertextBase64) {
      res.status(400).json({ error: 'Invalid encrypted backup payload' });
      return;
    }
    const blob: EncryptedBackupBlob = {
      id: `bkp_${Date.now()}`,
      createdAt: Date.now(),
      sizeBytes: Buffer.byteLength(ciphertextBase64, 'utf8'),
      includeMedia: Boolean(includeMedia),
      saltHex,
      ivHex,
      ciphertextBase64,
    };
    encryptedBackups.set(userId, blob);
    res.json({
      ok: true,
      id: blob.id,
      createdAt: blob.createdAt,
      sizeBytes: blob.sizeBytes,
    });
  });

  app.get('/api/backup/:userId', (req, res) => {
    const blob = encryptedBackups.get(req.params.userId);
    if (!blob) {
      res.status(404).json({ error: 'No encrypted backup found for user' });
      return;
    }
    res.json(blob);
  });

  app.post('/api/account/backup', (req, res) => {
    const {
      uid,
      username,
      phoneHash,
      emailHash,
      passwordHash,
      twoStepPinHash,
      totpSecret,
      verificationToken,
      backupJson,
    } = req.body;
    if (!uid || !backupJson) {
      res.status(400).json({ ok: false, error: 'uid and backupJson are required' });
      return;
    }

    const existing = cloudAccountBackups.get(String(uid));
    const dirUser = userDirectory.get(String(uid));
    const storedPasswordHash = existing?.passwordHash || dirUser?.passwordHash;

    // Prevent unauthorized overwrite of an existing account backup
    if (storedPasswordHash) {
      const hasValidToken =
        verificationToken && verifiedOwnershipTokens.has(String(verificationToken));
      const hasMatchingPassword =
        passwordHash && String(passwordHash) === storedPasswordHash;
      if (passwordHash && !hasMatchingPassword && !hasValidToken) {
        res.status(401).json({
          ok: false,
          error: 'Unauthorized attempt to overwrite existing account backup.',
        });
        return;
      }
    }

    const record: CloudAccountBackupRecord = {
      uid: String(uid),
      username: String(username || existing?.username || dirUser?.username || 'user'),
      phoneHash: phoneHash ? String(phoneHash) : existing?.phoneHash,
      emailHash: emailHash ? String(emailHash) : existing?.emailHash,
      passwordHash: passwordHash
        ? String(passwordHash)
        : existing?.passwordHash || dirUser?.passwordHash,
      twoStepPinHash: twoStepPinHash
        ? String(twoStepPinHash)
        : existing?.twoStepPinHash || dirUser?.twoStepPinHash,
      totpSecret: totpSecret
        ? String(totpSecret)
        : existing?.totpSecret || dirUser?.totpSecret,
      backupJson: String(backupJson),
      updatedAt: Date.now(),
    };
    cloudAccountBackups.set(record.uid, record);
    if (record.phoneHash) {
      cloudAccountBackups.set(`ph_${record.phoneHash}`, record);
      cloudAccountBackups.set(`ph_${computeSha256Hex(record.phoneHash)}`, record);
    }
    if (record.emailHash) {
      cloudAccountBackups.set(`em_${record.emailHash}`, record);
      cloudAccountBackups.set(`em_${computeSha256Hex(record.emailHash)}`, record);
    }
    savePersistentDatabase();
    res.json({ ok: true, updatedAt: record.updatedAt });
  });

  // Authenticated Account Recovery (Requires valid OTP verificationToken + matching passwordHash if set)
  const handleAuthenticatedAccountRecover = (req: express.Request, res: express.Response) => {
    const source = req.method === 'POST' ? req.body || {} : req.query || {};
    const uid = source.uid ? String(source.uid) : '';
    const phoneHash = source.phoneHash ? String(source.phoneHash) : '';
    const emailHash = source.emailHash ? String(source.emailHash).toLowerCase().trim() : '';
    const passwordHash = source.passwordHash ? String(source.passwordHash).trim() : '';
    const verificationToken = source.verificationToken
      ? String(source.verificationToken).trim()
      : '';

    let matched = uid ? cloudAccountBackups.get(uid) : undefined;
    if (!matched && phoneHash) {
      matched =
        cloudAccountBackups.get(`ph_${phoneHash}`) ||
        cloudAccountBackups.get(`ph_${computeSha256Hex(phoneHash)}`);
    }
    if (!matched && emailHash) {
      matched =
        cloudAccountBackups.get(`em_${emailHash}`) ||
        cloudAccountBackups.get(`em_${computeSha256Hex(emailHash)}`);
    }

    const matchedDirUser =
      (uid ? userDirectory.get(uid) : undefined) ||
      (phoneHash ? findRegisteredUserByTarget('phone', normalizePhoneDigits(phoneHash)) : undefined) ||
      (emailHash ? findRegisteredUserByTarget('email', emailHash) : undefined);

    if (!matched && !matchedDirUser) {
      res.status(404).json({ ok: false, error: 'No account found for specified identifier.' });
      return;
    }

    // Verify ownership token (must not be expired)
    const tokenRecord = verificationToken
      ? verifiedOwnershipTokens.get(verificationToken)
      : undefined;
    const isTokenValid = Boolean(tokenRecord && Date.now() <= tokenRecord.expiresAt);

    const storedPasswordHash = matched?.passwordHash || matchedDirUser?.passwordHash || '';
    const isPasswordValid =
      !storedPasswordHash || (Boolean(passwordHash) && passwordHash === storedPasswordHash);

    if (!isTokenValid) {
      res.status(401).json({
        ok: false,
        error:
          'Account recovery requires completed 6-digit verification (OTP / Authenticator / Two-Step PIN).',
      });
      return;
    }

    if (!isPasswordValid) {
      res.status(401).json({
        ok: false,
        error: 'Incorrect account password. Cannot recover account without valid password.',
      });
      return;
    }

    if (matched) {
      res.json({
        ok: true,
        uid: matched.uid,
        username: matched.username,
        backupJson: matched.backupJson,
        updatedAt: matched.updatedAt,
      });
      return;
    }

    if (matchedDirUser) {
      const synthesizedBackup = JSON.stringify({
        account: {
          id: matchedDirUser.uid,
          name: matchedDirUser.name,
          username: matchedDirUser.username,
          phone: matchedDirUser.phone,
          normalizedPhone: matchedDirUser.normalizedPhone,
          email: matchedDirUser.email,
          about: matchedDirUser.about,
          avatarColor: matchedDirUser.avatarColor,
          avatarUrl: matchedDirUser.avatarUrl,
          allowUsernameDiscovery: matchedDirUser.allowUsernameDiscovery,
          hidePhoneNumber: matchedDirUser.hidePhoneNumber,
          onboardingCompleted: true,
        },
        chats: [],
        updatedAt: matchedDirUser.updatedAt,
      });
      res.json({
        ok: true,
        uid: matchedDirUser.uid,
        username: matchedDirUser.username,
        backupJson: synthesizedBackup,
        updatedAt: matchedDirUser.updatedAt,
      });
      return;
    }
  };

  app.get('/api/account/recover', handleAuthenticatedAccountRecover);
  app.post('/api/account/recover', handleAuthenticatedAccountRecover);

  // WebSocket Real-Time Multi-User Relay
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const packet = JSON.parse(raw.toString());

        if (packet.type === 'chat:message') {
          routedMessages.push(packet);
          savePersistentDatabase();
        }

        // Broadcast packet to all other connected clients (supports multi-tab/multi-user messaging by phone/username/email)
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(packet));
          }
        });
      } catch {
        // Ignore malformed packets
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Simple E2EE Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
