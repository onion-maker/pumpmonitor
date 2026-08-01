// Server configuration

export const CONFIG = {
  // API Endpoints
  API_URL: process.env.HEOV_API_URL || 'https://heovcenter.gov.taipei',
  API_BACKUP_URL: process.env.HEOV_API_BACKUP_URL || 'https://heovcenter2.gov.taipei',

  // Firebase
  FIREBASE_SERVICE_ACCOUNT_BASE64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json',
  MESSAGING_SENDER_ID: process.env.MESSAGING_SENDER_ID || '884616750724',

  // Polling intervals (ms)
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10) as number,
  BACKGROUND_INTERVAL_MS: parseInt(process.env.BACKGROUND_INTERVAL_MS || '120000', 10) as number,

  // Tide buffer hours (4 hours as in original)
  TIDE_BUFFER_HOURS: parseInt(process.env.TIDE_BUFFER_HOURS || '4', 10) as number,

  // Max log entries to retain (500 as in original)
  MAX_LOG_ENTRIES: parseInt(process.env.MAX_LOG_ENTRIES || '500', 10) as number,

  // Tide stations
  TIDE_STATIONS: ['108', '110', '112'] as const,

  // Default alarm level (meters)
  DEFAULT_ALARM_LEVEL: 1.0,

  // Tide door columns per station
  TIDE_DOOR_COLS: {
    '112': ['door01', 'door02', 'door03', 'door04', 'door05'],
    '110': ['door01', 'door02', 'door03', 'door04'],
    '108': ['door01', 'door02', 'door03'],
  } as Record<string, string[]>,

  // Station names
  STATION_NAMES: {
    '101': '林森',
    '102': '長安',
    '103': '長春',
    '104': '民權',
    '105': '民生',
    '106': '錦州',
    '107': '圓山',
    '108': '中山(潮汐站)',
    '109': '中山擴',
    '110': '建國(潮汐站)',
    '111': '建國擴',
    '112': '新生(潮汐站)',
    '113': '新生擴',
    '114': '特一左',
    '115': '特一右',
  } as Record<string, string>,

  // Valid station numbers
  VALID_STATIONS: [
    '101', '102', '103', '104', '105', '106', '107',
    '108', '109', '110', '111', '112', '113', '114', '115'
  ] as string[],
};