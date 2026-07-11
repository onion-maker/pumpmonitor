/**
 * Firestore Session 管理
 *
 * 實現同一帳號同一時間只能在一台裝置登入：
 * 1. 登入時產生隨機 session ID，寫入 Firestore + localStorage
 * 2. 定時檢查 local session 跟 Firestore 是否一致
 * 3. 不一致代表被踢出 → 自動登出
 */

const SESSION_COLLECTION = 'userSessions';
const LOCAL_SESSION_KEY = 'pump-monitor-session';
const LOCAL_UID_KEY = 'pump-monitor-uid';

/** 產生隨機 session ID */
function generateSessionId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 取得 Firestore 連線 */
async function getFirestore() {
  const { getFirestore } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  return getFirestore(getApp());
}

// ── localStorage 操作 ──

function getLocalUid(): string | null {
  try {
    return localStorage.getItem(LOCAL_UID_KEY);
  } catch {
    return null;
  }
}

function getLocalSessionId(): string | null {
  try {
    return localStorage.getItem(LOCAL_SESSION_KEY);
  } catch {
    return null;
  }
}

function saveLocalSession(uid: string, sessionId: string): void {
  try {
    localStorage.setItem(LOCAL_UID_KEY, uid);
    localStorage.setItem(LOCAL_SESSION_KEY, sessionId);
  } catch {
    // localStorage 不可用，靜默忽略
  }
}

function removeLocalSession(): void {
  try {
    localStorage.removeItem(LOCAL_UID_KEY);
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // 靜默忽略
  }
}

// ── Firestore 操作 ──

/**
 * 登入成功後呼叫：建立 session
 * - 寫入 Firestore: users/{uid}/activeSession = sessionId
 * - 寫入 localStorage 暫存
 */
export async function createSession(uid: string): Promise<string> {
  const sessionId = generateSessionId();
  saveLocalSession(uid, sessionId);

  try {
    const db = await getFirestore();
    const { doc, setDoc } = await import('firebase/firestore');

    await setDoc(doc(db, SESSION_COLLECTION, uid), {
      activeSession: sessionId,
      lastLoginAt: new Date().toISOString(),
    });

    return sessionId;
  } catch (err) {
    // Firestore 不可用（尚未啟用），登入仍可繼續
    console.warn('Firestore session 寫入失敗（可能尚未啟用 Firestore）', err);
    return sessionId;
  }
}

/**
 * 檢查目前裝置的 session 是否仍有效
 * 回傳 true = 有效，false = 被踢出
 */
export async function validateSession(): Promise<boolean> {
  const uid = getLocalUid();
  const localSessionId = getLocalSessionId();
  if (!uid || !localSessionId) return true; // 無 session 資料，跳過檢查

  try {
    const db = await getFirestore();
    const { doc, getDoc } = await import('firebase/firestore');

    const snap = await getDoc(doc(db, SESSION_COLLECTION, uid));
    if (!snap.exists()) return true; // 還沒建立過 session，視為有效

    const remoteSessionId = snap.data().activeSession;
    return remoteSessionId === localSessionId;
  } catch (err) {
    // Firestore 不可用，跳過檢查
    console.warn('Firestore session 驗證失敗', err);
    return true;
  }
}

/**
 * 登出時呼叫：清除 Firestore 中的 session
 * （讓下次登入不會殘留舊 session）
 */
export async function clearSession(): Promise<void> {
  const uid = getLocalUid();
  removeLocalSession();
  if (!uid) return;

  try {
    const db = await getFirestore();
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, SESSION_COLLECTION, uid));
  } catch (err) {
    console.warn('Firestore session 清除失敗', err);
  }
}