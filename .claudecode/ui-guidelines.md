# UI 外觀規範

## 色彩系統

使用 Tailwind CSS class，禁止手寫任意色碼。

| Token | Tailwind Class | HEX | 用途 |
|-------|---------------|-----|------|
| Primary | `bg-blue-600` / `text-blue-600` | #2563EB | 按鈕、標題、主要操作 |
| Primary Hover | `bg-blue-700` | #1D4ED8 | 按鈕 hover |
| Background | `bg-gray-50` | #F9FAFB | 頁面底色 |
| Card | `bg-white` | #FFFFFF | 卡片底色 |
| Text Primary | `text-gray-900` | #111827 | 主要文字 |
| Text Secondary | `text-gray-500` | #6B7280 | 輔助文字 |
| Success | `text-green-600` | #16A34A | 正常運轉狀態 |
| Warning | `text-yellow-500` | #EAB308 | 警示狀態 |
| Danger | `text-red-600` / `bg-red-50` | #DC2626 | 警報狀態、水位超標 |
| Border | `border-gray-200` | #E5E7EB | 卡片邊框 |

## 排版

- 頁面標題：`text-xl font-bold`
- 站點名稱：`text-lg font-semibold`
- 數據數值：`text-2xl font-mono`（等寬字體易於閱讀數值）
- 輔助文字：`text-sm text-gray-500`

## 元件規範

### StationCard（站點卡片）
- 尺寸：`w-80` 固定寬度或 `min-w-[320px] flex-1`
- 背景：`bg-white rounded-xl shadow-sm border border-gray-200`
- 內距：`p-4`
- 滑鼠懸停：`hover:shadow-md transition-shadow duration-200`
- 警報時：邊框改為 `border-red-400 bg-red-50`

### WaterLevelBar（水位條）
- 橫條背景：`bg-gray-200 rounded-full h-4`
- 水位填充：`bg-blue-500 rounded-full h-4`（根據水位百分比動態寬度）
- 水位超標：`bg-red-500` + 左右搖晃動畫
- 警報標記線：垂直紅線 `border-l-2 border-red-600` 疊在條上

### PumpGrid（抽水機網格）
- 使用 `grid grid-cols-4 gap-2`
- 每個機組：圓形指示燈 `w-8 h-8 rounded-full`
- 正常（停止）：`bg-gray-300`
- 運轉中：`bg-green-500 animate-pulse`
- 不存在（null）：`bg-gray-100` 半透明

### DoorGrid（閘門網格）
- 使用 `flex flex-wrap gap-2`
- 每個閘門：
  - 開啟（"0"）：`bg-green-100 text-green-700 border-green-300`，圖示 ↑
  - 關閉（"1"）：`bg-gray-100 text-gray-700 border-gray-300`，圖示 ↓
  - 異常（"2"）：`bg-red-100 text-red-700 border-red-300`，圖示 ⚠
  - null：不渲染

### Header（頂部）
- `sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200`
- 左右排版：左側標題，右側操作按鈕組

### AlarmBanner（警報橫幅）
- `fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-3 font-bold`
- 閃爍動畫：`animate-pulse`
- 從頂部滑入：`animate-slideDown`
- 內容：🚨 警報！站點 XXX 內水位 X.XXm 超過警報值 X.XXm

## 響應式

| 斷點 | 範圍 | 卡片排列 |
|------|------|---------|
| 手機 | < 640px | 1 欄 |
| 平板 | 640~1023px | 2 欄 |
| 桌面 | 1024px+ | 3~4 欄 |

使用 Tailwind：`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`

## 微互動

- 按鈕點擊：`active:scale-95 transition-transform`
- 卡片 hover：`hover:shadow-md transition-shadow duration-200`
- 數據更新：數值變更時使用 `transition-all duration-500` 平滑過渡
- 重新整理按鈕旋轉：`animate-spin` < 1 秒
- 頁面切換：`transition-opacity duration-300`

## 動畫定義（Tailwind 擴充）

```js
// tailwind.config.js 追加
theme: {
  extend: {
    keyframes: {
      slideDown: {
        '0%': { transform: 'translateY(-100%)' },
        '100%': { transform: 'translateY(0)' },
      },
      shake: {
        '0%, 100%': { transform: 'translateX(0)' },
        '25%': { transform: 'translateX(-4px)' },
        '75%': { transform: 'translateX(4px)' },
      },
    },
    animation: {
      slideDown: 'slideDown 0.3s ease-out',
      shake: 'shake 0.3s ease-in-out infinite',
    },
  },
}
```

## 暗色模式（未來擴充預留）

- 暫時不實作暗色模式
- 所有色值使用 Tailwind 標準色，未來可透過 `dark:` prefix 快速切換