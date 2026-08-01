// Firebase Cloud Messaging for server-side

import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

let initialized = false;
let app: admin.app.App | null = null;

/**
 * 初始化 Firebase Admin SDK
 * 支援兩種方式：
 * 1. 從 base64 編碼的 JSON 讀取 (FIREBASE_SERVICE_ACCOUNT_BASE64)
 * 2. 從檔案讀取 (FIREBASE_SERVICE_ACCOUNT_PATH, default: serviceAccountKey.json)
 */
export function initFirebase(): void {
  if (initialized) return;

  try {
    let serviceAccount: any = null;

    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json';

    if (b64 && b64.trim().length > 0) {
      // 從 base64 解碼 - 注意要處理換行和引號
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      try {
        serviceAccount = JSON.parse(decoded);
      } catch (parseErr) {
        console.error('Base64 decode/parse failed:', parseErr);
        console.warn('Trying from file...');
      }
    }

    // 備用：從檔案讀取
    if (!serviceAccount && fs.existsSync(jsonPath)) {
      console.log(`Reading from ${jsonPath}`);
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      serviceAccount = JSON.parse(jsonContent);
    }

    if (!serviceAccount) {
      console.warn('⚠️ No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_PATH');
      return;
    }

    // 關鍵檢查：是否有 private_key
    if (!serviceAccount.private_key || !serviceAccount.client_email) {
      console.error('Invalid service account JSON - missing private_key or client_email');
      return;
    }

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    initialized = true;
    console.log('✅ Firebase Admin SDK initialized');
    console.log('   Client email:', serviceAccount.client_email);

  } catch (err: any) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
  }
}

/** 檢查是否已初始化 */
export function isFirebaseInitialized(): boolean {
  return initialized;
}

// FCM Token store (in-memory, can be moved to Redis/Database)
const tokenStore = new Map<string, string>();

/** 註冊 FCM token */
export function registerToken(uid: string, token: string): void {
  tokenStore.set(uid, token);
  console.log(`📱 Registered FCM token for user ${uid}`);
}

/** 取得 FCM token */
export function getToken(uid: string): string | undefined {
  return tokenStore.get(uid);
}

/** 發送訊息給指定使用者 */
export async function sendFcmMessage(
  uid: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  if (!initialized || !app) {
    console.warn('Firebase not initialized, skipping FCM');
    return false;
  }

  const token = tokenStore.get(uid);
  if (!token) {
    console.warn(`No FCM token for user ${uid}`);
    return false;
  }

  try {
    const message: admin.messaging.Message = {
      token,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'alarm',
          sound: 'Default',
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ FCM sent to ${uid}: ${response}`);
    return true;

  } catch (err: any) {
    console.error(`❌ Failed to send FCM to ${uid}:`, err.message);
    return false;
  }
}

/** 廣播給全部 token */
export async function sendFcmToAll(
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ success: number; failure: number }> {
  if (!initialized || !app) return { success: 0, failure: 0 };

  const tokens = Array.from(tokenStore.values());
  if (tokens.length === 0) return { success: 0, failure: 0 };

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'alarm',
          sound: 'Default',
        },
      },
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`📊 FCM multicast: ${response.successCount} success, ${response.failureCount} failure`);
    return { success: response.successCount, failure: response.failureCount };

  } catch (err: any) {
    console.error('❌ FCM multicast failed:', err.message);
    return { success: 0, failure: tokens.length };
  }
}