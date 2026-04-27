/**
 * 5週復盤陪跑班 第二屆 - 打卡系統 Apps Script（精簡版表單）
 *
 * 與第一屆差異：
 * 1. 工作表名稱無空格（表單回應 / 學員名單 / 打卡統計 / 每日亮點牆）
 * 2. 移除「Email / 是否完成 / 戰友 / 問題」欄位 → 送出表單即視為完成
 * 3. 公式從 COUNTIFS（含狀態過濾）簡化為 COUNTIF
 * 4. 姓名加 "*-"&A2 後綴匹配，處理 Form 顯示「編號-姓名」格式
 *
 * 表單欄位順序定義在下方 FORM_COLUMNS（單一來源）。
 */

const TEST_TODAY_DATE = null;

// ============================================================================
// 表單欄位規格表（單一來源 / Single Source of Truth）
// 表單欄位順序若有調整，只需改這裡 + dashboard.js 的對應常數。
// 公式內的欄位字母（B:B, C:C）若需改動請同步調整 setupStatsFormulas。
// ============================================================================
const FORM_COLUMNS = {
  TIMESTAMP: 0,     // A 欄 - 時間戳記（系統自動）
  NAME: 1,          // B 欄 - 姓名（含「編號-」前綴）
  CHECKIN_DATE: 2,  // C 欄 - 打卡日期
  METHOD: 3,        // D 欄 - 萃取法
  HIGHLIGHT: 4,     // E 欄 - 今日一句話亮點（選填）
  ARTICLE: 5        // F 欄 - 今日這段寫的文章（選填）
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📋 打卡系統')
    .addItem('🔄 更新連續天數', 'updateAllConsecutiveDays')
    .addSeparator()
    .addSubMenu(ui.createMenu('📊 每週報告')
      .addItem('📝 產生本週報告預覽', 'generateWeeklyReportPreview')
      .addItem('✅ 確認寄送本週報告', 'sendWeeklyReports')
      .addSeparator()
      .addItem('📧 測試寄送（寄給我）', 'sendTestWeeklyReport'))
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ 自動化設定')
      .addItem('✅ 設定自動觸發器 (3次/天)', 'createMultipleDailyTriggers')
      .addItem('設定自動觸發器 (2次/天)', 'createTwiceDailyTriggers')
      .addSeparator()
      .addItem('查看目前觸發器', 'viewCurrentTriggers')
      .addItem('刪除所有觸發器', 'deleteAllTriggers'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🔧 工具')
      .addItem('檢查工作表設定', 'checkRequiredSheets')
      .addItem('⚡ 設定所有公式', 'setupStatsFormulas'))
    .addToUi();
}

function checkRequiredSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const allSheets = ss.getSheets();
  const sheetNames = allSheets.map(sheet => sheet.getName());

  let message = '📋 目前的工作表清單：\n\n';
  sheetNames.forEach((name, index) => {
    message += (index + 1) + '. "' + name + '"\n';
  });

  const requiredSheets = ['表單回應', '學員名單', '打卡統計', '每日亮點牆'];
  message += '\n\n✅ 必要的工作表：\n';
  let allExist = true;
  requiredSheets.forEach(name => {
    const exists = sheetNames.includes(name);
    message += (exists ? '✅' : '❌') + ' ' + name + '\n';
    if (!exists) allExist = false;
  });

  if (!allExist) {
    message += '\n⚠️ 有工作表不存在或名稱不正確！\n請檢查工作表名稱是否完全一致（含空格）。';
  } else {
    message += '\n✅ 所有必要工作表都存在！';
  }
  ui.alert('工作表檢查結果', message, ui.ButtonSet.OK);
}

function setupStatsFormulas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const statsSheet = ss.getSheetByName('打卡統計');
  if (!statsSheet) {
    SpreadsheetApp.getUi().alert('❌ 錯誤', '找不到「打卡統計」工作表！', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const lastRow = statsSheet.getLastRow();
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('⚠️ 提醒', '「打卡統計」工作表沒有學員資料！\n請先在「學員名單」新增學員。', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const numRows = lastRow - 1;

  // 公式說明：
  // - 用 "*-"&A2 做後綴匹配：Form 顯示「12-Zarah Hsu」，學員名單存「Zarah Hsu」也能對上
  // - 已移除「是否完成」欄位 → 送出 = 完成，不再需要狀態過濾
  // - 欄位字母對應 FORM_COLUMNS：B=NAME, C=CHECKIN_DATE

  // B欄：累計打卡天數（單純計數姓名出現次數）
  statsSheet.getRange(2, 2, numRows, 1).setFormula(
    '=COUNTIF(表單回應!$B:$B, "*-"&A2)'
  );
  // D欄：最近打卡日期（從 C 欄取最大日期）
  statsSheet.getRange(2, 4, numRows, 1).setFormula(
    '=LET(result, MAXIFS(表單回應!$C:$C, 表單回應!$B:$B, "*-"&A2), IF(result=0, "", result))'
  );
  // E~I 欄：里程碑
  statsSheet.getRange(2, 5, numRows, 1).setFormula('=IF(C2>=7, "🏆", "-")');
  statsSheet.getRange(2, 6, numRows, 1).setFormula('=IF(C2>=14, "🏆", "-")');
  statsSheet.getRange(2, 7, numRows, 1).setFormula('=IF(C2>=21, "🏆", "-")');
  statsSheet.getRange(2, 8, numRows, 1).setFormula('=IF(C2>=28, "🏆", "-")');
  if (statsSheet.getLastColumn() >= 9) {
    statsSheet.getRange(2, 9, numRows, 1).setFormula('=IF(C2>=35, "🏆", "-")');
  }

  SpreadsheetApp.getUi().alert(
    '✅ 公式設定完成！',
    '已影響 ' + numRows + ' 位學員。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function updateAllConsecutiveDays() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('表單回應');
  const statsSheet = ss.getSheetByName('打卡統計');

  if (!responseSheet) {
    try {
      SpreadsheetApp.getUi().alert(
        '❌ 錯誤',
        '找不到「表單回應」工作表！\n請執行「🔧 工具 → 檢查工作表設定」查看實際名稱。',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (e) {}
    Logger.log('❌ 找不到「表單回應」工作表');
    return;
  }
  if (!statsSheet) {
    try {
      SpreadsheetApp.getUi().alert(
        '❌ 錯誤', '找不到「打卡統計」工作表！',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (e) {}
    return;
  }

  const lastRow = statsSheet.getLastRow();
  if (lastRow > 1) {
    statsSheet.getRange(2, 3, lastRow - 1, 1).clearContent();
  }

  const responseData = responseSheet.getDataRange().getValues();
  const statsData = statsSheet.getDataRange().getValues();
  const studentRecords = new Map();
  const today = TEST_TODAY_DATE ? new Date(TEST_TODAY_DATE) : new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setHours(23, 59, 59, 999);

  let filteredCount = 0;
  for (let i = 1; i < responseData.length; i++) {
    const row = responseData[i];
    // 姓名帶「編號-」前綴（例如 12-Zarah Hsu），自動拆掉
    const name = String(row[FORM_COLUMNS.NAME]).replace(/^\d+-/, '');
    const dateValue = row[FORM_COLUMNS.CHECKIN_DATE];

    if (name) {
      if (!studentRecords.has(name)) studentRecords.set(name, new Set());
      let normalizedDate, dateObj;

      if (dateValue instanceof Date) {
        dateObj = new Date(dateValue);
        normalizedDate = Utilities.formatDate(
          dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd'
        );
      } else if (typeof dateValue === 'string') {
        const datePart = dateValue.trim().split(' ')[0];
        const parts = datePart.split('/');
        if (parts.length === 3) {
          const year = parts[0];
          const month = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          normalizedDate = year + '-' + month + '-' + day;
          dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
      }

      if (normalizedDate && dateObj && dateObj <= cutoffDate) {
        studentRecords.get(name).add(normalizedDate);
      } else if (dateObj && dateObj > cutoffDate) {
        filteredCount++;
      }
    }
  }

  today.setHours(0, 0, 0, 0);
  const updateData = [];

  for (let i = 1; i < statsData.length; i++) {
    const studentName = statsData[i][0];
    const dateSet = studentRecords.get(studentName) || new Set();
    let maxConsecutiveDays = 0;

    if (dateSet.size > 0) {
      const sortedDates = Array.from(dateSet)
        .map(function(s) {
          const p = s.split('-');
          return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        })
        .sort(function(a, b) { return a - b; });

      maxConsecutiveDays = 1;
      let currentConsecutive = 1;
      for (let j = 1; j < sortedDates.length; j++) {
        const diff = Math.floor(
          (sortedDates[j] - sortedDates[j - 1]) / (1000 * 60 * 60 * 24)
        );
        if (diff === 1) {
          currentConsecutive++;
          maxConsecutiveDays = Math.max(maxConsecutiveDays, currentConsecutive);
        } else {
          currentConsecutive = 1;
        }
      }
    }
    updateData.push([maxConsecutiveDays]);
  }

  if (updateData.length > 0) {
    statsSheet.getRange(2, 3, updateData.length, 1).setValues(updateData);
  }

  try {
    SpreadsheetApp.getUi().alert(
      '✅ 更新完成！',
      '已更新 ' + updateData.length + ' 位學員。\n已過濾 ' + filteredCount + ' 筆未來日期記錄。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    Logger.log('✅ 更新完成！已更新 ' + updateData.length + ' 位學員。');
  }
}

function createMultipleDailyTriggers() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'updateAllConsecutiveDays') ScriptApp.deleteTrigger(t);
  });
  try {
    ScriptApp.newTrigger('updateAllConsecutiveDays').timeBased().atHour(8).everyDays(1).create();
    ScriptApp.newTrigger('updateAllConsecutiveDays').timeBased().atHour(14).everyDays(1).create();
    ScriptApp.newTrigger('updateAllConsecutiveDays').timeBased().atHour(23).everyDays(1).create();
    ui.alert('✅ 已建立 3 個觸發器：早 8、午 2、晚 11');
  } catch (e) {
    ui.alert('❌ 設定失敗：' + e.message);
  }
}

function createTwiceDailyTriggers() {
  const ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'updateAllConsecutiveDays') ScriptApp.deleteTrigger(t);
  });
  try {
    ScriptApp.newTrigger('updateAllConsecutiveDays').timeBased().atHour(9).everyDays(1).create();
    ScriptApp.newTrigger('updateAllConsecutiveDays').timeBased().atHour(23).everyDays(1).create();
    ui.alert('✅ 已建立 2 個觸發器：早 9、晚 11');
  } catch (e) {
    ui.alert('❌ 設定失敗：' + e.message);
  }
}

function deleteAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('確認刪除', '確定要刪除所有自動觸發器嗎？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'updateAllConsecutiveDays') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  ui.alert('✅ 已刪除 ' + count + ' 個觸發器。');
}

function viewCurrentTriggers() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'updateAllConsecutiveDays';
  });
  if (triggers.length === 0) {
    ui.alert('目前沒有任何觸發器。');
  } else {
    ui.alert('⏰ 目前有 ' + triggers.length + ' 個觸發器在跑 updateAllConsecutiveDays');
  }
}
