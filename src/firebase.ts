import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  initializeFirestore,
  setLogLevel,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  apiFetch,
  createVerificationToken,
  verifyTotpCodeSync,
} from './utils/androidBridge';
import {
  computeEmailHash,
  computePhoneHash,
  deriveUidFromEmail,
  deriveUidFromPhone,
  normalizePhone,
} from './data/initialState';
import { ChatConversation, UserAccount } from './types/simple';

// Silence noisy internal WebChannel timeout logs when operating in offline/low-connectivity environments
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Use experimentalForceLongPolling so Firestore connects reliably across proxies, mobile networks, and sandboxed iframes
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  (firebaseConfig as Record<string, any>).firestoreDatabaseId || '(default)'
);

export const auth = getAuth(app);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));

// In-memory access token cache (never stored in localStorage/sessionStorage per security rules)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google Drive access token from Google Sign-In');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const signInWithGoogleForDrive = googleSignIn;

export interface DriveBackupFileMetadata {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

/**
 * Lists Simple Messenger backup files created by this app in the user's Google Drive.
 */
export async function listGoogleDriveBackups(
  accessToken: string
): Promise<DriveBackupFileMetadata[]> {
  const q = encodeURIComponent(
    "name contains 'Simple_Messenger_Backup' and trashed = false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive list failed (${res.status})`);
  }
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

/**
 * Uploads or updates a Simple Messenger backup JSON file in the user's Google Drive.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  backupPayloadJson: string,
  existingFileId?: string
): Promise<DriveBackupFileMetadata> {
  const metadata = {
    name: `Simple_Messenger_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    mimeType: 'application/json',
    description: 'Simple Private Messenger Full Account & Encrypted Chats Backup',
  };

  const boundary = '-------SimpleMessengerDriveBoundary314159';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    backupPayloadJson +
    closeDelim;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const res = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    throw new Error(`Google Drive upload failed (${res.status})`);
  }
  return (await res.json()) as DriveBackupFileMetadata;
}

/**
 * Downloads the JSON content of a Simple Messenger backup file from Google Drive.
 */
export async function downloadBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive download failed (${res.status})`);
  }
  return await res.text();
}

/**
 * Deletes a Simple Messenger backup file from Google Drive (requires explicit user confirmation first).
 */
export async function deleteBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive delete failed (${res.status})`);
  }
}


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const message = error instanceof Error ? error.message : String(error);

  // Gracefully ignore transient network / offline connectivity states so the app operates seamlessly offline
  if (
    message.includes('the client is offline') ||
    message.includes('Could not reach Cloud Firestore backend') ||
    message.includes('unavailable') ||
    message.includes('network-request-failed')
  ) {
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  if (
    message.includes('Missing or insufficient permissions') ||
    message.includes('permission-denied')
  ) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'directory', 'connection_check'));
  } catch (error) {
    // Allow automatic offline mode fallback without throwing a console.error when network latency is high
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.info('Firestore operating in offline-capable mode.');
    }
  }
}

testConnection();

function ensureSha256PhoneHash(phoneOrHash?: string): string {
  const raw = (phoneOrHash || '').trim();
  if (!raw) return '';
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return raw.toLowerCase();
  const digits = normalizePhone(raw);
  return digits.length >= 7 ? computePhoneHash(digits) : '';
}

function ensureSha256EmailHash(emailOrHash?: string): string {
  const raw = (emailOrHash || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return raw;
  return raw.includes('@') ? computeEmailHash(raw) : '';
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

/**
 * Checks whether an account with the given phone, email, or username exists in
 * Firebase Firestore (`account_backups` / `directory`), Local Device Mirror, or Express Server.
 * Never throws an unhandled exception even if the preview server is offline or behind a proxy.
 */
export async function checkAccountInDatabase(params: {
  phone?: string;
  email?: string;
  username?: string;
  mode?: 'register' | 'login' | 'check';
  passwordHash?: string;
  twoStepPinHash?: string;
}): Promise<{
  ok: boolean;
  exists: boolean;
  matchedBy?: string | null;
  username?: string | null;
  hasPassword?: boolean;
  hasTwoStepPin?: boolean;
  hasTotp?: boolean;
  totpSecret?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  accountSummary?: { username?: string | null; name?: string | null } | null;
  error?: string;
}> {
  const cleanPhone = normalizePhone(params.phone || '');
  const cleanEmail = (params.email || '').trim().toLowerCase();
  const phoneHash = cleanPhone.length >= 7 ? computePhoneHash(cleanPhone) : '';
  const emailHash = cleanEmail.includes('@') ? computeEmailHash(cleanEmail) : '';

  const firestoreKeys: { key: string; label: string }[] = [];
  if (phoneHash.length >= 16) {
    firestoreKeys.push({ key: `ph_${phoneHash.slice(0, 48)}`, label: 'phone number' });
    firestoreKeys.push({ key: deriveUidFromPhone(cleanPhone), label: 'phone number' });
  }
  if (emailHash.length >= 16) {
    firestoreKeys.push({ key: `em_${emailHash.slice(0, 48)}`, label: 'email address' });
    firestoreKeys.push({ key: deriveUidFromEmail(cleanEmail), label: 'email address' });
  }

  const parseBackupRecord = (data: Record<string, any>, label: string) => {
    if (!data || typeof data.backupJson !== 'string') return null;
    try {
      const parsed = JSON.parse(data.backupJson);
      const acct = parsed.account || parsed;
      const isCompleted =
        parsed.totpVerified === true ||
        parsed.onboardingCompleted === true ||
        acct?.onboardingCompleted === true;
      const storedPwdHash = parsed.passwordHash || acct?.passwordHash || '';
      const storedPinHash = parsed.twoStepPinHash || acct?.twoStepPinHash || '';
      const storedTotpSecret = parsed.totpSecret || acct?.totpSecret || '';
      const foundUsername = data.username || acct?.username || 'user';

      if (
        params.mode === 'register' &&
        !isCompleted &&
        params.passwordHash &&
        storedPwdHash === params.passwordHash
      ) {
        return {
          ok: true,
          exists: false,
          totpSecret: storedTotpSecret || undefined,
          matchedBy: null,
          username: foundUsername,
          accountSummary: null,
        };
      }

      if (!isCompleted && params.mode === 'register') {
        return null;
      }

      return {
        ok: true,
        exists: true,
        matchedBy: label,
        username: foundUsername,
        hasPassword: Boolean(storedPwdHash),
        hasTwoStepPin: Boolean(storedPinHash),
        hasTotp: Boolean(storedTotpSecret),
        totpSecret: params.mode === 'register' ? storedTotpSecret || undefined : undefined,
        passwordHash: storedPwdHash || undefined,
        twoStepPinHash: storedPinHash || undefined,
        accountSummary: {
          username: foundUsername,
          name: acct?.name || null,
        },
      };
    } catch {
      return null;
    }
  };

  // 1. Check local mirror immediately (0ms)
  try {
    const rawBackups = window.localStorage.getItem('simple_cloud_backups_mirror_v1');
    if (rawBackups) {
      const backups = JSON.parse(rawBackups);
      for (const item of firestoreKeys) {
        const localRec = backups[item.key];
        const res = localRec ? parseBackupRecord(localRec, item.label) : null;
        if (res && res.exists) {
          return res;
        }
      }
    }
  } catch {
    // Ignore
  }

  // 2. Run Firestore lookups in parallel with fast 1100ms timeout
  const snapshots = await Promise.all(
    firestoreKeys.map(async (item) => {
      const snap = await withTimeout(getDoc(doc(db, 'account_backups', item.key)), 1100, null);
      return { item, snap };
    })
  );

  for (const { item, snap } of snapshots) {
    if (snap && snap.exists()) {
      const parsedRes = parseBackupRecord(snap.data(), item.label);
      if (parsedRes) {
        return parsedRes;
      }
    }
  }

  // 3. Check Express / Local API fallback with fast timeout
  try {
    const res = await withTimeout(
      apiFetch('/api/account/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone || undefined,
          email: cleanEmail || undefined,
          username: params.username,
          mode: params.mode || 'check',
          passwordHash: params.passwordHash,
        }),
      }),
      1200,
      null
    );
    if (res) {
      const data = await res.json();
      if (data && typeof data.exists === 'boolean') {
        return {
          ok: true,
          exists: data.exists,
          matchedBy: data.matchedBy || null,
          username: data.username || data.accountSummary?.username || null,
          hasPassword: Boolean(data.hasPassword || data.accountSummary?.hasPassword),
          hasTwoStepPin: Boolean(data.hasTwoStepPin || data.accountSummary?.hasTwoStepPin),
          accountSummary:
            data.accountSummary || (data.username ? { username: data.username } : null),
        };
      }
    }
  } catch {
    // Safe fallback if offline
  }

  return {
    ok: true,
    exists: false,
    matchedBy: null,
    username: null,
    accountSummary: null,
  };
}

/**
 * Saves an account & chats backup record in Firestore (and local/server mirror) keyed by uid,
 * SHA-256 phoneHash, and SHA-256 emailHash so returning users logging in with the same mobile
 * number or email recover their exact account & chats across devices and APK updates.
 */
export async function saveCloudAccountBackup(params: {
  uid: string;
  username: string;
  phone?: string;
  email?: string;
  phoneHash?: string;
  emailHash?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  totpSecret?: string;
  verificationToken?: string;
  backupJson: string;
}): Promise<void> {
  const safeUid = (params.uid || `usr_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const resolvedPhoneHash = ensureSha256PhoneHash(params.phone || params.phoneHash);
  const resolvedEmailHash = ensureSha256EmailHash(params.email || params.emailHash);

  let enrichedBackupStr = params.backupJson;
  try {
    const parsed = JSON.parse(params.backupJson);
    const enriched = {
      ...parsed,
      passwordHash: params.passwordHash || parsed.passwordHash || parsed.account?.passwordHash,
      twoStepPinHash: params.twoStepPinHash || parsed.twoStepPinHash || parsed.account?.twoStepPinHash,
      totpSecret: params.totpSecret || parsed.totpSecret || parsed.account?.totpSecret,
      account: parsed.account
        ? {
            ...parsed.account,
            passwordHash: params.passwordHash || parsed.account.passwordHash || parsed.passwordHash,
            twoStepPinHash:
              params.twoStepPinHash || parsed.account.twoStepPinHash || parsed.twoStepPinHash,
            totpSecret: params.totpSecret || parsed.account.totpSecret || parsed.totpSecret,
          }
        : undefined,
    };
    enrichedBackupStr = JSON.stringify(enriched);
  } catch {
    // Keep original string if not JSON
  }

  const safeBackupJson = enrichedBackupStr.slice(0, 880000);
  const firestorePayload: Record<string, any> = {
    uid: safeUid,
    username: (params.username || 'user').slice(0, 40),
    backupJson: safeBackupJson,
    updatedAt: Date.now(),
  };
  if (resolvedPhoneHash) {
    firestorePayload.phoneHash = resolvedPhoneHash.slice(0, 64);
  }
  if (resolvedEmailHash) {
    firestorePayload.emailHash = resolvedEmailHash.slice(0, 64);
  }

  // 1. Mirror to localStorage immediately (0ms) for instant persistence
  try {
    const rawBackups = window.localStorage.getItem('simple_cloud_backups_mirror_v1');
    const backups = rawBackups ? JSON.parse(rawBackups) : {};
    const localEntry = {
      ...firestorePayload,
      normalizedPhone: normalizePhone(params.phone || params.phoneHash || ''),
      email: (params.email || params.emailHash || '').trim().toLowerCase(),
      passwordHash: params.passwordHash,
      twoStepPinHash: params.twoStepPinHash,
      totpSecret: params.totpSecret,
    };
    backups[safeUid] = localEntry;
    if (resolvedPhoneHash) backups[`ph_${resolvedPhoneHash.slice(0, 48)}`] = localEntry;
    if (resolvedEmailHash) backups[`em_${resolvedEmailHash.slice(0, 48)}`] = localEntry;
    window.localStorage.setItem('simple_cloud_backups_mirror_v1', JSON.stringify(backups));
  } catch {
    // Ignore storage quota
  }

  // 2. Mirror to Express backend asynchronously
  apiFetch('/api/account/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...firestorePayload,
      phoneHash: normalizePhone(params.phone || params.phoneHash || '') || resolvedPhoneHash,
      emailHash:
        (params.email || '').trim().toLowerCase() ||
        (params.emailHash?.includes('@') ? params.emailHash.trim().toLowerCase() : resolvedEmailHash),
      passwordHash: params.passwordHash,
      twoStepPinHash: params.twoStepPinHash,
      totpSecret: params.totpSecret,
      verificationToken: params.verificationToken,
    }),
  }).catch(() => {});

  // 3. Persist to Firestore in parallel with a non-blocking 750ms timeout so UI never hangs
  try {
    const writeTasks: Promise<unknown>[] = [
      withTimeout(setDoc(doc(db, 'account_backups', safeUid), firestorePayload), 750, undefined),
    ];
    if (resolvedPhoneHash && resolvedPhoneHash.length >= 16) {
      writeTasks.push(
        withTimeout(
          setDoc(doc(db, 'account_backups', `ph_${resolvedPhoneHash.slice(0, 48)}`), firestorePayload),
          750,
          undefined
        )
      );
    }
    if (resolvedEmailHash && resolvedEmailHash.length >= 16) {
      writeTasks.push(
        withTimeout(
          setDoc(doc(db, 'account_backups', `em_${resolvedEmailHash.slice(0, 48)}`), firestorePayload),
          750,
          undefined
        )
      );
    }
    await Promise.all(writeTasks);
  } catch {
    // Offline fallback handled automatically
  }
}

export interface RecoveredAccountBundle {
  backupJson: string;
  account?: Partial<UserAccount>;
  chats?: ChatConversation[];
}

export async function recoverCloudAccountBackup(params: {
  uid?: string;
  phone?: string;
  email?: string;
  phoneHash?: string;
  emailHash?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  verificationToken?: string;
}): Promise<RecoveredAccountBundle | null> {
  if (!params.verificationToken) {
    return null;
  }

  const rawPhone = normalizePhone(params.phone || params.phoneHash || '');
  const rawEmail = (params.email || params.emailHash || '').trim().toLowerCase();
  const shaPhoneHash = ensureSha256PhoneHash(params.phone || params.phoneHash);
  const shaEmailHash = ensureSha256EmailHash(params.email || params.emailHash);

  const parseAndVerifyBackup = (backupJsonStr: string): RecoveredAccountBundle | null => {
    try {
      const parsed = JSON.parse(backupJsonStr);
      const acct = parsed.account || parsed;
      const storedPwd = parsed.passwordHash || acct?.passwordHash || '';
      const storedPin = parsed.twoStepPinHash || acct?.twoStepPinHash || '';

      if (storedPwd || storedPin) {
        const pwdMatches = Boolean(params.passwordHash && storedPwd && params.passwordHash === storedPwd);
        const pinMatches = Boolean(params.twoStepPinHash && storedPin && params.twoStepPinHash === storedPin);
        if (!pwdMatches && !pinMatches) {
          return null;
        }
      }

      return {
        backupJson: backupJsonStr,
        account: acct,
        chats: Array.isArray(parsed.chats) ? parsed.chats : undefined,
      };
    } catch {
      return null;
    }
  };

  const candidateKeys: string[] = [];
  if (params.uid) {
    candidateKeys.push(params.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120));
  }
  if (shaPhoneHash.length >= 16) {
    candidateKeys.push(`ph_${shaPhoneHash.slice(0, 48)}`);
    if (rawPhone.length >= 7) candidateKeys.push(deriveUidFromPhone(rawPhone));
  }
  if (shaEmailHash.length >= 16) {
    candidateKeys.push(`em_${shaEmailHash.slice(0, 48)}`);
    if (rawEmail.includes('@')) candidateKeys.push(deriveUidFromEmail(rawEmail));
  }

  // 1. Check Local Mirror first (0ms)
  try {
    const rawBackups = window.localStorage.getItem('simple_cloud_backups_mirror_v1');
    if (rawBackups) {
      const backups = JSON.parse(rawBackups);
      for (const key of candidateKeys) {
        const entry = backups[key];
        if (entry && typeof entry.backupJson === 'string') {
          const verifiedBundle = parseAndVerifyBackup(entry.backupJson);
          if (verifiedBundle) return verifiedBundle;
        }
      }
    }
  } catch {
    // Continue
  }

  // 2. Check Firestore in parallel with fast 1100ms timeout
  const snaps = await Promise.all(
    candidateKeys.map((key) => withTimeout(getDoc(doc(db, 'account_backups', key)), 1100, null))
  );
  for (const snap of snaps) {
    if (snap && snap.exists()) {
      const data = snap.data();
      if (data && typeof data.backupJson === 'string' && data.backupJson.length > 5) {
        const verifiedBundle = parseAndVerifyBackup(data.backupJson);
        if (verifiedBundle) {
          return verifiedBundle;
        }
      }
    }
  }

  // 3. Check Express Server (`/api/account/recover`)
  try {
    const res = await withTimeout(
      apiFetch('/api/account/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: params.uid,
          phoneHash: rawPhone || shaPhoneHash,
          emailHash: rawEmail.includes('@') ? rawEmail : shaEmailHash,
          passwordHash: params.passwordHash,
          verificationToken: params.verificationToken,
        }),
      }),
      1200,
      null
    );
    if (res && res.ok) {
      const data = await res.json();
      if (data?.backupJson) {
        const verifiedBundle = parseAndVerifyBackup(String(data.backupJson));
        if (verifiedBundle) return verifiedBundle;
      }
    }
  } catch {
    // Offline fallback handled
  }

  return null;
}

export async function createPendingFirestoreAuthenticatorChallenge(params: {
  uid: string;
  username: string;
  name: string;
  phone?: string;
  email?: string;
  passwordHash: string;
  totpSecret: string;
}): Promise<void> {
  const safeUid = (params.uid || `usr_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const resolvedPhoneHash = ensureSha256PhoneHash(params.phone);
  const resolvedEmailHash = ensureSha256EmailHash(params.email);

  const challengeJson = JSON.stringify({
    version: '6.0.0',
    totpVerified: false,
    onboardingCompleted: false,
    passwordHash: params.passwordHash,
    totpSecret: params.totpSecret,
    createdAt: Date.now(),
    account: {
      id: safeUid,
      name: params.name,
      username: params.username,
      phone: params.phone || '',
      normalizedPhone: normalizePhone(params.phone || ''),
      email: (params.email || '').trim().toLowerCase(),
      passwordHash: params.passwordHash,
      totpSecret: params.totpSecret,
      onboardingCompleted: false,
    },
  });

  const firestorePayload: Record<string, any> = {
    uid: safeUid,
    username: (params.username || 'user').slice(0, 40),
    backupJson: challengeJson,
    updatedAt: Date.now(),
  };
  if (resolvedPhoneHash) firestorePayload.phoneHash = resolvedPhoneHash.slice(0, 64);
  if (resolvedEmailHash) firestorePayload.emailHash = resolvedEmailHash.slice(0, 64);

  // Mirror locally immediately (0ms)
  try {
    const rawBackups = window.localStorage.getItem('simple_cloud_backups_mirror_v1');
    const backups = rawBackups ? JSON.parse(rawBackups) : {};
    const localEntry = {
      ...firestorePayload,
      normalizedPhone: normalizePhone(params.phone || ''),
      email: (params.email || '').trim().toLowerCase(),
      passwordHash: params.passwordHash,
      totpSecret: params.totpSecret,
    };
    backups[safeUid] = localEntry;
    if (resolvedPhoneHash) backups[`ph_${resolvedPhoneHash.slice(0, 48)}`] = localEntry;
    if (resolvedEmailHash) backups[`em_${resolvedEmailHash.slice(0, 48)}`] = localEntry;
    window.localStorage.setItem('simple_cloud_backups_mirror_v1', JSON.stringify(backups));
  } catch {
    // Ignore storage quota
  }

  // Persist to Firestore in parallel with fast 700ms timeout
  try {
    const tasks: Promise<unknown>[] = [
      withTimeout(setDoc(doc(db, 'account_backups', safeUid), firestorePayload), 700, undefined),
    ];
    if (resolvedPhoneHash && resolvedPhoneHash.length >= 16) {
      tasks.push(
        withTimeout(
          setDoc(doc(db, 'account_backups', `ph_${resolvedPhoneHash.slice(0, 48)}`), firestorePayload),
          700,
          undefined
        )
      );
    }
    if (resolvedEmailHash && resolvedEmailHash.length >= 16) {
      tasks.push(
        withTimeout(
          setDoc(doc(db, 'account_backups', `em_${resolvedEmailHash.slice(0, 48)}`), firestorePayload),
          700,
          undefined
        )
      );
    }
    await Promise.all(tasks);
  } catch {
    // Offline fallback handled
  }
}

export async function verifyFirestoreAuthenticatorChallenge(params: {
  uid?: string;
  phone?: string;
  email?: string;
  passwordHash: string;
  code: string;
  mode: 'register' | 'login';
  expectedTotpSecret?: string;
}): Promise<{
  ok: boolean;
  verificationToken?: string;
  totpSecret?: string;
  recoveredBundle?: RecoveredAccountBundle | null;
  error?: string;
}> {
  const cleanCode = (params.code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: 'Please enter the 6-digit code from your Authenticator app.' };
  }

  const rawPhone = normalizePhone(params.phone || '');
  const rawEmail = (params.email || '').trim().toLowerCase();
  const shaPhoneHash = ensureSha256PhoneHash(rawPhone);
  const shaEmailHash = ensureSha256EmailHash(rawEmail);

  const candidateKeys: string[] = [];
  if (params.uid) {
    candidateKeys.push(params.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120));
  }
  if (shaPhoneHash.length >= 16) {
    candidateKeys.push(`ph_${shaPhoneHash.slice(0, 48)}`);
    if (rawPhone.length >= 7) candidateKeys.push(deriveUidFromPhone(rawPhone));
  }
  if (shaEmailHash.length >= 16) {
    candidateKeys.push(`em_${shaEmailHash.slice(0, 48)}`);
    if (rawEmail.includes('@')) candidateKeys.push(deriveUidFromEmail(rawEmail));
  }

  let dbRecordData: Record<string, any> | null = null;
  let matchedKey = '';

  // 1. Check local mirror first (0ms)
  try {
    const rawBackups = window.localStorage.getItem('simple_cloud_backups_mirror_v1');
    if (rawBackups) {
      const backups = JSON.parse(rawBackups);
      for (const key of candidateKeys) {
        if (backups[key] && typeof backups[key].backupJson === 'string') {
          dbRecordData = backups[key];
          matchedKey = key;
          break;
        }
      }
    }
  } catch {
    // Ignore
  }

  // 2. If not in local mirror, fetch from Firestore in parallel with fast 1100ms timeout
  if (!dbRecordData) {
    const snaps = await Promise.all(
      candidateKeys.map(async (key) => ({
        key,
        snap: await withTimeout(getDoc(doc(db, 'account_backups', key)), 1100, null),
      }))
    );
    for (const { key, snap } of snaps) {
      if (snap && snap.exists()) {
        const data = snap.data();
        if (data && typeof data.backupJson === 'string') {
          dbRecordData = data;
          matchedKey = key;
          break;
        }
      }
    }
  }

  if (!dbRecordData && params.mode === 'login') {
    return {
      ok: false,
      error: 'No account found for this phone number or email. Please check your details.',
    };
  }

  let storedPwdHash = '';
  let storedTotpSecret = '';
  let parsedBackup: any = null;

  if (dbRecordData && typeof dbRecordData.backupJson === 'string') {
    try {
      parsedBackup = JSON.parse(dbRecordData.backupJson);
      const acct = parsedBackup.account || parsedBackup;
      storedPwdHash = parsedBackup.passwordHash || acct?.passwordHash || '';
      storedTotpSecret = parsedBackup.totpSecret || acct?.totpSecret || '';
    } catch {
      parsedBackup = null;
    }
  }

  if (storedPwdHash && params.passwordHash && storedPwdHash !== params.passwordHash) {
    return {
      ok: false,
      error: 'Incorrect password for this account.',
    };
  }

  const secretToVerify = storedTotpSecret || params.expectedTotpSecret || '';
  if (!secretToVerify) {
    return {
      ok: false,
      error: 'No Authenticator key is linked to this account. Please verify by Mobile or Email OTP.',
    };
  }

  if (!verifyTotpCodeSync(secretToVerify, cleanCode)) {
    return {
      ok: false,
      error: 'Invalid 6-digit code. Please open your Authenticator app and enter the current code.',
    };
  }

  const vToken = createVerificationToken(rawPhone || rawEmail || matchedKey || 'verified');
  if (dbRecordData && parsedBackup) {
    try {
      parsedBackup.totpVerified = true;
      parsedBackup.lastVerifiedAt = Date.now();
      const updatedPayload = {
        ...dbRecordData,
        backupJson: JSON.stringify(parsedBackup),
        updatedAt: Date.now(),
      };
      if (matchedKey) {
        withTimeout(setDoc(doc(db, 'account_backups', matchedKey), updatedPayload), 700, undefined).catch(
          () => {}
        );
      }
    } catch {
      // Ignore
    }
  }

  return {
    ok: true,
    verificationToken: vToken,
    totpSecret: secretToVerify,
    recoveredBundle:
      parsedBackup && params.mode === 'login'
        ? {
            backupJson: JSON.stringify(parsedBackup),
            account: parsedBackup.account || parsedBackup,
            chats: Array.isArray(parsedBackup.chats) ? parsedBackup.chats : undefined,
          }
        : null,
  };
}

export {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  limit,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
};
export type { ConfirmationResult };
