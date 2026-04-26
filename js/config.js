/**
 * 配置檔案
 * 包含所有系統配置常數
 */

// Google Sheets 配置
// ⚠️ TODO（第二屆）：學員名單齊了之後，建立第二屆專屬的 Google Sheet，
// 並把以下三個 ID 換成第二屆的值。在那之前先暫用第一屆的 ID 作為佔位（儀錶板會顯示第一屆資料）。
// 切換步驟參考：第二屆_待辦清單.md
export const SHEET_ID = 'TODO_REPLACE_WITH_S2_SHEET_ID';
export const STATS_GID = 'TODO_REPLACE_WITH_S2_STATS_GID';
export const HIGHLIGHTS_GID = 'TODO_REPLACE_WITH_S2_HIGHLIGHTS_GID';

// CSV 匯出 URL
export const STATS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${STATS_GID}`;
export const HIGHLIGHTS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${HIGHLIGHTS_GID}`;

// 課程日期配置（以台灣時區 UTC+8 為準）
// 第二屆活動期間：2026/06/01（一）開營 - 2026/07/06（一）結營（共 5 週）
export const COURSE_START_DATE = new Date('2026-06-01T00:00:00+08:00');

// 正式模式：使用真實日期
// 注意：如果你有歷史測試資料需要查看，可以設定為特定日期來「時間旅行」
// 例如： export const TEST_TODAY_DATE = '2026-01-09';
export const TEST_TODAY_DATE = null; // null = 使用真實的今天日期（台灣時區）

/**
 * 取得台灣時區的當前時間
 * @returns {Date} 台灣時區的當前時間
 */
export function getTaiwanNow() {
    // 取得 UTC 時間，再加上台灣時區偏移（+8 小時）
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (8 * 60 * 60 * 1000));
}

/**
 * 取得台灣時區的今天日期（午夜 00:00:00 ）
 * 如果有設定 TEST_TODAY_DATE，則使用測試日期
 * @returns {Date} 台灣時區的今天午夜
 */
export function getTaiwanToday() {
    if (TEST_TODAY_DATE) {
        // 測試日期也以台灣時區解析
        return new Date(TEST_TODAY_DATE + 'T00:00:00+08:00');
    }
    const taiwanNow = getTaiwanNow();
    taiwanNow.setHours(0, 0, 0, 0);
    return taiwanNow;
}

// 緩存配置
export const CACHE_KEY_STATS = 'checkin_stats_cache';
export const CACHE_KEY_HIGHLIGHTS = 'checkin_highlights_cache';
export const CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘緩存

// 全局資料儲存
export const statsData = [];
export const highlightsData = [];

// 設置資料的函數
export function setStatsData(data) {
    statsData.length = 0;  // 清空現有數據
    statsData.push(...data);  // 添加新數據
}

export function setHighlightsData(data) {
    highlightsData.length = 0;  // 清空現有數據
    highlightsData.push(...data);  // 添加新數據
}
