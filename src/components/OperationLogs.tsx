import { useStore } from '../store/useStore';
import { STATION_NAMES } from '../config/stations';
import { useState } from 'react';

interface Props {}

export default function OperationLogs({}: Props) {
  const pumpLog = useStore((s) => s.pumpOperationLog);
  const gateLog = useStore((s) => s.gateOperationLog);
  const clearOperationLogs = useStore((s) => s.clearOperationLogs);
  const [activeTab, setActiveTab] = useState<'pump' | 'gate'>('pump');
  const [selectedStation, setSelectedStation] = useState<string>('all');

  const stations = Array.from(new Set(
    [...pumpLog.map(l => l.stationNo), ...gateLog.map(l => l.stationNo)]
  )).sort();

  const getStationName = (stationNo: string) => STATION_NAMES[stationNo] || stationNo;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-TW');
  };

  const handleClear = () => {
    if (window.confirm('確要清除所有操作紀錄嗎？')) {
      clearOperationLogs();
    }
  };

  const pumpLogFiltered = activeTab === 'pump'
    ? (selectedStation === 'all' ? pumpLog : pumpLog.filter(l => l.stationNo === selectedStation))
    : [];

  const gateLogFiltered = activeTab === 'gate'
    ? (selectedStation === 'all' ? gateLog : gateLog.filter(l => l.stationNo === selectedStation))
    : [];

  const activeLog = activeTab === 'pump' ? pumpLogFiltered : gateLogFiltered;

  return (
    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">操作紀錄</h2>
      
      {/* 篩選條件 */}
      <div className="flex items-center gap-2 mb-3">
        <select
          value={selectedStation}
          onChange={(e) => setSelectedStation(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-800"
        >
          <option value="all">全部站點</option>
          {stations.map(station => (
            <option key={station} value={station}>
              {getStationName(station)}
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-500 dark:text-gray-400">|</span>

        <button
          onClick={handleClear}
          className="text-xs text-red-500 hover:text-red-600"
        >
          清除紀錄
        </button>
      </div>

      {/* 選卡 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setActiveTab('pump')}
          className={`px-3 py-1 text-xs font-medium rounded ${
            activeTab === 'pump'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          抽水機紀錄
        </button>
        <button
          onClick={() => setActiveTab('gate')}
          className={`px-3 py-1 text-xs font-medium rounded ${
            activeTab === 'gate'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          閘門紀錄
        </button>
      </div>

      {/* 紀錄表格 */}
      {activeLog.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">暂无纪录</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs text-gray-600 dark:text-gray-400">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-2 py-1">时间</th>
                <th className="text-left px-2 py-1">站点</th>
                <th className="text-left px-2 py-1">设备编号</th>
                <th className="text-left px-2 py-1">动作</th>
              </tr>
            </thead>
            <tbody>
              {activeLog.map((log, index) => {
                const isPumpLog = 'pumpId' in log;
                const deviceId = isPumpLog ? log.pumpId : log.gateId.replace('door', '');
                const actionText = isPumpLog 
                  ? (log.action === 'start' ? '启动' : '停止')
                  : (log.action === 'open' ? '开启' : '关闭');
                
                return (
                  <tr 
                    key={`${log.stationNo}-${log.timestamp}-${index}`} 
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-2 py-1">{formatTime(log.timestamp)}</td>
                    <td className="px-2 py-1">{getStationName(log.stationNo)}</td>
                    <td className="px-2 py-1">#{deviceId}</td>
                    <td className="px-2 py-1">{actionText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
