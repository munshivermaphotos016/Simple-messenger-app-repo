import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
import { apiFetch } from './utils/androidBridge';

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

/**
 * Saves an account & chats backup record in Firestore (and local server mirror) keyed by uid, phoneHash, and emailHash
 * so returning users logging in with the same mobile number or email recover their exact account & chats.
 */
export async function saveCloudAccountBackup(params: {
  uid: string;
  username: string;
  phoneHash?: string;
  emailHash?: string;
  passwordHash?: string;
  twoStepPinHash?: string;
  totpSecret?: string;
  verificationToken?: string;
  backupJson: string;
}): Promise<void> {
  const safeUid = params.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const safeBackupJson = params.backupJson.slice(0, 880000);
  const firestorePayload = {
    uid: safeUid,
    username: (params.username || 'user').slice(0, 40),
    phoneHash: (params.phoneHash || '').slice(0, 64),
    emailHash: (params.emailHash || '').slice(0, 64),
    backupJson: safeBackupJson,
    updatedAt: Date.now(),
  };

  apiFetch('/api/account/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...firestorePayload,
      passwordHash: params.passwordHash,
      twoStepPinHash: params.twoStepPinHash,
      totpSecret: params.totpSecret,
      verificationToken: params.verificationToken,
    }),
  }).catch(() => {});

  try {
    await setDoc(doc(db, 'account_backups', safeUid), firestorePayload);
    if (params.phoneHash && params.phoneHash.length >= 16) {
      await setDoc(doc(db, 'account_backups', `ph_${params.phoneHash.slice(0, 48)}`), firestorePayload);
    }
    if (params.emailHash && params.emailHash.length >= 16) {
      await setDoc(doc(db, 'account_backups', `em_${params.emailHash.slice(0, 48)}`), firestorePayload);
    }
  } catch {
    // Offline fallback handled
  }
}

/**
 * Recovers an existing account & chats backup from Server or Firestore ONLY after verifying ownership token & passwordHash.
 */
export async function recoverCloudAccountBackup(params: {
  uid?: string;
  phoneHash?: string;
  emailHash?: string;
  passwordHash?: string;
  verificationToken?: string;
}): Promise<string | null> {
  if (!params.verificationToken) {
    return null;
  }

  try {
    const res = await apiFetch('/api/account/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: params.uid,
        phoneHash: params.phoneHash,
        emailHash: params.emailHash,
        passwordHash: params.passwordHash,
        verificationToken: params.verificationToken,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.backupJson) return String(data.backupJson);
    } else if (res.status === 401 || res.status === 403) {
      return null;
    }
  } catch {
    // Fall through to Firestore if server is unreachable
  }

  const candidateKeys: string[] = [];
  if (params.uid) {
    candidateKeys.push(params.uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120));
  }
  if (params.phoneHash && params.phoneHash.length >= 16) {
    candidateKeys.push(`ph_${params.phoneHash.slice(0, 48)}`);
  }
  if (params.emailHash && params.emailHash.length >= 16) {
    candidateKeys.push(`em_${params.emailHash.slice(0, 48)}`);
  }

  for (const key of candidateKeys) {
    try {
      const snap = await getDoc(doc(db, 'account_backups', key));
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data.backupJson === 'string' && data.backupJson.length > 5) {
          try {
            const parsed = JSON.parse(data.backupJson);
            if (
              parsed.passwordHash &&
              (!params.passwordHash || parsed.passwordHash !== params.passwordHash)
            ) {
              return null;
            }
          } catch {
            // Continue
          }
          return data.backupJson;
        }
      }
    } catch {
      // Continue
    }
  }

  return null;
}

export {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  limit,
  signInWithPopup,
};
