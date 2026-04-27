/**
 * 資料處理模組
 * 負責 CSV 解析和資料載入
 */

import {
    STATS_CSV_URL,
    HIGHLIGHTS_CSV_URL,
    CACHE_KEY_STATS,
    CACHE_KEY_HIGHLIGHTS,
    statsData,
    highlightsData,
    setStatsData,
    setHighlightsData
} from './config.js';
import { getCachedData, setCachedData } from './cache.js';
import {
    renderStatsBanner,
    renderHeatmap,
    renderTodayCheckinStatus,
    renderLeaderboard,
    renderHighlights,
    populateStudentSelect,
    syncSectionHeights,
    calculateAllConsecutiveDays
} from './dashboard.js';

/**
 * 第二屆 表單回應 欄位 → 第一屆舊欄位順序的轉接器
 *
 * 第二屆新欄位（移除 Email + 是否完成 + 戰友 + 問題；萃取法移到第 3 題）：
 *   [0] 時間戳記 / [1] 姓名 / [2] 打卡日期 / [3] 萃取法 / [4] 一句話亮點 / [5] 文章
 *
 * dashboard.js 仍按第一屆舊欄位寫死索引，這個函式把每筆資料 remap 回舊位置：
 *   [0] 時間戳記 / [1] (Email 留空) / [2] 姓名（去掉編號-前綴）/ [3] 日期
 *   [4] 是否完成（固定填 'Yes！我已完成' 讓舊邏輯通過）/ [5] 亮點 / [6] 萃取法
 *   [7] 文章 / [8] (戰友留空) / [9] (問題留空)
 */
function remapHighlightRow(raw) {
    if (!raw || raw.length === 0) return raw;
    return [
        raw[0] || '',                                          // 時間戳記
        '',                                                     // (Email — 已移除)
        String(raw[1] || '').replace(/^\d+-/, '').trim(),      // 姓名（去前綴）
        raw[2] || '',                                          // 打卡日期
        'Yes！我已完成',                                        // 是否完成（恆為已完成）
        raw[4] || '',                                          // 一句話亮點
        raw[3] || '',                                          // 萃取法
        raw[5] || '',                                          // 文章
        '',                                                     // (戰友 — 已移除)
        ''                                                      // (問題 — 已移除)
    ];
}

/**
 * CSV 解析函數
 * @param {string} csv - CSV 原始字串
 * @returns {Array<Array<string>>} 解析後的二維陣列
 */
export function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        result.push(values);
    }

    return result;
}

/**
 * 載入資料（帶緩存優化）
 * @param {boolean} useCache - 是否使用緩存
 */
export async function loadData(useCache = true) {
    try {
        // 嘗試使用緩存
        if (useCache) {
            const cachedStats = getCachedData(CACHE_KEY_STATS);
            const cachedHighlights = getCachedData(CACHE_KEY_HIGHLIGHTS);

            if (cachedStats && cachedHighlights) {
                console.log('使用緩存資料');
                setStatsData(cachedStats);
                setHighlightsData(cachedHighlights);

                // 【前端即時計算】重新計算連續打卡天數
                calculateAllConsecutiveDays();

                renderStatsBanner();
                renderHeatmap();
                renderTodayCheckinStatus();
                renderLeaderboard();
                renderHighlights();
                populateStudentSelect();
                syncSectionHeights();
                return;
            }
        }

        // 從遠端載入資料（不使用快取時，加上 cache-busting 避免瀏覽器 HTTP 快取）
        console.log('從 Google Sheets 載入資料...');
        const fetchOptions = useCache ? {} : { cache: 'no-store' };
        const cacheBuster = useCache ? '' : `&_t=${Date.now()}`;
        const [statsResponse, highlightsResponse] = await Promise.all([
            fetch(STATS_CSV_URL + cacheBuster, fetchOptions),
            fetch(HIGHLIGHTS_CSV_URL + cacheBuster, fetchOptions)
        ]);

        const statsCSV = await statsResponse.text();
        const highlightsCSV = await highlightsResponse.text();

        const newStatsData = parseCSV(statsCSV);
        // 把第二屆的新欄位順序 remap 回舊順序，dashboard.js 才能繼續用既有索引
        const newHighlightsData = parseCSV(highlightsCSV).map(remapHighlightRow);

        setStatsData(newStatsData);
        setHighlightsData(newHighlightsData);

        // 儲存到緩存
        setCachedData(CACHE_KEY_STATS, newStatsData);
        setCachedData(CACHE_KEY_HIGHLIGHTS, newHighlightsData);

        // 【前端即時計算】重新計算連續打卡天數
        calculateAllConsecutiveDays();

        renderStatsBanner();
        renderHeatmap();
        renderTodayCheckinStatus();
        renderLeaderboard();
        renderHighlights();
        populateStudentSelect();
        syncSectionHeights();

    } catch (error) {
        console.error('載入資料失敗:', error);
        alert('載入資料失敗，請確認 Google Sheet 共用設定正確。');
    }
}
