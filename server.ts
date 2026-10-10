import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';

const PORT = 3000;

interface OtpChallengeRecord {
  channel: 'phone' | 'email';
  normalizedTarget: string;
  displayTarget: string;
  saltHex: string;
  codeHashHex: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
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
  email: string;
  about: string;
  avatarColor: string;
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

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

// Seeded Global Registered Users Directory (Findable by Phone Number, @username, or Email)
const INITIAL_DIRECTORY_USERS: DirectoryUserRecord[] = [
  {
    uid: 'usr_self_01',
    name: 'Alex Rivera',
    username: 'alex.rivera',
    phone: '+1 (415) 890-4319',
    normalizedPhone: '14158904319',
    email: 'alex@simple.privacy',
    about: 'Signal-grade encryption · Zero telemetry',
    avatarColor: '#10B981',
    identityFingerprint: 'A91C4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: Date.now(),
  },
  {
    uid: 'chat_elena',
    name: 'Dr. Elena Rostova',
    username: 'elena.sec',
    phone: '+41 44 580 12 90',
    normalizedPhone: '41445801290',
    email: 'elena@eth.ch',
    about: 'Cryptography Researcher · ETH Zürich',
    avatarColor: '#10B981',
    identityFingerprint: '8F4A2C91E0B73D55A19C4820F7D631E8B45A920C11E3D84076A5C291B0E4D73A',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: Date.now(),
  },
  {
    uid: 'chat_marcus',
    name: 'Marcus Vance',
    username: 'mvance.webrtc',
    phone: '+1 (415) 890-2211',
    normalizedPhone: '14158902211',
    email: 'marcus@simple.privacy',
    about: 'Real-time audio/video infrastructure',
    avatarColor: '#6366F1',
    identityFingerprint: '3B7E92A4C108D65F29E3B10487C5A2D9E0F143B876C2D591A4E0B38271C6D94F',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: Date.now(),
  },
  {
    uid: 'usr_sora',
    name: 'Sora Takahashi',
    username: 'sora.compose',
    phone: '+81 3-5555-0192',
    normalizedPhone: '81355550192',
    email: 'sora@android.jp',
    about: 'Jetpack Compose & Material 3 Lead',
    avatarColor: '#F59E0B',
    identityFingerprint: '9D4E2A17B6C83F512A9D04E7B3C618290F4E1D2C3B4A5908F4A2C91E0B73D55A',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: Date.now(),
  },
  {
    uid: 'usr_priya',
    name: 'Priya Sharma',
    username: 'priya.k',
    phone: '+91 98765 43210',
    normalizedPhone: '919876543210',
    email: 'priya@security.in',
    about: 'Zero-Knowledge Systems Architect',
    avatarColor: '#EC4899',
    identityFingerprint: '4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3A91C',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: true,
    lastSeen: 'Online',
    updatedAt: Date.now(),
  },
  {
    uid: 'usr_david',
    name: 'David Miller',
    username: 'david.m',
    phone: '+44 7700 900077',
    normalizedPhone: '447700900077',
    email: 'david@london.uk',
    about: 'Available on Simple E2EE',
    avatarColor: '#06B6D4',
    identityFingerprint: '71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3A91C4F82D03E',
    allowUsernameDiscovery: true,
    hidePhoneNumber: false,
    isOnline: false,
    lastSeen: 'Last seen 12m ago',
    updatedAt: Date.now(),
  },
];

const userDirectory = new Map<string, DirectoryUserRecord>();
INITIAL_DIRECTORY_USERS.forEach((u) => userDirectory.set(u.uid, u));

const encryptedBackups = new Map<string, EncryptedBackupBlob>();
const routedMessages: Array<Record<string, unknown>> = [];
const otpChallenges = new Map<string, OtpChallengeRecord>();
const verifiedOwnershipTokens = new Map<string, VerifiedOwnershipToken>();

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
    const apkPath = path.join(process.cwd(), 'Simple-Android.apk');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="Simple-Android.apk"');
    res.sendFile(apkPath);
  };

  app.get('/Simple-Android.apk', sendApkFile);
  app.get('/releases/Simple-v1.0.0.apk', sendApkFile);
  app.get('/api/download/apk', sendApkFile);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Simple Zero-Knowledge Relay & User Directory',
      telemetry: 'disabled',
      advertisingIds: 'none',
      plaintextStorage: false,
      otpAuthActive: true,
      activeConnections: wss.clients.size,
      registeredUsers: userDirectory.size,
    });
  });

  // ============================================================================
  // ACCOUNT OWNERSHIP OTP VERIFICATION SYSTEM (SMS Mobile Number & Email OTP)
  // ============================================================================
  app.post('/api/auth/request-otp', (req, res) => {
    const channel: 'phone' | 'email' = req.body.channel === 'email' ? 'email' : 'phone';
    const rawTarget = String(req.body.target || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);

    if (channel === 'phone' && normTarget.length < 7) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid mobile phone number (at least 7 digits) to receive an SMS OTP.',
      });
      return;
    }

    if (channel === 'email' && (!normTarget.includes('@') || !normTarget.includes('.'))) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid email address (e.g., name@domain.com) to receive an Email OTP.',
      });
      return;
    }

    const challengeKey = `${channel}:${normTarget}`;
    const existing = otpChallenges.get(challengeKey);
    // Prevent rapid OTP flooding (5 second minimum interval)
    if (existing && Date.now() - existing.createdAt < 4000) {
      res.status(429).json({
        ok: false,
        error: 'Please wait a few seconds before requesting another OTP code.',
      });
      return;
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const saltHex = crypto.randomBytes(16).toString('hex');
    const codeHashHex = hashOtpWithSalt(otpCode, saltHex);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    const record: OtpChallengeRecord = {
      channel,
      normalizedTarget: normTarget,
      displayTarget: rawTarget,
      saltHex,
      codeHashHex,
      expiresAt,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: 5,
    };

    otpChallenges.set(challengeKey, record);

    // Broadcast simulated Android SMS / Email gateway delivery event to connected client for testing
    const dispatchPayload = {
      type: 'auth:otp_dispatched',
      channel,
      target: rawTarget,
      normalizedTarget: normTarget,
      otpCode,
      expiresInSec: 300,
      timestamp: Date.now(),
    };

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(dispatchPayload));
      }
    });

    res.json({
      ok: true,
      channel,
      target: rawTarget,
      normalizedTarget: normTarget,
      expiresAt,
      expiresInSec: 300,
      // Delivered via local simulated SMS/Email gateway banner in sandbox environment
      sandboxDispatchedOtp: otpCode,
      message:
        channel === 'phone'
          ? `6-digit SMS verification code sent to ${rawTarget}`
          : `6-digit Email verification code sent to ${rawTarget}`,
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const channel: 'phone' | 'email' = req.body.channel === 'email' ? 'email' : 'phone';
    const rawTarget = String(req.body.target || '').trim();
    const code = String(req.body.code || '').trim();
    const normTarget = normalizeTargetForOtp(channel, rawTarget);
    const challengeKey = `${channel}:${normTarget}`;

    const record = otpChallenges.get(challengeKey);
    if (!record) {
      res.status(400).json({
        ok: false,
        error: `No active OTP request found for ${rawTarget}. Please click "Send OTP" first.`,
      });
      return;
    }

    if (Date.now() > record.expiresAt) {
      otpChallenges.delete(challengeKey);
      res.status(400).json({
        ok: false,
        error: 'This OTP code has expired (5-minute limit). Please request a new OTP.',
      });
      return;
    }

    record.attempts += 1;
    if (record.attempts > record.maxAttempts) {
      otpChallenges.delete(challengeKey);
      res.status(429).json({
        ok: false,
        error: 'Too many incorrect attempts. For security, please request a new OTP code.',
      });
      return;
    }

    const candidateHash = hashOtpWithSalt(code, record.saltHex);
    if (candidateHash !== record.codeHashHex) {
      const remaining = Math.max(0, record.maxAttempts - record.attempts);
      res.status(400).json({
        ok: false,
        error: `Invalid 6-digit OTP code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
      return;
    }

    // OTP Verified! Consume challenge and issue cryptographic ownership token
    otpChallenges.delete(challengeKey);
    const verificationToken = `vtok_${crypto.randomBytes(18).toString('hex')}`;
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
      verifiedAt: tokenRecord.verifiedAt,
    });
  });

  // Get all registered directory users
  app.get('/api/directory', (_req, res) => {
    res.json({
      users: Array.from(userDirectory.values()),
    });
  });

  // Register or update a user in the global directory (by phone, email, and username)
  app.post('/api/directory/register', (req, res) => {
    const {
      uid,
      name,
      username,
      phone,
      email,
      about,
      avatarColor,
      identityFingerprint,
      allowUsernameDiscovery,
      hidePhoneNumber,
    } = req.body;

    if (!uid || !phone) {
      res.status(400).json({ error: 'uid and phone are required' });
      return;
    }

    const normPhone = normalizePhoneDigits(String(phone));
    const cleanUsername = String(
      username ||
        (email ? String(email).split('@')[0] : '') ||
        `user.${normPhone.slice(-6)}`
    )
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9._-]/g, '');

    const record: DirectoryUserRecord = {
      uid: String(uid),
      name: String(name || cleanUsername),
      username: cleanUsername,
      phone: String(phone),
      normalizedPhone: normPhone,
      email: String(email || '').toLowerCase().trim(),
      about: String(about || 'Available on Simple E2EE'),
      avatarColor: String(avatarColor || '#10B981'),
      identityFingerprint: String(
        identityFingerprint ||
          'A91C4F82D03E71B46502C8E194F307A2D5B8E1C490F2A73816D4C90B2E5F81A3'
      ),
      allowUsernameDiscovery: allowUsernameDiscovery !== false,
      hidePhoneNumber: Boolean(hidePhoneNumber),
      isOnline: true,
      lastSeen: 'Online',
      updatedAt: Date.now(),
    };

    userDirectory.set(record.uid, record);

    // Broadcast updated user profile to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: 'directory:user_updated',
            user: record,
          })
        );
      }
    });

    res.json({ ok: true, user: record });
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

    const matches = Array.from(userDirectory.values()).filter((u) => {
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
    });

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

  // Persistent Account & Chats Backup Sync (Keyed by uid, phoneHash, and emailHash)
  const cloudAccountBackups = new Map<string, { uid: string; username: string; phoneHash?: string; emailHash?: string; backupJson: string; updatedAt: number }>();

  app.post('/api/account/backup', (req, res) => {
    const { uid, username, phoneHash, emailHash, backupJson } = req.body;
    if (!uid || !backupJson) {
      res.status(400).json({ ok: false, error: 'uid and backupJson are required' });
      return;
    }
    const record = {
      uid: String(uid),
      username: String(username || 'user'),
      phoneHash: phoneHash ? String(phoneHash) : undefined,
      emailHash: emailHash ? String(emailHash) : undefined,
      backupJson: String(backupJson),
      updatedAt: Date.now(),
    };
    cloudAccountBackups.set(record.uid, record);
    if (record.phoneHash) {
      cloudAccountBackups.set(`ph_${record.phoneHash}`, record);
    }
    if (record.emailHash) {
      cloudAccountBackups.set(`em_${record.emailHash}`, record);
    }
    res.json({ ok: true, updatedAt: record.updatedAt });
  });

  app.get('/api/account/recover', (req, res) => {
    const uid = req.query.uid ? String(req.query.uid) : '';
    const phoneHash = req.query.phoneHash ? String(req.query.phoneHash) : '';
    const emailHash = req.query.emailHash ? String(req.query.emailHash) : '';

    let matched = uid ? cloudAccountBackups.get(uid) : undefined;
    if (!matched && phoneHash) {
      matched = cloudAccountBackups.get(`ph_${phoneHash}`);
    }
    if (!matched && emailHash) {
      matched = cloudAccountBackups.get(`em_${emailHash}`);
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

    res.status(404).json({ ok: false, error: 'No account backup found for specified identifier.' });
  });

  // WebSocket Real-Time Multi-User Relay
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const packet = JSON.parse(raw.toString());

        if (packet.type === 'chat:message') {
          routedMessages.push(packet);
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
