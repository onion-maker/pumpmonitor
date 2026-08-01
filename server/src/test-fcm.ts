// 測試 Firebase Admin SDK + FCM

import admin from 'firebase-admin';
import * as fs from 'fs';

console.log('=== Firebase Admin SDK 測試 ===\n');

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json';

console.log('Base64 設定:', b64 ? b64.substring(0, 50) + '...' : '未設定');
console.log('JSON 檔案路徑:', jsonPath);

try {
  let serviceAccount: any = null;

  // 方法 1: 從 base64
  if (b64 && b64.trim().length > 0) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      console.log('JSON 解碼後長度:', decoded.length, '字符');

      serviceAccount = JSON.parse(decoded);
      console.log('✅ JSON 解析成功');
    } catch (err: any) {
      console.error('❌ Base64 解析失敗:', err.message);

      // 顯示前 200 個字符做除錯
      console.log('\n--- 前 200 個字符 ---');
      console.log(b64.substring(0, 200));
      console.log('--- 結尾 200 個字符 ---');
      console.log(b64.substring(b64.length - 200));
    }
  }

  // 方法 2: 從檔案
  if (!serviceAccount && fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      console.log('✅ 從檔案讀取成功，內容長度:', content.length);

      serviceAccount = JSON.parse(content);

      if (serviceAccount.private_key) {
        // 修正：確保 private_key 有正確換行
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        console.log('✅ 已修正 private_key 換行');
      }
    } catch (err: any) {
      console.error('❌ 從檔案讀取失敗:', err.message);
    }
  }

  if (!serviceAccount) {
    console.log('\n❌ 沒有有效的服務帳號憑證');
    console.log('請確認:');
    console.log('  - FIREBASE_SERVICE_ACCOUNT_BASE64 已正確設定');
    console.log('  - 或 serviceAccountKey.json 在正確路徑');
    process.exit(1);
  }

  // 檢查關鍵欄位
  console.log('\n檢查服務帳號...');
  console.log('  Type:', serviceAccount.type);
  console.log('  Project ID:', serviceAccount.project_id);
  console.log('  Client Email:', serviceAccount.client_email);
  console.log('  Private Key 長度:', serviceAccount.private_key?.length || 0);

  // 初始化
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('\n✅ Firebase Admin SDK 初始化成功！');

    // 測試 FCM API
    admin.messaging().sendMulticast({
      tokens: [],
      message: { text: 'test' }
    }).then(() => {
      console.log('✅ FCM API 可用');
      process.exit(0);
    }).catch((err: any) => {
      console.log('⚠️ FCM API 回應:', err.message);
      process.exit(0);
    });

  } catch (initErr: any) {
    console.error('\n❌ 初始化失敗:', initErr.message);
    process.exit(1);
  }

} catch (err: any) {
  console.error('\n❌ 異常錯誤:', err.message);
  process.exit(1);
}