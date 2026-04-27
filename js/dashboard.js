/**
 * Dashboard 業務邏輯模組
 * 包含所有統計、渲染和互動功能
 */

import {
    COURSE_START_DATE,
    TEST_TODAY_DATE,
    SHEET_ID,
    STATS_GID,
    HIGHLIGHTS_GID,
    statsData,
    highlightsData,
    getTaiwanToday,
    getTaiwanNow
} from './config.js';

// ============================================================================
// 表單欄位規格表（單一來源 / Single Source of Truth）
// 表單欄位順序若有調整，只需改這裡 + Apps Script Code.js 的對應常數。
// ============================================================================
const FORM_COLUMNS = {
    TIMESTAMP: 0,     // A 欄 - 時間戳記（系統自動）
    NAME: 1,          // B 欄 - 姓名（含「編號-」前綴）
    CHECKIN_DATE: 2,  // C 欄 - 打卡日期
    METHOD: 3,        // D 欄 - 萃取法
    HIGHLIGHT: 4,     // E 欄 - 今日一句話亮點（選填）
    ARTICLE: 5        // F 欄 - 今日這段寫的文章（選填）
};

// ============================================
// 前端計算連續打卡天數（即時計算，不依賴後端）
// ============================================

/**
 * 從 Form 回應的姓名欄位拆掉「編號-」前綴
 * Form 顯示「12-Zarah Hsu」（編號讓學員好找），dashboard 比對與顯示用乾淨姓名「Zarah Hsu」
 * @param {string} rawName - Form 原始姓名值
 * @returns {string} 去前綴後的姓名
 */
function getStudentName(rawName) {
    return String(rawName || '').replace(/^\d+-/, '').trim();
}

// 快取計算結果
let calculatedConsecutiveDays = new Map();
let calculatedTotalDays = new Map();

/**
 * 從 highlightsData 計算所有學員的最高連續打卡天數
 * 邏輯與後端 Google Apps Script 一致
 */
export function calculateAllConsecutiveDays() {
    console.log('=== 前端計算連續打卡天數開始 ===');

    const studentRecords = new Map();
    const today = getTaiwanToday();

    // 遍歷所有打卡記錄，建立每位學員的打卡日期 Set
    highlightsData.forEach(highlight => {
        const name = getStudentName(highlight[FORM_COLUMNS.NAME]);
        const dateValue = highlight[FORM_COLUMNS.CHECKIN_DATE];

        if (!name || !dateValue) return;

        if (!studentRecords.has(name)) {
            studentRecords.set(name, new Set());
        }

        // 將日期標準化為 YYYY-MM-DD 字串
        let normalizedDate = null;
        let dateObj = null;

        if (dateValue instanceof Date) {
            dateObj = new Date(dateValue);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            normalizedDate = `${year}-${month}-${day}`;
        } else if (typeof dateValue === 'string') {
            // 處理 "2026/1/27" 或 "2026/1/27 下午 9:52:45" 格式
            const datePart = dateValue.trim().split(' ')[0];
            const parts = datePart.split('/');

            if (parts.length === 3) {
                const year = parts[0];
                const month = parts[1].padStart(2, '0');
                const day = parts[2].padStart(2, '0');
                normalizedDate = `${year}-${month}-${day}`;
                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }
        }

        // 只計算課程開始日之後、今天或之前的打卡記錄
        if (normalizedDate && dateObj && dateObj >= COURSE_START_DATE && dateObj <= today) {
            studentRecords.get(name).add(normalizedDate);
        }
    });

    // 計算每位學員的累計打卡天數與最高連續打卡天數
    calculatedConsecutiveDays.clear();
    calculatedTotalDays.clear();

    studentRecords.forEach((dateSet, studentName) => {
        let maxConsecutiveDays = 0;

        if (dateSet.size > 0) {
            // 將日期字串轉換為 Date 物件並排序（從舊到新）
            const sortedDates = Array.from(dateSet)
                .map(dateStr => {
                    const parts = dateStr.split('-');
                    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                })
                .sort((a, b) => a - b);

            // 計算最高連續打卡天數
            maxConsecutiveDays = 1;
            let currentConsecutive = 1;

            for (let i = 1; i < sortedDates.length; i++) {
                const currentDate = new Date(sortedDates[i]);
                currentDate.setHours(0, 0, 0, 0);

                const previousDate = new Date(sortedDates[i - 1]);
                previousDate.setHours(0, 0, 0, 0);

                const diff = Math.floor((currentDate - previousDate) / (1000 * 60 * 60 * 24));

                if (diff === 1) {
                    currentConsecutive++;
                    maxConsecutiveDays = Math.max(maxConsecutiveDays, currentConsecutive);
                } else {
                    currentConsecutive = 1;
                }
            }
        }

        calculatedConsecutiveDays.set(studentName, maxConsecutiveDays);
        calculatedTotalDays.set(studentName, dateSet.size);
    });

    console.log(`前端計算完成：${calculatedConsecutiveDays.size} 位學員`);
    console.log('=== 前端計算連續打卡天數結束 ===');

    return calculatedConsecutiveDays;
}

/**
 * 取得指定學員的連續打卡天數（優先使用前端計算結果）
 * @param {string} studentName 學員姓名
 * @returns {number} 連續打卡天數
 */
export function getConsecutiveDays(studentName) {
    // 如果還沒計算過，先計算
    if (calculatedConsecutiveDays.size === 0) {
        calculateAllConsecutiveDays();
    }
    return calculatedConsecutiveDays.get(studentName) || 0;
}

/**
 * 取得指定學員的累計打卡天數（前端計算，只計算課程期間）
 * @param {string} studentName 學員姓名
 * @returns {number} 累計打卡天數
 */
export function getTotalDays(studentName) {
    if (calculatedTotalDays.size === 0) {
        calculateAllConsecutiveDays();
    }
    return calculatedTotalDays.get(studentName) || 0;
}

/**
 * 取得所有學員的連續打卡天數 Map
 * @returns {Map} studentName -> consecutiveDays
 */
export function getAllConsecutiveDays() {
    if (calculatedConsecutiveDays.size === 0) {
        calculateAllConsecutiveDays();
    }
    return calculatedConsecutiveDays;
}

// ============================================
// 渲染整體進度看板
// ============================================
export function renderStatsBanner() {
    const totalStudents = statsData.length;
    const checkedStudents = getTodayCheckedStudents();
    const todayCheckins = checkedStudents.length;
    const todayRate = totalStudents > 0 ? Math.round((todayCheckins / totalStudents) * 100) : 0;

    // 更新總學員數
    document.getElementById('totalStudents').textContent = totalStudents;

    // 更新目前時間
    updateDateTime();

    // 更新今日打卡狀況
    document.getElementById('todayCheckins').textContent = todayCheckins;
    document.getElementById('todayCheckinsTotal').textContent = totalStudents;
    document.getElementById('todayRateInline').textContent = todayRate;

    // 更新副標題摘要
    const summaryCheckins = document.getElementById('todayCheckinsSummary');
    const summaryRate = document.getElementById('todayRateSummary');
    if (summaryCheckins) summaryCheckins.textContent = todayCheckins;
    if (summaryRate) summaryRate.textContent = todayRate;

    // 更新進度條
    const progressBar = document.getElementById('todayProgress');
    progressBar.style.width = todayRate + '%';

    console.log(`Stats Banner: ${totalStudents} 位學員, 今日 ${todayCheckins} 人打卡 (${todayRate}%)`);
}

/**
 * 更新今日打卡倒數計時器
 * 計算距離今天午夜 12 點的剩餘時間
 * 使用瀏覽器本地時區
 */
export function updateDateTime() {
    updateCountdown();
    // 每秒更新一次倒數
    setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    // 使用台灣時區計算
    const now = getTaiwanNow();

    // 計算台灣時區的今天午夜 (明天 00:00:00)
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    // 計算剩餘毫秒數
    const remainingMs = midnight - now;

    // 轉換為時、分、秒
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

    // 格式化顯示
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const element = document.getElementById('countdownTimer');
    if (element) {
        element.textContent = timeString;

        // 根據剩餘時間調整樣式（最後 2 小時變紅色提醒）
        if (hours < 2) {
            element.classList.add('countdown-urgent');
        } else {
            element.classList.remove('countdown-urgent');
        }
    }
}

function getTodayCheckedStudents() {
    // 使用測試日期或真實日期
    const today = getTaiwanToday();
    today.setHours(0, 0, 0, 0);

    console.log('=== 今日打卡檢查開始 ===');
    console.log('今天的日期（timestamp）:', today.getTime(), '=', today.toLocaleDateString());
    if (TEST_TODAY_DATE) {
        console.log('⚠️ 測試模式：使用模擬日期');
    }

    const checkedStudents = new Set();

    highlightsData.forEach((highlight, index) => {
        if (!highlight[FORM_COLUMNS.CHECKIN_DATE] || !highlight[FORM_COLUMNS.NAME]) return;

        const originalDateStr = highlight[FORM_COLUMNS.CHECKIN_DATE];
        const studentName = getStudentName(highlight[FORM_COLUMNS.NAME]);

        // 處理 Google Sheets 的日期時間格式 (例如: "2026/1/9 下午 4:52:25")
        // 先提取空格前的日期部分
        const dateOnly = originalDateStr.trim().split(' ')[0];

        // 解析日期
        let highlightDate = new Date(dateOnly);

        // 如果解析失敗，嘗試其他格式
        if (isNaN(highlightDate.getTime())) {
            const parts = dateOnly.split(/[-/]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // YYYY-MM-DD 或 YYYY/M/D
                    highlightDate = new Date(parts[0], parts[1] - 1, parts[2]);
                } else {
                    // MM/DD/YYYY
                    highlightDate = new Date(parts[2], parts[0] - 1, parts[1]);
                }
            }
        }

        if (isNaN(highlightDate.getTime())) {
            if (index < 5) { // 只顯示前 5 筆，避免 console 太多
                console.warn(`[${index}] 無法解析日期: "${originalDateStr}"`);
            }
            return;
        }

        highlightDate.setHours(0, 0, 0, 0);

        // 顯示前 5 筆的比對結果
        if (index < 5) {
            console.log(`[${index}] ${studentName}: 原始="${originalDateStr}" → 解析後=${highlightDate.toLocaleDateString()} (${highlightDate.getTime()}) → 是今天？${highlightDate.getTime() === today.getTime()}`);
        }

        // 如果是今天，加入已打卡名單
        if (highlightDate.getTime() === today.getTime()) {
            checkedStudents.add(studentName);
        }
    });

    const result = Array.from(checkedStudents);
    console.log('今日已打卡學員:', result);
    console.log('=== 今日打卡檢查結束 ===\n');

    return result;
}

// ============================================
// 打卡熱力圖
// ============================================

/**
 * 計算指定日期的打卡率
 * @param {Date} date - 要計算的日期
 * @returns {Object} { count, total, rate }
 */
function getCheckinRateForDate(date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const totalStudents = statsData.length;
    let checkedCount = 0;

    // 統計該日期有多少人打卡（只計算「已完成」的記錄）
    highlightsData.forEach(highlight => {
        const dateValue = highlight[FORM_COLUMNS.CHECKIN_DATE];
        if (!dateValue) return;

        // 處理 Google Sheets 的日期時間格式
        const dateOnly = dateValue.trim().split(' ')[0];
        let highlightDate = new Date(dateOnly);

        if (isNaN(highlightDate.getTime())) {
            const parts = dateOnly.split(/[-/]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    highlightDate = new Date(parts[0], parts[1] - 1, parts[2]);
                } else {
                    highlightDate = new Date(parts[2], parts[0] - 1, parts[1]);
                }
            }
        }

        if (!isNaN(highlightDate.getTime())) {
            highlightDate.setHours(0, 0, 0, 0);
            if (highlightDate.getTime() === targetDate.getTime()) {
                checkedCount++;
            }
        }
    });

    const rate = totalStudents > 0 ? (checkedCount / totalStudents) * 100 : 0;
    return { count: checkedCount, total: totalStudents, rate: Math.round(rate) };
}

/**
 * 根據打卡率返回顏色等級
 * @param {number} rate - 打卡率 (0-100)
 * @returns {string} CSS class name
 */
function getHeatmapLevel(rate) {
    if (rate === 0) return 'level-0';
    if (rate <= 20) return 'level-0';
    if (rate <= 40) return 'level-1';
    if (rate <= 60) return 'level-2';
    if (rate <= 80) return 'level-3';
    return 'level-4';
}

/**
 * 渲染打卡熱力圖
 */
export function renderHeatmap() {
    const heatmapGrid = document.getElementById('heatmapGrid');
    const tooltip = document.getElementById('heatmapTooltip');

    const today = getTaiwanToday();
    today.setHours(0, 0, 0, 0);

    // 更新挑戰進度資訊
    const daysPassed = Math.floor((today - COURSE_START_DATE) / (1000 * 60 * 60 * 24)) + 1;
    const progressPercentage = Math.round((daysPassed / 35) * 100);

    document.getElementById('challengeCurrentDay').textContent = daysPassed;
    document.getElementById('challengeProgressFill').style.width = progressPercentage + '%';
    document.getElementById('challengePercentage').textContent = progressPercentage + '%';

    // 更新里程碑狀態
    const milestones = document.querySelectorAll('.milestone');
    milestones.forEach(milestone => {
        const milestoneDay = parseInt(milestone.dataset.day);
        if (daysPassed >= milestoneDay) {
            milestone.classList.add('achieved');
        } else {
            milestone.classList.remove('achieved');
        }
    });

    let html = '';

    // 生成 35 天的方格（從課程開始到今天，最多 35 天）
    for (let i = 0; i < 35; i++) {
        const date = new Date(COURSE_START_DATE);
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);

        const dayNumber = i + 1;
        const isFuture = date > today;

        if (isFuture) {
            // 未來日期
            html += `
                <div class="heatmap-cell future" data-day="${dayNumber}" data-date="${date.toISOString()}" data-future="true">
                    <span class="day-number">${dayNumber}</span>
                </div>
            `;
        } else {
            // 過去或今天的日期
            const stats = getCheckinRateForDate(date);
            const level = getHeatmapLevel(stats.rate);

            html += `
                <div class="heatmap-cell ${level}"
                     data-day="${dayNumber}"
                     data-date="${date.toISOString()}"
                     data-count="${stats.count}"
                     data-total="${stats.total}"
                     data-rate="${stats.rate}">
                    <span class="day-number">${dayNumber}</span>
                </div>
            `;
        }
    }

    heatmapGrid.innerHTML = html;

    // 加入 hover 和觸控事件
    const cells = heatmapGrid.querySelectorAll('.heatmap-cell');
    let currentOpenCell = null;

    const showTooltip = (cell) => {
        const isFuture = cell.dataset.future === 'true';
        if (isFuture) {
            tooltip.textContent = `第 ${cell.dataset.day} 天：尚未開始`;
        } else {
            const day = cell.dataset.day;
            const count = cell.dataset.count;
            const total = cell.dataset.total;
            const rate = cell.dataset.rate;
            tooltip.textContent = `第 ${day} 天：${count}/${total} 人打卡 (${rate}%)`;
        }

        // 定位 tooltip
        const rect = cell.getBoundingClientRect();
        tooltip.style.display = 'block';

        // 計算 tooltip 寬度和位置
        const tooltipWidth = tooltip.offsetWidth;
        const viewportWidth = window.innerWidth;
        const padding = 10; // 距離邊緣的最小距離

        // 計算水平位置（置中但不超出螢幕）
        let leftPos = rect.left + rect.width / 2 - tooltipWidth / 2;

        // 防止超出左邊界
        if (leftPos < padding) {
            leftPos = padding;
        }

        // 防止超出右邊界
        if (leftPos + tooltipWidth > viewportWidth - padding) {
            leftPos = viewportWidth - tooltipWidth - padding;
        }

        tooltip.style.left = leftPos + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + window.scrollY + 'px';
    };

    const hideTooltip = () => {
        tooltip.style.display = 'none';
        currentOpenCell = null;
    };

    cells.forEach(cell => {
        // 桌面版：hover 事件
        cell.addEventListener('mouseenter', (e) => {
            showTooltip(cell);
        });

        cell.addEventListener('mouseleave', () => {
            hideTooltip();
        });

        // 手機版：觸控事件
        cell.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (currentOpenCell === cell) {
                // 如果點擊同一個格子，關閉 tooltip
                hideTooltip();
            } else {
                // 否則顯示 tooltip
                showTooltip(cell);
                currentOpenCell = cell;
            }
        });
    });

    // 點擊其他地方關閉 tooltip
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.heatmap-cell') && !e.target.closest('.heatmap-tooltip')) {
            hideTooltip();
        }
    });

    console.log('熱力圖已渲染：35 天');
}

// ============================================
// 渲染今日打卡動態
// ============================================
export function renderTodayCheckinStatus() {
    const allStudents = statsData.map(s => s[0]); // 所有學員名單
    const checkedStudents = getTodayCheckedStudents(); // 今日已打卡
    const uncheckedStudents = allStudents.filter(name => !checkedStudents.includes(name)); // 未打卡

    // 更新統計數字
    document.getElementById('todayCheckedCount').textContent = checkedStudents.length;
    document.getElementById('todayUncheckedCount').textContent = uncheckedStudents.length;
    document.getElementById('checkedListCount').textContent = checkedStudents.length;
    document.getElementById('uncheckedListCount').textContent = uncheckedStudents.length;

    // 渲染已打卡學員
    const checkedContainer = document.getElementById('checkedStudents');
    let checkedHTML = '';
    checkedStudents.forEach(name => {
        checkedHTML += `
            <div class="student-avatar checked">
                <div class="emoji">✅</div>
                <div>${name}</div>
            </div>
        `;
    });
    checkedContainer.innerHTML = checkedHTML || '<div style="text-align: center; padding: 20px; color: #999;">還沒有人打卡</div>';

    // 渲染未打卡學員
    const uncheckedContainer = document.getElementById('uncheckedStudents');
    let uncheckedHTML = '';
    uncheckedStudents.forEach(name => {
        uncheckedHTML += `
            <div class="student-avatar unchecked">
                <div class="emoji">⏸️</div>
                <div>${name}</div>
            </div>
        `;
    });
    uncheckedContainer.innerHTML = uncheckedHTML || '<div style="text-align: center; padding: 20px; color: #999;">全部都打卡了！🎉</div>';

    console.log(`今日打卡動態: 已打卡 ${checkedStudents.length} 人，未打卡 ${uncheckedStudents.length} 人`);
}

// ============================================
// 切換學員列表顯示（修復版：透明度問題已解決）
// ============================================
export function toggleStudentList() {
    const container = document.getElementById('studentAvatarsContainer');
    const icon = document.getElementById('toggleIcon');
    const buttonText = document.getElementById('toggleText');

    // 檢查必要元素是否存在
    if (!container || !icon || !buttonText) {
        console.error('toggleStudentList: 找不到必要的 DOM 元素');
        return;
    }

    if (container.style.display === 'none' || !container.style.display) {
        // 展開前先確保內容已渲染
        renderTodayCheckinStatus();

        // 展開 - 明確設定所有必要屬性（修復透明度問題）
        container.style.display = 'block';
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
        icon.textContent = '▲';
        buttonText.textContent = '收起學員列表';

        // 平滑滾動到容器
        setTimeout(() => {
            container.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }, 100);
    } else {
        // 收起 - 使用動畫效果
        container.style.opacity = '0';
        container.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            container.style.display = 'none';
        }, 300);

        icon.textContent = '▼';
        buttonText.textContent = '查看學員列表';
    }
}

// ============================================
// 全域刷新按鈕（頂部資訊列）
// ============================================
let globalRefreshCooldown = false;

window.globalRefreshData = async function() {
    const { loadData } = await import('./data.js');
    const button = document.getElementById('globalRefreshBtn');
    const textSpan = button.querySelector('.refresh-text');

    // 如果正在冷卻中，不執行
    if (globalRefreshCooldown) {
        return;
    }

    // 開始冷卻
    globalRefreshCooldown = true;
    button.disabled = true;
    button.classList.add('refreshing');

    try {
        textSpan.textContent = '刷新中...';

        // 強制從遠端載入（跳過快取）
        await loadData(false);

        // 如果目前有選中學員，重新渲染個人快覽
        const select = document.getElementById('overviewStudentSelect');
        if (select && select.value) {
            updatePersonalOverview();
        }

        // 顯示完成狀態
        textSpan.textContent = '已更新！';
        button.classList.remove('refreshing');
        button.classList.add('success');

        // 3 秒後恢復
        setTimeout(() => {
            button.classList.remove('success');
            textSpan.textContent = '手動刷新';
            button.disabled = false;
            globalRefreshCooldown = false;
        }, 3000);

    } catch (error) {
        console.error('刷新失敗:', error);
        textSpan.textContent = '刷新失敗';
        button.classList.remove('refreshing');

        // 3 秒後恢復
        setTimeout(() => {
            textSpan.textContent = '手動刷新';
            button.disabled = false;
            globalRefreshCooldown = false;
        }, 3000);
    }
};

// ============================================
// 立即刷新今日打卡狀態（改善版：防濫用機制）
// ============================================
let refreshCooldown = false;
let cooldownTimer = null;

export async function refreshTodayStatus() {
    const { loadData } = await import('./data.js');
    const button = document.querySelector('.refresh-button-compact');

    // 如果正在冷卻中，不執行
    if (refreshCooldown) {
        return;
    }

    // 開始冷卻
    refreshCooldown = true;
    button.disabled = true;
    button.classList.add('refreshing');

    try {
        // 顯示刷新中
        button.textContent = '⏳ 刷新中...';

        // 強制從遠端載入
        await loadData(false);

        // 顯示完成狀態
        button.textContent = '✅ 刷新完成';
        button.classList.remove('refreshing');
        button.classList.add('success');

        // 2 秒後開始倒數
        setTimeout(() => {
            button.classList.remove('success');
            startCooldown(button, 10); // 10 秒冷卻
        }, 2000);

    } catch (error) {
        console.error('刷新失敗:', error);
        button.textContent = '❌ 刷新失敗';
        button.classList.remove('refreshing');
        button.classList.add('error');

        // 2 秒後開始倒數（失敗也要冷卻）
        setTimeout(() => {
            button.classList.remove('error');
            startCooldown(button, 5); // 失敗時較短的冷卻時間
        }, 2000);
    }
}

/**
 * 開始冷卻倒數
 * @param {HTMLElement} button - 按鈕元素
 * @param {number} seconds - 冷卻秒數
 */
function startCooldown(button, seconds) {
    let remaining = seconds;

    // 清除舊的計時器（如果有）
    if (cooldownTimer) {
        clearInterval(cooldownTimer);
    }

    // 更新按鈕文字
    const updateButton = () => {
        button.textContent = `⏰ 請稍候 ${remaining} 秒`;
    };

    updateButton();

    // 每秒更新
    cooldownTimer = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
            clearInterval(cooldownTimer);
            cooldownTimer = null;
            refreshCooldown = false;
            button.disabled = false;
            button.textContent = '🔄 立即刷新';
        } else {
            updateButton();
        }
    }, 1000);
}

// ============================================
// 渲染打卡旅程榜（等級制，依累計天數）
// ============================================

// 等級定義（依累計打卡天數分級，斷掉一兩次也能繼續累積）
const JOURNEY_TIERS = [
    { emoji: '🏆', name: '完美旅程', min: 35, max: 999, description: '累計 35 天' },
    { emoji: '🏔️', name: '登峰在望', min: 28, max: 34, description: '累計 28-34 天' },
    { emoji: '🧗', name: '穩健攀登', min: 21, max: 27, description: '累計 21-27 天' },
    { emoji: '🥾', name: '步履不停', min: 14, max: 20, description: '累計 14-20 天' },
    { emoji: '🚶', name: '踏上旅途', min: 7, max: 13, description: '累計 7-13 天' },
    { emoji: '🎒', name: '整裝待發', min: 1, max: 6, description: '累計 1-6 天' }
];

export function renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.classList.remove('loading');

    // 【前端即時計算】重新計算所有學員的累計與連續打卡天數
    calculateAllConsecutiveDays();

    // 將學員依等級分組
    const tierGroups = JOURNEY_TIERS.map(tier => ({
        ...tier,
        students: []
    }));

    // 遍歷所有學員，分配到對應等級（依累計天數）
    statsData.forEach(student => {
        const name = student[0];
        const totalDays = getTotalDays(name);

        // 找到對應的等級
        for (const tierGroup of tierGroups) {
            if (totalDays >= tierGroup.min && totalDays <= tierGroup.max) {
                tierGroup.students.push({ name, days: totalDays });
                break;
            }
        }
    });

    // 生成 HTML
    let html = '';
    const maxNamesToShow = 5; // 每個等級最多顯示幾個名字

    tierGroups.forEach(tier => {
        const isEmpty = tier.students.length === 0;

        // 同等級內按姓名排序
        if (!isEmpty) {
            tier.students.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
        }

        // 取得要顯示的名字
        const displayNames = tier.students.slice(0, maxNamesToShow).map(s => s.name);
        const remainingCount = tier.students.length - maxNamesToShow;

        // 名字顯示
        let namesHTML = '';
        if (isEmpty) {
            namesHTML = '尚無挑戰者';
        } else {
            namesHTML = displayNames.join('、');
            if (remainingCount > 0) {
                namesHTML += ` ... 等 ${tier.students.length} 人`;
            }
        }

        // 人數顯示
        const countHTML = isEmpty ? '-' : `${tier.students.length} 人`;

        html += `
            <div class="tier-group ${isEmpty ? 'tier-empty-state' : ''}">
                <div class="tier-header">
                    <span class="tier-emoji">${tier.emoji}</span>
                    <span class="tier-name">${tier.name}</span>
                    <span class="tier-condition">${tier.description}</span>
                    <span class="tier-count">${countHTML}</span>
                </div>
                <div class="tier-students">${namesHTML}</div>
            </div>
        `;
    });

    leaderboardList.innerHTML = html;
}

function getMilestones(student) {
    const milestones = [
        { col: 4, days: 7, icon: '🥉' },
        { col: 5, days: 14, icon: '🥈' },
        { col: 6, days: 21, icon: '🥇' },
        { col: 7, days: 35, icon: '🏆' }
    ];

    const achieved = milestones
        .filter(m => student[m.col] === '🏆')
        .map(m => `${m.icon}${m.days}天`)
        .join(' ');

    return achieved ? `🎖️ 連續打卡里程碑 ${achieved}` : '🎖️ 連續打卡里程碑 尚未解鎖';
}

// ============================================
// 生成文章區塊的 HTML（自動將 URL 轉為連結，超過 100 字可展開/收起）
// ============================================

/**
 * 輔助函數：將文字中的 URL 轉為可點擊的超連結
 */
function linkifyText(text) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" class="article-inline-link">$1</a>');
}

function generateArticleHTML(article, index) {
    if (!article || article.trim() === '') {
        return '';  // 沒有文章，不顯示
    }

    const trimmedArticle = article.trim();
    const uniqueId = `article-${index}`;

    // 將文字中的 URL 轉為可點擊的連結
    const linkedArticle = linkifyText(trimmedArticle);

    // 一律使用 Toggle 模式，預設收合
    return `
        <div class="highlight-article">
            <div class="article-label-with-toggle">
                <span class="article-label">📝 今日文章</span>
                <button class="article-toggle-button-compact" onclick="toggleArticle('${uniqueId}')">
                    <span id="${uniqueId}-toggle-text">展開</span> <span id="${uniqueId}-toggle-icon">▼</span>
                </button>
            </div>
            <div class="article-text-container" id="${uniqueId}-content" style="display: none;">
                <div class="article-text-full">${linkedArticle}</div>
            </div>
        </div>
    `;
}

// ============================================
// 切換文章展開/收起
// ============================================
export function toggleArticle(uniqueId) {
    const content = document.getElementById(`${uniqueId}-content`);
    const toggleText = document.getElementById(`${uniqueId}-toggle-text`);
    const toggleIcon = document.getElementById(`${uniqueId}-toggle-icon`);

    if (content.style.display === 'none') {
        // 展開
        content.style.display = 'block';
        toggleText.textContent = '收起';
        toggleIcon.textContent = '▲';
    } else {
        // 收起
        content.style.display = 'none';
        toggleText.textContent = '展開';
        toggleIcon.textContent = '▼';
    }
}

// ============================================
// 渲染每日亮點牆（只顯示今天）
// ============================================
export function renderHighlights() {
    const highlightsList = document.getElementById('highlightsList');
    highlightsList.classList.remove('loading');

    // 取得今天的日期（不含時間）
    const today = getTaiwanToday();
    today.setHours(0, 0, 0, 0);

    // 過濾出今天的亮點
    const todayHighlights = highlightsData.filter(highlight => {
        if (!highlight[FORM_COLUMNS.CHECKIN_DATE]) return false;

        // 處理 Google Sheets 的日期時間格式 (例如: "2026/1/9 下午 4:52:25")
        const dateOnly = highlight[FORM_COLUMNS.CHECKIN_DATE].trim().split(' ')[0];

        // 解析日期
        let highlightDate = new Date(dateOnly);

        // 如果解析失敗，嘗試其他格式
        if (isNaN(highlightDate.getTime())) {
            const parts = dateOnly.split(/[-/]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // YYYY-MM-DD 或 YYYY/M/D
                    highlightDate = new Date(parts[0], parts[1] - 1, parts[2]);
                } else {
                    // MM/DD/YYYY
                    highlightDate = new Date(parts[2], parts[0] - 1, parts[1]);
                }
            }
        }

        // 如果還是無效，跳過
        if (isNaN(highlightDate.getTime())) {
            return false;
        }

        highlightDate.setHours(0, 0, 0, 0);

        // 只返回今天的
        return highlightDate.getTime() === today.getTime();
    });

    console.log(`今日亮點: ${todayHighlights.length} 筆 (總共 ${highlightsData.length} 筆)`);

    let html = '';

    if (todayHighlights.length === 0) {
        html = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 48px; margin-bottom: 20px;">📝</div>
                <div style="font-size: 22px; font-weight: 700; margin-bottom: 10px;">今天還沒有同學分享亮點</div>
                <div style="font-size: 18px;">成為第一個分享的人吧！</div>
            </div>
        `;
    } else {
        todayHighlights.forEach((highlight, index) => {
            const name = getStudentName(highlight[FORM_COLUMNS.NAME]);
            const dateStr = highlight[FORM_COLUMNS.CHECKIN_DATE];
            const method = highlight[FORM_COLUMNS.METHOD];
            const content = highlight[FORM_COLUMNS.HIGHLIGHT];
            const article = highlight[FORM_COLUMNS.ARTICLE];

            const date = formatDate(dateStr);
            const articleHTML = generateArticleHTML(article, index);

            html += `
                <div class="highlight-card">
                    <div class="highlight-header">
                        <div class="highlight-name">${name}</div>
                        <div class="highlight-date">${date}</div>
                    </div>
                    ${content ? `<div class="highlight-content">💡 ${content}</div>` : ''}
                    ${method ? `<span class="highlight-method">${method}</span>` : ''}
                    ${articleHTML}
                </div>
            `;
        });

        // 顯示今日統計
        html += `
            <div style="text-align: center; padding: 30px; color: #666; font-size: 18px; font-weight: 700; border-top: 3px dashed #E0E0E0; margin-top: 20px;">
                🎉 今日共有 ${todayHighlights.length} 位同學分享了亮點
            </div>
        `;
    }

    highlightsList.innerHTML = html;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';

    // 處理 Google Sheets 的日期時間格式 (例如: "2026/1/9 下午 4:52:25")
    // 先提取空格前的日期部分
    const dateOnly = dateStr.trim().split(' ')[0];

    // 嘗試解析不同的日期格式
    let date = new Date(dateOnly);

    // 如果日期無效，嘗試其他格式
    if (isNaN(date.getTime())) {
        // 嘗試解析 YYYY-MM-DD 或 YYYY/M/D 格式
        const parts = dateOnly.split(/[-/]/);
        if (parts.length === 3) {
            date = new Date(parts[0], parts[1] - 1, parts[2]);
        }
    }

    // 檢查日期是否有效
    if (isNaN(date.getTime())) {
        return '-';
    }

    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ============================================
// 個人查詢
// ============================================
export function populateStudentSelect() {
    // 填充個人快覽的下拉選單
    const overviewSelect = document.getElementById('overviewStudentSelect');
    if (overviewSelect) {
        statsData.forEach(student => {
            const option = document.createElement('option');
            option.value = student[0];
            option.textContent = student[0];
            overviewSelect.appendChild(option);
        });
    }
}

/**
 * 更新個人進度快覽（當用戶選擇學員時調用）
 */
window.updatePersonalOverview = function() {
    const select = document.getElementById('overviewStudentSelect');
    const studentName = select.value;
    const afterSelectDiv = document.getElementById('overviewAfterSelect');

    if (!studentName) {
        // 隱藏選擇後顯示的區域
        if (afterSelectDiv) {
            afterSelectDiv.style.display = 'none';
        }

        // 清空數據
        document.getElementById('overviewTotalDays').textContent = '-';
        document.getElementById('overviewConsecutiveDays').textContent = '-';
        document.getElementById('overviewMilestones').textContent = '-';

        // 隱藏日曆區域
        const calendarContainer = document.getElementById('personalCalendarContainer');
        if (calendarContainer) {
            calendarContainer.style.display = 'none';
            calendarContainer.innerHTML = '';
        }

        // 重置按鈕狀態
        const icon = document.getElementById('calendarToggleIcon');
        const text = document.getElementById('calendarToggleText');
        if (icon) icon.textContent = '▼';
        if (text) text.textContent = '展開我的完整打卡日曆';

        return;
    }

    const student = statsData.find(s => s[0] === studentName);

    if (!student) {
        console.warn(`找不到學員 ${studentName}`);
        return;
    }

    // 【前端計算】累計天數與連續天數，只計算課程期間的資料
    const totalDays = getTotalDays(studentName);
    const consecutiveDays = getConsecutiveDays(studentName);
    const milestones = getMilestones(student) || '-';

    // 更新統計數據
    document.getElementById('overviewTotalDays').textContent = totalDays;
    document.getElementById('overviewConsecutiveDays').textContent = consecutiveDays;
    document.getElementById('overviewMilestones').textContent = milestones;

    // 顯示選擇後的區域
    if (afterSelectDiv) {
        afterSelectDiv.style.display = 'block';
    }

    console.log(`個人快覽已更新：${studentName} - 累計 ${totalDays} 天，連續 ${consecutiveDays} 天（前端計算）`);

    // 【修復】如果日曆已經展開，自動重新生成日曆內容
    const calendarContainer = document.getElementById('personalCalendarContainer');
    if (calendarContainer && calendarContainer.style.display === 'block') {
        console.log(`日曆已展開，自動更新為 ${studentName} 的日曆`);

        // 重新生成日曆（用 getStudentName 拆掉編號-前綴後比對）
        const studentHighlights = highlightsData.filter(h => getStudentName(h[FORM_COLUMNS.NAME]) === studentName);
        const calendarHTML = generatePersonalCalendar(studentHighlights, COURSE_START_DATE);

        // 生成詳細記錄
        let highlightsHTML = '';
        if (studentHighlights.length > 0) {
            studentHighlights.forEach((highlight, index) => {
                const dateStr = highlight[FORM_COLUMNS.CHECKIN_DATE];
                const method = highlight[FORM_COLUMNS.METHOD];
                const content = highlight[FORM_COLUMNS.HIGHLIGHT];
                const article = highlight[FORM_COLUMNS.ARTICLE];

                const date = formatDate(dateStr);
                const articleHTML = generateArticleHTML(article, `overview-${index}`);

                highlightsHTML += `
                    <div class="highlight-card" style="margin-bottom: 15px;">
                        <div class="highlight-header">
                            <div class="highlight-date" style="font-size: 20px; color: #FF6B35; font-weight: 900;">📅 ${date}</div>
                        </div>
                        ${content ? `<div class="highlight-content" style="font-size: 19px;">💡 ${content}</div>` : ''}
                        ${method ? `<span class="highlight-method" style="font-size: 15px;">${method}</span>` : ''}
                        ${articleHTML}
                    </div>
                `;
            });
        } else {
            highlightsHTML = '<div style="text-align: center; padding: 40px; color: #999; font-size: 18px;">尚無打卡記錄</div>';
        }

        const fullHTML = `
            <!-- 35 天打卡日曆 -->
            <div style="margin-bottom: 30px;">
                ${calendarHTML}
            </div>

            <!-- 完整打卡記錄 - 預設收合 -->
            <div style="margin-top: 30px;">
                <button class="detail-toggle-button" onclick="toggleOverviewDetailRecords()">
                    <span id="overviewDetailRecordsIcon">▼</span>
                    <span id="overviewDetailRecordsText">展開查看完整打卡記錄 (共 ${studentHighlights.length} 筆)</span>
                </button>
                <div id="overviewDetailRecordsContent" style="display: none; margin-top: 20px; max-height: 600px; overflow-y: auto;">
                    ${highlightsHTML}
                </div>
            </div>
        `;

        calendarContainer.innerHTML = fullHTML;
        console.log(`✅ 日曆已更新為 ${studentName} 的內容`);
    }
};

/**
 * 切換個人完整日曆的顯示（在快覽區域內展開）
 */
window.togglePersonalCalendar = function() {
    const select = document.getElementById('overviewStudentSelect');
    const studentName = select.value;

    if (!studentName) {
        alert('請先選擇你的名字');
        select.focus();
        return;
    }

    const container = document.getElementById('personalCalendarContainer');
    const icon = document.getElementById('calendarToggleIcon');
    const text = document.getElementById('calendarToggleText');

    if (container.style.display === 'none' || !container.style.display) {
        // 展開：生成並顯示完整日曆
        const studentHighlights = highlightsData.filter(h => getStudentName(h[FORM_COLUMNS.NAME]) === studentName);
        const calendarHTML = generatePersonalCalendar(studentHighlights, COURSE_START_DATE);

        // 生成詳細記錄
        let highlightsHTML = '';
        if (studentHighlights.length > 0) {
            studentHighlights.forEach((highlight, index) => {
                const dateStr = highlight[FORM_COLUMNS.CHECKIN_DATE];
                const method = highlight[FORM_COLUMNS.METHOD];
                const content = highlight[FORM_COLUMNS.HIGHLIGHT];
                const article = highlight[FORM_COLUMNS.ARTICLE];

                const date = formatDate(dateStr);
                const articleHTML = generateArticleHTML(article, `overview-${index}`);

                highlightsHTML += `
                    <div class="highlight-card" style="margin-bottom: 15px;">
                        <div class="highlight-header">
                            <div class="highlight-date" style="font-size: 20px; color: #FF6B35; font-weight: 900;">📅 ${date}</div>
                        </div>
                        ${content ? `<div class="highlight-content" style="font-size: 19px;">💡 ${content}</div>` : ''}
                        ${method ? `<span class="highlight-method" style="font-size: 15px;">${method}</span>` : ''}
                        ${articleHTML}
                    </div>
                `;
            });
        } else {
            highlightsHTML = '<div style="text-align: center; padding: 40px; color: #999; font-size: 18px;">尚無打卡記錄</div>';
        }

        const fullHTML = `
            <!-- 35 天打卡日曆 -->
            <div style="margin-bottom: 30px;">
                ${calendarHTML}
            </div>

            <!-- 完整打卡記錄 - 預設收合 -->
            <div style="margin-top: 30px;">
                <button class="detail-toggle-button" onclick="toggleOverviewDetailRecords()">
                    <span id="overviewDetailRecordsIcon">▼</span>
                    <span id="overviewDetailRecordsText">展開查看完整打卡記錄 (共 ${studentHighlights.length} 筆)</span>
                </button>
                <div id="overviewDetailRecordsContent" style="display: none; margin-top: 20px; max-height: 600px; overflow-y: auto;">
                    ${highlightsHTML}
                </div>
            </div>
        `;

        container.innerHTML = fullHTML;
        container.style.display = 'block';
        icon.textContent = '▲';
        text.textContent = '收合完整打卡日曆';

        // 平滑滾動到日曆
        setTimeout(() => {
            container.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }, 100);
    } else {
        // 收合
        container.style.display = 'none';
        icon.textContent = '▼';
        text.textContent = '展開我的完整打卡日曆';
    }
};

/**
 * 切換個人快覽中的詳細記錄
 */
window.toggleOverviewDetailRecords = function() {
    const content = document.getElementById('overviewDetailRecordsContent');
    const icon = document.getElementById('overviewDetailRecordsIcon');
    const text = document.getElementById('overviewDetailRecordsText');

    if (!content || !icon || !text) return;

    if (content.style.display === 'none' || !content.style.display) {
        content.style.display = 'block';
        icon.textContent = '▲';
        text.textContent = text.textContent.replace('展開', '收合');
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        text.textContent = text.textContent.replace('收合', '展開');
    }
};

/**
 * 切換今日打卡戰況區塊
 */
window.toggleTodayBattleSection = function() {
    const content = document.getElementById('todayBattleContent');
    const icon = document.getElementById('todayBattleToggleIcon');

    if (!content || !icon) return;

    if (content.style.display === 'none' || !content.style.display) {
        content.style.display = 'block';
        icon.textContent = '▲';
        icon.classList.add('open');
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        icon.classList.remove('open');
    }
};

/**
 * 切換學員列表並自動刷新
 */
window.toggleStudentListAndRefresh = async function() {
    const container = document.getElementById('studentAvatarsContainer');
    const icon = document.getElementById('toggleIcon');
    const buttonText = document.getElementById('toggleText');

    if (!container || !icon || !buttonText) {
        console.error('toggleStudentListAndRefresh: 找不到必要的 DOM 元素');
        return;
    }

    if (container.style.display === 'none' || !container.style.display) {
        // 展開前先刷新數據
        buttonText.textContent = '⏳ 刷新中...';

        try {
            const { loadData } = await import('./data.js');
            await loadData(false); // 強制從遠端載入

            // 刷新完成後展開
            renderTodayCheckinStatus();
            container.style.display = 'block';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            icon.textContent = '▲';
            buttonText.textContent = '收起學員列表';

            // 平滑滾動到容器
            setTimeout(() => {
                container.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }, 100);
        } catch (error) {
            console.error('刷新失敗:', error);
            buttonText.textContent = '查看詳細打卡名單（點擊自動刷新）';
        }
    } else {
        // 收起 - 使用動畫效果
        container.style.opacity = '0';
        container.style.transform = 'translateY(-10px)';

        setTimeout(() => {
            container.style.display = 'none';
        }, 300);

        icon.textContent = '▼';
        buttonText.textContent = '查看詳細打卡名單（點擊自動刷新）';
    }
};

/**
 * 切換復盤戰友風采區塊
 */
window.toggleTeammatesSection = function() {
    const content = document.getElementById('teammatesContent');
    const icon = document.getElementById('teammatesToggleIcon');

    if (!content || !icon) return;

    if (content.style.display === 'none' || !content.style.display) {
        // 展開前先渲染數據（如果還沒渲染）
        const leaderboardList = document.getElementById('leaderboardList');
        if (leaderboardList && leaderboardList.classList.contains('loading')) {
            renderLeaderboard();
            renderHighlights();
        }

        content.style.display = 'block';
        icon.textContent = '▲';
        icon.classList.add('open');

        // 延遲同步高度，確保 DOM 已經顯示並計算完成
        requestAnimationFrame(() => {
            syncSectionHeights();
        });
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        icon.classList.remove('open');
    }
};

/**
 * 生成個人 35 天打卡方格日曆
 */
function generatePersonalCalendar(studentHighlights, courseStartDate) {
    console.log('==================== 生成個人日曆 ====================');
    console.log('學員打卡記錄總數:', studentHighlights.length);

    // 提取已打卡的日期（支援多種「已完成」格式）
    const checkedDates = new Set();
    const parsedDates = []; // 用於 debug

    studentHighlights.forEach((h, index) => {
        const dateStr = h[FORM_COLUMNS.CHECKIN_DATE];

        if (index < 3) {
            console.log(`記錄 ${index + 1}:`, {
                姓名: getStudentName(h[FORM_COLUMNS.NAME]),
                打卡日期原始值: dateStr,
                日期類型: typeof dateStr
            });
        }

        if (dateStr) {
            let date;
            let parseMethod = '';

            if (typeof dateStr === 'string') {
                // 處理字串格式
                const datePart = dateStr.trim().split(' ')[0]; // 取日期部分，忽略時間

                // 嘗試不同的解析方式
                if (datePart.includes('/')) {
                    // 格式: 2025/12/7 或 2025/1/9
                    const parts = datePart.split('/');
                    if (parts.length === 3) {
                        const year = parseInt(parts[0]);
                        const month = parseInt(parts[1]) - 1; // JavaScript 月份從 0 開始
                        const day = parseInt(parts[2]);
                        date = new Date(year, month, day);
                        parseMethod = 'manual-split';
                    }
                } else if (datePart.includes('-')) {
                    // 格式: 2025-12-07
                    date = new Date(datePart);
                    parseMethod = 'native-parse';
                } else {
                    // 其他格式，嘗試直接解析
                    date = new Date(datePart);
                    parseMethod = 'fallback';
                }
            } else {
                // 如果已經是 Date 物件
                date = new Date(dateStr);
                parseMethod = 'date-object';
            }

            // 檢查日期是否有效
            if (date && !isNaN(date.getTime())) {
                // 格式化為 YYYY-MM-DD 用於比對
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                checkedDates.add(dateKey);
                parsedDates.push({
                    原始: dateStr,
                    解析後: dateKey,
                    方法: parseMethod
                });

                if (index < 3) {
                    console.log(`  ✅ 解析成功: ${dateStr} -> ${dateKey} (${parseMethod})`);
                }
            } else {
                console.warn(`  ❌ 日期解析失敗: ${dateStr}`);
            }
        }
    });

    console.log('已完成打卡的日期:', Array.from(checkedDates).sort());
    console.log('解析詳情（前5筆）:', parsedDates.slice(0, 5));

    // 生成 35 天的日期陣列
    const calendarDays = [];
    const startDate = new Date(courseStartDate);
    const today = getTaiwanToday();
    today.setHours(0, 0, 0, 0);

    console.log('課程開始日期:', startDate.toLocaleDateString());
    console.log('今天日期:', today.toLocaleDateString());
    console.log('生成 35 天日曆...');

    for (let i = 0; i < 35; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        currentDate.setHours(0, 0, 0, 0); // 確保時間為 00:00:00

        const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const dayOfWeek = currentDate.getDay();
        const isChecked = checkedDates.has(dateKey);
        const isFuture = currentDate > today;
        const weekNumber = Math.floor(i / 7) + 1;

        calendarDays.push({
            date: currentDate,
            dateKey: dateKey,
            dayOfWeek: dayOfWeek,
            displayDate: `${currentDate.getMonth() + 1}/${currentDate.getDate()}`,
            isChecked: isChecked,
            isFuture: isFuture,
            weekNumber: weekNumber,
            dayInWeek: i % 7
        });

        // Debug: 顯示前 7 天和已打卡的日期
        if (i < 7 || isChecked) {
            console.log(`  第 ${i + 1} 天 (${dateKey}): ${isChecked ? '✅ 已打卡' : isFuture ? '⏰ 未來' : '⭕ 未打卡'}`);
        }
    }

    console.log('日曆生成完成，總共', calendarDays.filter(d => d.isChecked).length, '天已打卡');
    console.log('====================================================');

    // 生成 HTML（支援 RWD）
    let html = `
        <style>
            .personal-calendar-container .calendar-legend {
                display: flex;
                gap: 20px;
                margin-bottom: 20px;
                font-size: 15px;
                font-weight: 700;
                flex-wrap: wrap;
            }
            .personal-calendar-container .week-days {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 10px;
            }
            .personal-calendar-container .calendar-day-cell {
                padding: 12px;
                border-radius: 8px;
                text-align: center;
                min-height: 100px;
                transition: all 0.2s ease;
            }
            @media (max-width: 768px) {
                .personal-calendar-container .week-days {
                    gap: 6px;
                }
                .personal-calendar-container .calendar-day-cell {
                    padding: 8px 4px;
                    min-height: 70px;
                }
                .personal-calendar-container .calendar-day-cell .day-name {
                    font-size: 10px !important;
                }
                .personal-calendar-container .calendar-day-cell .check-mark {
                    font-size: 28px !important;
                }
                .personal-calendar-container .calendar-day-cell .date-text {
                    font-size: 9px !important;
                }
                .personal-calendar-container .calendar-legend {
                    font-size: 13px;
                    gap: 12px;
                }
                .personal-calendar-container .calendar-legend .legend-box {
                    width: 18px !important;
                    height: 18px !important;
                }
            }
            @media (max-width: 480px) {
                .personal-calendar-container .calendar-day-cell {
                    padding: 6px 2px;
                    min-height: 60px;
                }
                .personal-calendar-container .calendar-day-cell .check-mark {
                    font-size: 22px !important;
                }
            }
        </style>
        <div class="personal-calendar-container">
            <h3 style="margin-bottom: 20px; font-size: 24px; font-weight: 900; color: #2C3E50; border-bottom: 3px solid #2C3E50; padding-bottom: 10px;">
                📅 我的 35 天打卡日曆
            </h3>
            <div class="calendar-legend">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="legend-box" style="width: 24px; height: 24px; background: linear-gradient(135deg, #FF6B35 0%, #FF8C52 100%); border: 3px solid #2C3E50; border-radius: 4px;"></div>
                    <span>已打卡</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="legend-box" style="width: 24px; height: 24px; background: white; border: 3px solid #2C3E50; border-radius: 4px;"></div>
                    <span>未打卡</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="legend-box" style="width: 24px; height: 24px; background: #F0F0F0; border: 3px solid #DDD; border-radius: 4px;"></div>
                    <span>未來日期</span>
                </div>
            </div>
    `;

    // 按週生成日曆
    for (let week = 1; week <= 5; week++) {
        const weekDays = calendarDays.filter(d => d.weekNumber === week);

        html += `
            <div class="calendar-week" style="margin-bottom: 25px;">
                <div class="week-label" style="font-size: 18px; font-weight: 900; color: #666; margin-bottom: 12px;">第 ${week} 週</div>
                <div class="week-days">
        `;

        weekDays.forEach(day => {
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            let boxStyle = '';
            let contentHTML = '';

            if (day.isFuture) {
                // 未來日期：灰色
                boxStyle = 'background: #F0F0F0; border: 3px solid #DDD; color: #999;';
                contentHTML = `
                    <div class="day-name" style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">週${dayNames[day.dayOfWeek]}</div>
                    <div class="date-text" style="font-size: 12px; font-weight: 700; margin-top: 4px; opacity: 0.5;">${day.displayDate}</div>
                `;
            } else if (day.isChecked) {
                // 已打卡：橘色漸層 + 超大白色勾勾
                boxStyle = 'background: linear-gradient(135deg, #FF6B35 0%, #FF8C52 100%); border: 4px solid #2C3E50; color: white; box-shadow: 4px 4px 0px rgba(44, 62, 80, 0.4);';
                contentHTML = `
                    <div class="day-name" style="font-size: 12px; font-weight: 700; margin-bottom: 2px; opacity: 0.9;">週${dayNames[day.dayOfWeek]}</div>
                    <div class="check-mark" style="font-size: 48px; font-weight: 900; line-height: 1; text-shadow: 2px 2px 0px rgba(0,0,0,0.2);">✓</div>
                    <div class="date-text" style="font-size: 11px; font-weight: 700; margin-top: 2px; opacity: 0.9;">${day.displayDate}</div>
                `;
            } else {
                // 未打卡：白色空框
                boxStyle = 'background: white; border: 3px solid #2C3E50; color: #2C3E50;';
                contentHTML = `
                    <div class="day-name" style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">週${dayNames[day.dayOfWeek]}</div>
                    <div class="check-mark" style="height: 48px;"></div>
                    <div class="date-text" style="font-size: 12px; font-weight: 700; margin-top: 4px;">${day.displayDate}</div>
                `;
            }

            html += `
                <div class="calendar-day-cell" style="${boxStyle}">
                    ${contentHTML}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    html += `
            <div class="calendar-summary" style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #FFF4E8 0%, #FFE8CC 100%); border: 4px solid #2C3E50; border-radius: 8px; box-shadow: 4px 4px 0px #2C3E50; text-align: center;">
                <div style="font-size: 18px; font-weight: 900; color: #2C3E50; margin-bottom: 8px;">
                    已完成 <span style="font-size: 32px; color: #FF6B35;">${checkedDates.size}</span> / 35 天
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #666;">
                    完成率：${Math.round((checkedDates.size / 35) * 100)}%
                </div>
            </div>
        </div>
    `;

    return html;
}

export function lookupStudent() {
    const select = document.getElementById('studentSelect');
    const studentName = select.value;

    if (!studentName) {
        alert('請選擇學員');
        return;
    }

    const student = statsData.find(s => s[0] === studentName);
    if (!student) {
        alert('找不到該學員');
        return;
    }

    // 【前端計算】累計天數與連續天數，只計算課程期間的資料
    const totalDays = getTotalDays(studentName);
    const consecutiveDays = getConsecutiveDays(studentName);
    const lastDate = student[3];
    const milestones = getMilestones(student);

    // 從 highlightsData 過濾該學員的所有打卡記錄（用 getStudentName 拆掉編號-前綴後比對）
    const studentHighlights = highlightsData.filter(h => getStudentName(h[FORM_COLUMNS.NAME]) === studentName);

    console.log(`${studentName} 的打卡記錄: ${studentHighlights.length} 筆`);

    let highlightsHTML = '';
    if (studentHighlights.length > 0) {
        studentHighlights.forEach((highlight, index) => {
            const dateStr = highlight[FORM_COLUMNS.CHECKIN_DATE];
            const method = highlight[FORM_COLUMNS.METHOD];
            const content = highlight[FORM_COLUMNS.HIGHLIGHT];
            const article = highlight[FORM_COLUMNS.ARTICLE];

            const date = formatDate(dateStr);
            const articleHTML = generateArticleHTML(article, `lookup-${index}`);

            highlightsHTML += `
                <div class="highlight-card" style="margin-bottom: 15px;">
                    <div class="highlight-header">
                        <div class="highlight-date" style="font-size: 20px; color: #FF6B35; font-weight: 900;">📅 ${date}</div>
                    </div>
                    ${content ? `<div class="highlight-content" style="font-size: 19px;">💡 ${content}</div>` : ''}
                    ${method ? `<span class="highlight-method" style="font-size: 15px;">${method}</span>` : ''}
                    ${articleHTML}
                </div>
            `;
        });
    } else {
        highlightsHTML = '<div style="text-align: center; padding: 40px; color: #999; font-size: 18px;">尚無打卡記錄</div>';
    }

    // 生成 35 天打卡日曆
    const calendarHTML = generatePersonalCalendar(studentHighlights, COURSE_START_DATE);

    const html = `
        <!-- 35 天打卡日曆 - 最優先顯示 -->
        <div style="margin-top: 25px; margin-bottom: 35px;">
            ${calendarHTML}
        </div>

        <!-- 快速統計卡片 - 精簡版三欄 -->
        <div class="personal-stats">
            <div class="personal-stat-box">
                <div class="personal-stat-label">📅 累計打卡</div>
                <div class="personal-stat-value">${totalDays} <span style="font-size: 16px; color: #999;">天</span></div>
            </div>
            <div class="personal-stat-box">
                <div class="personal-stat-label">🏆 最高連續</div>
                <div class="personal-stat-value">${consecutiveDays} <span style="font-size: 16px; color: #999;">天</span></div>
            </div>
            <div class="personal-stat-box">
                <div class="personal-stat-label">🏆 里程碑</div>
                <div class="personal-stat-value" style="font-size: 18px;">${milestones || '尚未達成'}</div>
            </div>
        </div>

        <!-- 完整打卡記錄 - 預設收合 -->
        <div style="margin-top: 30px;">
            <button class="detail-toggle-button" onclick="toggleDetailRecords()">
                <span id="detailRecordsIcon">▼</span>
                <span id="detailRecordsText">展開查看完整打卡記錄 (共 ${studentHighlights.length} 筆)</span>
            </button>
            <div id="detailRecordsContent" style="display: none; margin-top: 20px; max-height: 600px; overflow-y: auto;">
                ${highlightsHTML}
            </div>
        </div>
    `;

    document.getElementById('personalResult').innerHTML = html;
}

// ============================================
// 同步區塊高度
// ============================================
export function syncSectionHeights() {
    const leaderboard = document.querySelector('.leaderboard');
    const highlights = document.querySelector('.highlights');
    const teammatesContent = document.getElementById('teammatesContent');

    // 只有當區塊可見時才同步高度
    if (!leaderboard || !highlights) return;
    if (teammatesContent && teammatesContent.style.display === 'none') {
        console.log('同步高度跳過：區塊未顯示');
        return;
    }

    // 1. 先清除 highlights 的高度設定，讓它自然長高
    highlights.style.height = 'auto';
    highlights.style.maxHeight = 'none';

    // 2. 獲取排行榜的實際高度 (這是我們的基準)
    const leaderboardHeight = leaderboard.offsetHeight;

    // 如果高度為 0，表示區塊還沒有正確渲染
    if (leaderboardHeight === 0) {
        console.log('同步高度跳過：排行榜高度為 0');
        return;
    }

    // 3. 設定 highlights 的最大高度等於排行榜的高度
    highlights.style.maxHeight = leaderboardHeight + 'px';

    // 4. 設定 highlights 的高度也等於排行榜的高度，確保視覺一致
    highlights.style.height = leaderboardHeight + 'px';

    console.log(`同步高度: 排行榜 ${leaderboardHeight}px -> 亮點牆 (height & max-height set)`);
}

// ============================================
// Toggle 區塊展開/收合
// ============================================
window.toggleSection = function(sectionId) {
    const content = document.getElementById(sectionId + 'Content');
    const icon = document.getElementById(sectionId + 'Icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.add('open');
    } else {
        content.style.display = 'none';
        icon.classList.remove('open');
    }
};

// ============================================
// Toggle 個人查詢詳細記錄
// ============================================
window.toggleDetailRecords = function() {
    const content = document.getElementById('detailRecordsContent');
    const icon = document.getElementById('detailRecordsIcon');
    const text = document.getElementById('detailRecordsText');

    if (!content || !icon || !text) {
        console.error('toggleDetailRecords: 找不到必要的 DOM 元素');
        return;
    }

    if (content.style.display === 'none' || !content.style.display) {
        // 展開
        content.style.display = 'block';
        icon.textContent = '▲';
        text.textContent = text.textContent.replace('展開', '收合');
    } else {
        // 收合
        content.style.display = 'none';
        icon.textContent = '▼';
        text.textContent = text.textContent.replace('收合', '展開');
    }
};
