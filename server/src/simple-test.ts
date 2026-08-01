/**
 * 簡單測試 Firebase Admin SDK 能否初始化
 *
 * 用法 (PowerShell):
 *   cd D:\cc project\pumpmonitor-server
 *   npm install
 *   $env:FIREBASE_SERVICE_ACCOUNT_BASE64 = "<從 .env 抄過來的值>"
 *   npx tsx src/simple-test.ts
 */

import admin from 'firebase-admin';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
console.log('Firebase 是否設定:', b64 ? 'YES' : 'NO');

if (!b64) {
  console.log('請在 PowerShell 輸入:');
  console.log('$env:FIREBASE_SERVICE_ACCOUNT_BASE64 = "<your base64 json>"');
  process.exit(0);
}

try {
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  console.log('解碼後的 JSON 大小:', decoded.length, 'bytes');

  const account = JSON.parse(decoded);
  console.log('服務帳號 ID:', account.client_email);

  admin.initializeApp({
    credential: admin.credential.cert(account),
  });

  console.log('✅ Firebase Admin SDK 初始化成功！');

  // 測試 FCM
  admin.messaging().sendMulticast({
    tokens: [],
    message: { text: 'test' }
  }).then(() => {
    console.log('✅ FCM API 呼叫成功 (tokens 為空，所以不會發訊)');
    process.exit(0);
  }).catch((err) => {
    console.log('FCM API 呼叫結果:', err.message);
    process.exit(0);
  });

} catch (err: any) {
  console.log('❌ 初始化失敗:');
  console.log(String(err));
  process.exit(1);
}