// PMM Server - Express + FCM Polling

import express from 'express';
import cors from 'cors';
import type { PumpStationData, TideRecord, TideLogEntry, TideDirection } from './types';
import { fetchAllStations, fetchTideRecords, fetchWaterLevelHistory } from './api';
import { detectTideDirection, checkTideGate, detectTideOperationLog } from './algorithms';
import { initFirebase, sendFcmMessage, registerToken } from './fcm';
import { CONFIG } from './config';

const app = express();
const PORT = process.env.PORT || 8080;

// User token registry (in-memory — server restart 需要重新註冊)
const userTokens = new Map<string, string>();

// Middleware
app.use(cors());
app.use(express.json());

// 不需要驗證的簡易 API (之後可以加 Firebase Auth 中間件)

// ========================================
// API Routes
// ========================================

/** 取得所有站點最新資料 */
app.get('/api/stations', async (_req, res) => {
  try {
    const data = await fetchAllStations();
    res.json(data);
  } catch (err) {
    console.error('Error fetching stations:', err);
    res.status(500).json({ error: 'Failed to fetch station data' });
  }
});

/** 取得指定站點的潮汐記錄 */
app.get('/api/tide/:stationNo', async (req, res) => {
  try {
    const { stationNo } = req.params;
    const records = await fetchWaterLevelHistory(stationNo, CONFIG.TIDE_BUFFER_HOURS);
    res.json(records);
  } catch (err) {
    console.error('Error fetching tide records:', err);
    res.status(500).json({ error: 'Failed to fetch tide records' });
  }
});

/** 取得所有潮汐站的記錄 (供前端 summarize 使用) */
app.get('/api/tide', async (_req, res) => {
  try {
    const allTide = await fetchTideRecords(CONFIG.TIDE_BUFFER_HOURS);
    res.json(allTide);
  } catch (err) {
    console.error('Error fetching all tide records:', err);
    res.status(500).json({ error: 'Failed to fetch tide records' });
  }
});

/** 註冊 FCM token (由前端 App 呼叫) */
app.post('/api/register-fcm', (req, res) => {
  const { uid, token } = req.body;
  if (!uid || !token) {
    return res.status(400).json({ error: 'uid and token required' });
  }

  registerToken(uid, token);
  userTokens.set(uid, token);
  console.log(`Registered FCM token for ${uid}`);
  res.json({ success: true });
});

// ========================================
// Background Polling Logic
// ========================================

interface StationState {
  prevPumps: Record<number, string>;
  prevDoors: Record<number, string>;
  prevLevel: number | null;
  tideDirection: TideDirection;
  tideRecords: TideRecord[];
  lastAlarmStatus: Record<string, boolean>;
}

const stationStates = new Map<string, StationState>();

/** 主輪詢函式 - 這是核心邏輯 */
async function poll() {
  console.log(`[Poll] ${new Date().toISOString()}`);

  // 1. 取得所有站點資料
  const stations = await fetchAllStations();

  // 2. 取得潮汐記錄
  const tideRecords = await fetchTideRecords(CONFIG.TIDE_BUFFER_HOURS);

  // 3. 對每個站點檢查
  for (const station of stations) {
    const isNew = !stationStates.has(station.stationno);
    const prev = stationStates.get(station.stationno) ?? {
      prevPumps: {},
      prevDoors: {},
      prevLevel: null,
      tideDirection: 'slack',
      tideRecords: [],
      lastAlarmStatus: {},
    };

    // 首次出現的站點：只初始化狀態，不觸發警報
    if (isNew) {
      stationStates.set(station.stationno, prev);
      continue;
    }

    //  --- Water Level Alarm ---
    const threshold = CONFIG.DEFAULT_ALARM_LEVEL;
    const prevLevel = prev.prevLevel;
    const levelIn = station.level_in;
    const shouldWaterAlarm = levelIn !== null && levelIn > threshold && (
      prevLevel === null || levelIn >= prevLevel + 0.1
    );
    if (shouldWaterAlarm) {
      console.log(`[WaterAlarm] ${station.stationno}: level_in=${levelIn?.toFixed(2)}`);
      sendToAll(`水位警報 - ${station.stationName ?? station.stationno}`, `內水位 ${levelIn?.toFixed(2)}m 超過警戒值 ${threshold}m`, { station: station.stationno, type: 'water_level' });
    }

    // --- Pump/Door Change Detection ---
    for (const pump of station.pumps) {
      const prevPump = prev.prevPumps[pump.id];
      const curr = pump.status;
      if (prevPump === '0' && (curr === '1' || curr === '2' || curr === '3')) {
        console.log(`[Alarm] ${station.stationno}: Pump ${pump.id} START`);
        sendToAll(`機組啟動 - ${station.stationName ?? station.stationno}`, `#${pump.id} 抽水機啟動`, { station: station.stationno, type: 'pump_start', pumpId: String(pump.id) });
      } else if ((prevPump === '1' || prevPump === '2' || prevPump === '3') && curr === '0') {
        console.log(`[Alarm] ${station.stationno}: Pump ${pump.id} STOP`);
        sendToAll(`機組停止 - ${station.stationName ?? station.stationno}`, `#${pump.id} 抽水機停止`, { station: station.stationno, type: 'pump_stop', pumpId: String(pump.id) });
      }
    }

    for (const door of station.doors) {
      const prevDoor = prev.prevDoors[door.id];
      const curr = door.status;
      if (prevDoor !== undefined && prevDoor !== curr) {
        console.log(`[Alarm] ${station.stationno}: Door ${door.id} ${prevDoor}→${curr}`);
        sendToAll(`閘門變化 - ${station.stationName ?? station.stationno}`, `#${door.id} 閘門 ${prevDoor}→${curr}`, { station: station.stationno, type: 'door_change', doorId: String(door.id) });
      }
    }

    // --- Tide Detection ---
    const stationTideRecords = tideRecords[station.stationno] ?? [];

    // 更新 pump/door 狀態記錄（供下一輪比對）
    const newPumps: Record<number, string> = {};
    const newDoors: Record<number, string> = {};
    for (const pump of station.pumps) newPumps[pump.id] = pump.status;
    for (const door of station.doors) newDoors[door.id] = door.status;
    prev.prevPumps = newPumps;
    prev.prevDoors = newDoors;

    const newDirection = detectTideDirection(stationTideRecords, prev.tideDirection);

    if (prev.tideDirection !== newDirection && prev.tideDirection !== 'slack') {
      console.log(`[Tide] ${station.stationno}: ${prev.tideDirection} → ${newDirection}`);

      // 取得 gate action (開/關閉閘門)
      const gateCondition = checkTideGate(station.stationno, stationTideRecords);
      if (gateCondition) {
        console.log(`[TideGate] ${station.stationno}: ${gateCondition.action} - ${gateCondition.reason}`);

        sendToAll(
          `潮汐警報 - ${station.stationName ?? station.stationno}`,
          gateCondition.reason,
          { station: station.stationno, type: gateCondition.action === 'open' ? 'tide_open_gate' : 'tide_close_gate' }
        );
      }
    }

    // 更新狀態
    prev.tideDirection = newDirection;
    prev.tideRecords = stationTideRecords;
    prev.prevLevel = levelIn;

    stationStates.set(station.stationno, prev);
  }
}

// ========================================
// 定時器設定
// ========================================


/** 廣播 FCM 到所有已註冊使用者 */
async function sendToAll(title: string, body: string, data: Record<string, string>) {
  const uids = Array.from(userTokens.keys());
  if (uids.length === 0) {
    console.warn('[FCM] No registered users, skipping broadcast');
    return;
  }
  for (const uid of uids) {
    await sendFcmMessage(uid, title, body, data).catch(err =>
      console.error(`[FCM] Failed to send to ${uid}:`, err.message)
    );
  }
}

console.log('Starting server...');

// 初始化 Firebase (如果設定了金鑰)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  initFirebase();
} else {
  console.warn('No Firebase credentials - FCM disabled');
}

// 立即执行一次轮询
poll().catch(console.error);

// 每 30 秒輪詢一次（与前端一致）
setInterval(poll, CONFIG.POLL_INTERVAL_MS);

// ========================================
// 伺服器啟動
// ========================================

app.listen(PORT, () => {
  console.log(`PMM Server listening on port ${PORT}`);
});