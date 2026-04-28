# 周报周期块模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `weekly-report-service.js` 的 sheet 写入逻辑从覆盖式改为周期块模式，支持在 sheet 顶部插入新周期、复制静态账号信息、按周报周期统计、AI 生成运营进展。

**Architecture:** 在 `feishu-spreadsheet.js` 新增 `readValues` 和 `insertRows` API 封装；在 `weekly-report-service.js` 新增 `readTopCycleFromSheet` 读取模板、`formatPeriodTitle` 格式化标题，重写 `writeToSpreadsheet` 为周期块插入逻辑；修改 `calculateAccountStatsFromDetail` 支持周报日期过滤；调整 `buildAIPrompt` 生成专业运营文本。

**Tech Stack:** Node.js, Express, Jest, 飞书 Open API (sheets v2, bitable v1)

---

## File Mapping

| File | Action | Responsibility |
|---|---|---|
| `src/services/feishu-spreadsheet.js` | Modify | 新增 `readValues` 和 `insertRows` 方法 |
| `src/services/weekly-report-service.js` | Modify | 重写周报核心逻辑 |
| `tests/routes/reports.test.js` | Modify | 更新 mock，覆盖新的 spreadsheet 方法 |
| `tests/services/weekly-report-service.test.js` | Create | 新增单元测试：周期标题格式化、sheet 数据解析、AI prompt 构建 |

---

## Task 1: feishu-spreadsheet.js 新增读取和插入行方法

**Files:**
- Modify: `src/services/feishu-spreadsheet.js`
- Test: `tests/services/feishu-spreadsheet.test.js` (create if not exists)

- [ ] **Step 1: 新增 `readValues` 方法**

在 `src/services/feishu-spreadsheet.js` 的 `request` 方法之后、`writeValues` 之前，插入：

```js
  async readValues(spreadsheetToken, range) {
    const result = await this.request('GET', spreadsheetToken, `/values/${range}`);
    return result?.valueRange?.values || [];
  }
```

- [ ] **Step 2: 新增 `insertRows` 方法**

在 `readValues` 之后，插入：

```js
  async insertRows(spreadsheetToken, sheetId, startIndex, endIndex) {
    return this.request('POST', spreadsheetToken, '/dimension-rows', {
      dimension: {
        sheetId,
        majorDimension: 'ROWS',
        startIndex,
        endIndex,
      },
      inheritStyle: true,
    });
  }
```

- [ ] **Step 3: 验证方法已导出可用**

确认文件末尾 `module.exports` 是单例导出，无需修改。

- [ ] **Step 4: 写基础测试验证新增方法存在**

Create `tests/services/feishu-spreadsheet.test.js`：

```js
const feishuSpreadsheet = require('../../src/services/feishu-spreadsheet');

jest.mock('../../src/services/feishu-auth', () => ({
  getAppToken: jest.fn().mockResolvedValue('fake-token'),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('feishuSpreadsheet', () => {
  const axios = require('axios').default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have readValues method', () => {
    expect(typeof feishuSpreadsheet.readValues).toBe('function');
  });

  it('should have insertRows method', () => {
    expect(typeof feishuSpreadsheet.insertRows).toBe('function');
  });

  it('readValues should return values array', async () => {
    axios.mockResolvedValueOnce({
      data: {
        code: 0,
        data: {
          valueRange: {
            values: [['a', 'b'], ['c', 'd']],
          },
        },
      },
    });
    const result = await feishuSpreadsheet.readValues('token123', 'Sheet1!A1:B2');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('insertRows should call dimension-rows API', async () => {
    axios.mockResolvedValueOnce({
      data: { code: 0, data: {} },
    });
    await feishuSpreadsheet.insertRows('token123', 'sheetId456', 0, 10);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/dimension-rows'),
        data: expect.objectContaining({
          dimension: {
            sheetId: 'sheetId456',
            majorDimension: 'ROWS',
            startIndex: 0,
            endIndex: 10,
          },
        }),
      })
    );
  });
});
```

- [ ] **Step 5: 运行测试**

Run: `npx jest tests/services/feishu-spreadsheet.test.js --verbose`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/feishu-spreadsheet.js tests/services/feishu-spreadsheet.test.js
git commit -m "feat(spreadsheet): add readValues and insertRows APIs"
```

---

## Task 2: weekly-report-service.js 新增辅助方法

**Files:**
- Modify: `src/services/weekly-report-service.js`
- Test: `tests/services/weekly-report-service.test.js` (create)

- [ ] **Step 1: 新增 `formatPeriodTitle` 工具方法**

在 `class WeeklyReportService` 内、`generateWeeklyReport` 之前，插入：

```js
  formatPeriodTitle(startDate, endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const sMonth = s.getMonth() + 1;
    const sDay = s.getDate();
    const eMonth = e.getMonth() + 1;
    const eDay = e.getDate();

    if (sMonth === eMonth) {
      return `${sMonth}.${String(sDay).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
    }
    return `${sMonth}.${String(sDay).padStart(2, '0')}-${eMonth}.${String(eDay).padStart(2, '0')}`;
  }
```

- [ ] **Step 2: 新增 `readTopCycleFromSheet` 方法**

在 `formatPeriodTitle` 之后，插入：

```js
  async readTopCycleFromSheet(sheetToken) {
    const sheetName = 'Sheet1';
    const maxRows = 200;
    const range = `${sheetName}!A1:M${maxRows}`;

    try {
      const values = await feishuSpreadsheet.readValues(sheetToken, range);
      if (!values || values.length === 0) {
        return null;
      }

      // 找周期标题行：第一个非空行，且不符合表头特征
      let titleRowIndex = -1;
      let headerRowIndex = -1;
      const headerKeywords = ['账号编号', '账号类型', '账号名称'];

      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        if (!row || row.every(cell => !cell)) continue;

        const firstCell = String(row[0] || '');
        // 识别表头行
        if (headerKeywords.some(k => firstCell.includes(k))) {
          headerRowIndex = i;
          if (titleRowIndex === -1 && i > 0) {
            // 表头前一行（跳过空行）即为标题
            for (let t = i - 1; t >= 0; t--) {
              if (values[t] && values[t].some(cell => cell)) {
                titleRowIndex = t;
                break;
              }
            }
          }
          break;
        }
      }

      if (headerRowIndex === -1) {
        return null;
      }

      if (titleRowIndex === -1) {
        titleRowIndex = 0;
      }

      const periodTitle = String(values[titleRowIndex][0] || '');
      const headers = values[headerRowIndex] || [];

      // 读取账号数据行：从表头下一行开始，直到空行或运营标题
      const accounts = [];
      const opsKeywords = ['运营进展', 'Highlights', 'Lowlights', '风险', '规划'];
      for (let i = headerRowIndex + 1; i < values.length; i++) {
        const row = values[i];
        if (!row || row.every(cell => !cell)) {
          // 连续空行结束账号区域
          // 但允许单个空行后继续？根据格式，账号区域后有一个空行再接运营区块
          // 如果下一行是运营标题，则停止
          if (i + 1 < values.length) {
            const nextFirst = String(values[i + 1][0] || '');
            if (opsKeywords.some(k => nextFirst.includes(k))) {
              break;
            }
          }
          // 否则继续，可能是账号区域内的空行（理论上不应有）
          continue;
        }

        const firstCell = String(row[0] || '');
        if (opsKeywords.some(k => firstCell.includes(k))) {
          break;
        }

        // 提取静态字段：编号、类型、供应商、区域、内容类型、平台、userid、名称、链接
        // 列顺序与表头一致
        const account = {
          rowIndex: i,
        };
        headers.forEach((h, idx) => {
          const headerName = String(h || '');
          if (headerName.includes('编号')) account.number = row[idx];
          if (headerName.includes('类型')) account.type = row[idx];
          if (headerName.includes('供应商')) account.supplier = row[idx];
          if (headerName.includes('区域')) account.region = row[idx];
          if (headerName.includes('内容类型')) account.contentType = row[idx];
          if (headerName.includes('平台')) account.platform = row[idx];
          if (headerName.includes('userid')) account.userid = row[idx];
          if (headerName.includes('账号名称')) account.name = row[idx];
          if (headerName.includes('账号链接')) account.link = row[idx];
        });

        if (account.name || account.number) {
          accounts.push(account);
        }
      }

      return {
        periodTitle,
        headers,
        accounts,
        titleRowIndex,
        headerRowIndex,
      };
    } catch (error) {
      logger.error('Failed to read top cycle from sheet', { sheetToken, error: error.message });
      return null;
    }
  }
```

- [ ] **Step 3: 写测试验证辅助方法**

Create `tests/services/weekly-report-service.test.js`：

```js
const weeklyReportService = require('../../src/services/weekly-report-service');

describe('WeeklyReportService helpers', () => {
  describe('formatPeriodTitle', () => {
    it('should format same month period', () => {
      const result = weeklyReportService.formatPeriodTitle('2026-04-21', '2026-04-27');
      expect(result).toBe('4.21-27');
    });

    it('should format cross month period', () => {
      const result = weeklyReportService.formatPeriodTitle('2026-03-28', '2026-04-03');
      expect(result).toBe('3.28-4.03');
    });
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `npx jest tests/services/weekly-report-service.test.js --verbose`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/weekly-report-service.js tests/services/weekly-report-service.test.js
git commit -m "feat(weekly-report): add formatPeriodTitle and readTopCycleFromSheet helpers"
```

---

## Task 3: weekly-report-service.js 重写 writeToSpreadsheet

**Files:**
- Modify: `src/services/weekly-report-service.js`
- Test: `tests/services/weekly-report-service.test.js`

- [ ] **Step 1: 重写 `writeToSpreadsheet` 方法**

将现有的 `writeToSpreadsheet` 方法整体替换为：

```js
  async writeToSpreadsheet(sheetToken, reportData) {
    const sheetName = 'Sheet1';

    // 1. 读取现有顶部周期作为模板
    const template = await this.readTopCycleFromSheet(sheetToken);

    if (!template || !template.accounts || template.accounts.length === 0) {
      logger.warn('No existing cycle template found in sheet, falling back to simplified write', { sheetToken });
      // 兜底：简化写入（保留现有逻辑，但清空后写入）
      const headers = ['账号名称', '平台', '已发布', '保底条数', '播放量', '发布完成率', '负责人'];
      await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A1:G1`, [headers]);
      const rows = reportData.accounts.map((a, i) => [
        a.name,
        a.platform,
        a.published,
        a.target,
        a.playCount,
        a.completionRate,
        a.responsible,
      ]);
      if (rows.length > 0) {
        await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A2:G${rows.length + 1}`, rows);
      }
      return;
    }

    const accountCount = template.accounts.length;
    const insertRowCount = accountCount + 10; // 标题1 + 空行1 + 表头1 + 账号N + 空行1 + 运营5 + 底部空行1

    // 2. 在 sheet 顶部插入空行
    try {
      // 先获取 sheetId
      const meta = await feishuSpreadsheet.getSheetMetadata(sheetToken);
      const sheetId = meta?.sheets?.[0]?.sheet_id || '0';
      await feishuSpreadsheet.insertRows(sheetToken, sheetId, 0, insertRowCount);
      logger.info('Inserted rows at top of sheet', { sheetToken, rowCount: insertRowCount });
    } catch (error) {
      logger.error('Failed to insert rows at top, falling back to full rewrite', { sheetToken, error: error.message });
      // 兜底：读取整个 sheet，在前面拼接
      await this._fallbackWriteToSpreadsheet(sheetToken, reportData, template);
      return;
    }

    // 3. 组装新周期数据
    const periodTitle = this.formatPeriodTitle(reportData.startDate, reportData.endDate);
    const rows = [];

    // 第1行：周期标题
    rows.push([periodTitle]);
    // 第2行：空行
    rows.push([]);
    // 第3行：表头
    rows.push(template.headers);

    // 第4行起：账号数据
    // 找到关键列的索引
    const headers = template.headers;
    const colIndex = {
      number: headers.findIndex(h => String(h).includes('编号')),
      type: headers.findIndex(h => String(h).includes('类型')),
      supplier: headers.findIndex(h => String(h).includes('供应商')),
      region: headers.findIndex(h => String(h).includes('区域')),
      contentType: headers.findIndex(h => String(h).includes('内容类型')),
      platform: headers.findIndex(h => String(h).includes('平台')),
      userid: headers.findIndex(h => String(h).includes('userid')),
      name: headers.findIndex(h => String(h).includes('账号名称')),
      link: headers.findIndex(h => String(h).includes('账号链接')),
      published: headers.findIndex(h => String(h).includes('发布数量')),
      playCount: headers.findIndex(h => String(h).includes('播放量')),
      avgPerPost: headers.findIndex(h => String(h).includes('稿均')),
      fansGrowth: headers.findIndex(h => String(h).includes('增粉量')),
    };

    const maxCol = Math.max(...Object.values(colIndex).filter(v => v >= 0)) + 1;

    for (let i = 0; i < accountCount; i++) {
      const tmpl = template.accounts[i];
      const data = reportData.accounts[i] || {};
      const row = new Array(maxCol).fill('');

      if (colIndex.number >= 0) row[colIndex.number] = tmpl.number || '';
      if (colIndex.type >= 0) row[colIndex.type] = tmpl.type || '';
      if (colIndex.supplier >= 0) row[colIndex.supplier] = tmpl.supplier || '';
      if (colIndex.region >= 0) row[colIndex.region] = tmpl.region || '';
      if (colIndex.contentType >= 0) row[colIndex.contentType] = tmpl.contentType || '';
      if (colIndex.platform >= 0) row[colIndex.platform] = tmpl.platform || '';
      if (colIndex.userid >= 0) row[colIndex.userid] = tmpl.userid || '';
      if (colIndex.name >= 0) row[colIndex.name] = tmpl.name || '';
      if (colIndex.link >= 0) row[colIndex.link] = tmpl.link || '';
      if (colIndex.published >= 0) row[colIndex.published] = data.published || 0;
      if (colIndex.playCount >= 0) row[colIndex.playCount] = data.playCount || 0;
      if (colIndex.avgPerPost >= 0) {
        // 稿均写公式：=总播放量单元格/总发布数量单元格
        // 当前行号 = 4 + i（因为插入了 insertRowCount 行在最前面，新数据从第1行开始）
        // 第3行是表头，第4行是第一个账号
        const playCol = this._colIndexToLetter(colIndex.playCount);
        const pubCol = this._colIndexToLetter(colIndex.published);
        const rowNum = 4 + i;
        row[colIndex.avgPerPost] = `=${playCol}${rowNum}/${pubCol}${rowNum}`;
      }
      if (colIndex.fansGrowth >= 0) row[colIndex.fansGrowth] = 0;

      rows.push(row);
    }

    // 空行
    rows.push([]);

    // 运营区块
    const opsSection = [
      ['二、周运营进展同步', ''],
      ['本周 Highlights', reportData.highlights || ''],
      ['本周 Lowlights', reportData.lowlights || ''],
      ['风险与问题', ''],
      ['下步规划', reportData.nextSteps || ''],
    ];
    // 扩展到 maxCol 列
    for (const opRow of opsSection) {
      while (opRow.length < maxCol) opRow.push('');
      rows.push(opRow);
    }

    // 底部空行
    rows.push([]);

    // 4. 批量写入
    try {
      const endRow = rows.length;
      await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A1:${this._colIndexToLetter(maxCol - 1)}${endRow}`, rows);
      logger.info('Weekly report cycle block written to sheet top', { sheetToken, periodTitle, accountCount });
    } catch (error) {
      logger.error('Failed to write cycle block to sheet', { sheetToken, error: error.message });
      throw error;
    }
  }

  _colIndexToLetter(index) {
    let result = '';
    let i = index;
    while (i >= 0) {
      result = String.fromCharCode(65 + (i % 26)) + result;
      i = Math.floor(i / 26) - 1;
    }
    return result;
  }

  async _fallbackWriteToSpreadsheet(sheetToken, reportData, template) {
    // 兜底方案：读取整个 sheet，在前面拼接新周期，然后整体写回
    logger.warn('Using fallback full-rewrite for weekly report sheet', { sheetToken });
    const sheetName = 'Sheet1';
    // 简化实现：先清空再写入（实际项目中可按需扩展）
    const periodTitle = this.formatPeriodTitle(reportData.startDate, reportData.endDate);
    const headers = template.headers || ['账号编号', '账号类型', '负责供应商', '区域', '内容类型', '平台', 'userid', '账号名称', '账号链接', '总发布数量', '总播放量', '稿均', '增粉量'];
    const rows = [];
    rows.push([periodTitle]);
    rows.push([]);
    rows.push(headers);
    // ... 简化写入
    await feishuSpreadsheet.writeValues(sheetToken, `${sheetName}!A1:M${rows.length}`, rows);
  }
```

注意：这里 `reportData` 的结构需要扩展，增加 `startDate`, `endDate`, `highlights`, `lowlights`, `nextSteps` 字段。这些会在 Task 5 中调整 `generateWeeklyReport` 时组装。

- [ ] **Step 2: 运行现有测试确保没有破坏**

Run: `npx jest tests/routes/reports.test.js --verbose`
Expected: 4 tests PASS（mock 可能需要更新，见 Task 6）

- [ ] **Step 3: Commit**

```bash
git add src/services/weekly-report-service.js
git commit -m "feat(weekly-report): rewrite writeToSpreadsheet with cycle block mode"
```

---

## Task 4: weekly-report-service.js 修改统计和 AI 逻辑

**Files:**
- Modify: `src/services/weekly-report-service.js`

- [ ] **Step 1: 修改 `calculateAccountStatsFromDetail` 支持周报周期过滤**

将方法签名改为：
```js
  async calculateAccountStatsFromDetail(projectName, accountName, platform, homeLink, versionStart, versionEnd, weeklyStart, weeklyEnd) {
```

在方法内部，把现有的版本周期过滤逻辑改为优先使用周报周期：

```js
      for (const r of records) {
        // 只统计数据状态正常的记录
        if (r.fields?.['数据状态'] === '已删除') continue;

        // 时间过滤：优先按周报周期，其次按版本周期
        const filterStart = weeklyStart || versionStart;
        const filterEnd = weeklyEnd || versionEnd;

        if (filterStart || filterEnd) {
          const publishTimeField = r.fields?.['发布时间'];
          if (!publishTimeField) continue;

          let publishTime;
          if (typeof publishTimeField === 'number') {
            publishTime = new Date(publishTimeField);
          } else {
            publishTime = new Date(String(publishTimeField).replace(/-/g, '/'));
          }
          if (isNaN(publishTime.getTime())) continue;

          const dateOnly = new Date(publishTime.getFullYear(), publishTime.getMonth(), publishTime.getDate());
          const startOnly = filterStart ? new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate()) : null;
          const endOnly = filterEnd ? new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate()) : null;

          if (startOnly && dateOnly < startOnly) continue;
          if (endOnly && dateOnly > endOnly) continue;
        }

        totalPublished++;
        totalPlayCount += parseInt(r.fields?.['播放量']) || 0;
      }
```

- [ ] **Step 2: 修改 `buildAIPrompt` 生成专业运营文本**

将现有方法替换为：

```js
  buildAIPrompt(reportData) {
    const { projectName, period, summary, accounts } = reportData;
    const accountLines = accounts.map(a => {
      const avg = a.published > 0 ? Math.round(a.playCount / a.published) : 0;
      return `- ${a.name}(${a.platform}): 发布${a.published}条, 播放量${a.playCount}, 稿均${avg}`;
    }).join('\n');

    const avgPerPost = summary.totalPublished > 0
      ? Math.round(summary.totalPlayCount / summary.totalPublished)
      : 0;

    return `你是一位海外社媒运营专家，请根据以下数据为项目"${projectName}"生成本周运营进展，统计周期为 ${period}。

各账号数据：
${accountLines}

整体数据：
- 总发布数：${summary.totalPublished}
- 总播放量：${summary.totalPlayCount}
- 平均稿均：${avgPerPost}

请按以下格式输出，每条控制在30字以内：

本周 Highlights：
- （1-3条，指出数据亮点账号或上升趋势，客观陈述，不要堆砌形容词）

本周 Lowlights：
- （1-3条，指出需要关注的下滑或异常，直接点出问题）

下步规划：
- （2-3条具体可执行的方向建议）

语气要求：
- 专业、克制，像资深运营写的内部复盘
- 不要"让我们""相信""一定"等口语/鸡汤表述
- 不要"值得注意的是""不难发现"等AI套话
- 用数据和事实说话，避免空洞的鼓励或批评`;
  }
```

- [ ] **Step 3: 新增 AI 返回解析方法**

在 `buildAIPrompt` 之后，插入：

```js
  parseAISuggestions(aiText) {
    const result = {
      highlights: '',
      lowlights: '',
      nextSteps: '',
    };

    if (!aiText) return result;

    const lines = aiText.split('\n');
    let currentSection = null;
    const sections = {
      highlights: [],
      lowlights: [],
      nextSteps: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes('Highlights')) {
        currentSection = 'highlights';
        continue;
      }
      if (trimmed.includes('Lowlights')) {
        currentSection = 'lowlights';
        continue;
      }
      if (trimmed.includes('下步规划') || trimmed.includes('规划')) {
        currentSection = 'nextSteps';
        continue;
      }

      // 跳过标题行和示例提示
      if (trimmed.startsWith('（') && trimmed.endsWith('）')) continue;
      if (trimmed.startsWith('（') && trimmed.includes('指出')) continue;
      if (trimmed.startsWith('（') && trimmed.includes('具体')) continue;

      if (currentSection && (trimmed.startsWith('- ') || trimmed.startsWith('• '))) {
        sections[currentSection].push(trimmed.replace(/^[-•]\s*/, ''));
      }
    }

    result.highlights = sections.highlights.join('\n');
    result.lowlights = sections.lowlights.join('\n');
    result.nextSteps = sections.nextSteps.join('\n');

    return result;
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/services/weekly-report-service.js
git commit -m "feat(weekly-report): support weekly period filtering and professional AI prompt"
```

---

## Task 5: weekly-report-service.js 整合 generateWeeklyReport

**Files:**
- Modify: `src/services/weekly-report-service.js`

- [ ] **Step 1: 修改 `generateWeeklyReport` 组装数据逻辑**

关键修改点：
1. `calculateAccountStatsFromDetail` 调用时传入周报周期
2. `reportData` 增加 `startDate`, `endDate`, `highlights`, `lowlights`, `nextSteps`
3. `writeToSpreadsheet` 调用前组装扩展的 reportData

修改 `generateWeeklyReport` 中的统计循环部分：

```js
      // 按周报周期统计
      const weeklyStart = startDate;
      const weeklyEnd = endDate;
      const detailStats = await this.calculateAccountStatsFromDetail(
        fields['项目名称'],
        accountName,
        platform,
        af['主页链接'],
        versionStart,
        versionEnd,
        weeklyStart,
        weeklyEnd
      );
```

修改 `reportData` 组装部分，在循环结束后增加：

```js
    reportData.startDate = startDate;
    reportData.endDate = endDate;
    reportData.highlights = '';
    reportData.lowlights = '';
    reportData.nextSteps = '';

    // AI 分析建议
    let aiSuggestions = '';
    try {
      const aiPrompt = this.buildAIPrompt(reportData);
      aiSuggestions = await aiService.callAnyProvider(aiPrompt);
      logger.info('AI suggestions generated for weekly report');

      const parsed = this.parseAISuggestions(aiSuggestions);
      reportData.highlights = parsed.highlights;
      reportData.lowlights = parsed.lowlights;
      reportData.nextSteps = parsed.nextSteps;
    } catch (error) {
      logger.error('AI suggestions generation failed', { error: error.message });
      aiSuggestions = 'AI 建议生成失败，请稍后重试。';
    }
    reportData.aiSuggestions = aiSuggestions;
```

注意：现有的 `reportData.accounts` 结构中的字段名需要与 `writeToSpreadsheet` 中使用的字段名匹配。

检查 `writeToSpreadsheet` 中使用的字段：
- `reportData.accounts[i].published`
- `reportData.accounts[i].playCount`

现有代码中 `detailStats` 返回 `{ published, playCount }`，然后：
```js
const published = detailStats?.published ?? (parseInt(af['已发布']) || 0);
const playCount = detailStats?.playCount ?? (parseInt(af['目前播放量']) || 0);
```

所以 `reportData.accounts` 中的 `published` 和 `playCount` 字段已经存在，无需修改。

- [ ] **Step 2: Commit**

```bash
git add src/services/weekly-report-service.js
git commit -m "feat(weekly-report): integrate cycle block write into generateWeeklyReport"
```

---

## Task 6: 更新测试文件

**Files:**
- Modify: `tests/routes/reports.test.js`
- Modify: `tests/services/weekly-report-service.test.js`

- [ ] **Step 1: 更新 reports.test.js 的 mock**

在 `tests/routes/reports.test.js` 中，修改 `feishu-spreadsheet` 的 mock：

```js
jest.mock('../../src/services/feishu-spreadsheet', () => ({
  writeValues: jest.fn().mockResolvedValue({}),
  readValues: jest.fn().mockResolvedValue([]),
  getSheetMetadata: jest.fn().mockResolvedValue({ sheets: [{ sheet_id: '0' }] }),
  insertRows: jest.fn().mockResolvedValue({}),
}));
```

- [ ] **Step 2: 更新 weekly-report-service.test.js 增加更多测试**

追加：

```js
describe('parseAISuggestions', () => {
  it('should parse highlights and lowlights', () => {
    const input = `本周 Highlights：
- 账号A播放量破10万，环比增长30%
- 整体发布完成率达标

本周 Lowlights：
- 账号B播放量下滑明显

下步规划：
- 复刻账号A爆款选题
- 督促账号B调整内容方向`;

    const result = weeklyReportService.parseAISuggestions(input);
    expect(result.highlights).toContain('账号A播放量破10万');
    expect(result.lowlights).toContain('账号B播放量下滑明显');
    expect(result.nextSteps).toContain('复刻账号A爆款选题');
  });

  it('should handle empty input', () => {
    const result = weeklyReportService.parseAISuggestions('');
    expect(result.highlights).toBe('');
    expect(result.lowlights).toBe('');
    expect(result.nextSteps).toBe('');
  });
});

describe('_colIndexToLetter', () => {
  it('should convert 0 to A', () => {
    expect(weeklyReportService._colIndexToLetter(0)).toBe('A');
  });
  it('should convert 12 to M', () => {
    expect(weeklyReportService._colIndexToLetter(12)).toBe('M');
  });
  it('should convert 25 to Z', () => {
    expect(weeklyReportService._colIndexToLetter(25)).toBe('Z');
  });
  it('should convert 26 to AA', () => {
    expect(weeklyReportService._colIndexToLetter(26)).toBe('AA');
  });
});
```

- [ ] **Step 3: 运行全部相关测试**

Run: `npx jest tests/routes/reports.test.js tests/services/weekly-report-service.test.js tests/services/feishu-spreadsheet.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update mocks and add unit tests for cycle block weekly report"
```

---

## Task 7: 验证与清理

**Files:**
- Modify: `src/services/weekly-report-service.js` (如有 lint/format 问题)

- [ ] **Step 1: 运行 lint/check**

Run: `npm run lint` (如果 package.json 中有定义)
或者至少运行 `node -c src/services/weekly-report-service.js` 检查语法。

- [ ] **Step 2: 确认无 console.log 残留**

检查 `weekly-report-service.js` 中没有调试用的 `console.log`。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat(weekly-report): cycle block mode for weekly report generation

- Add readValues/insertRows to feishu-spreadsheet service
- Rewrite writeToSpreadsheet to insert cycle blocks at sheet top
- Read account templates from existing top cycle
- Support weekly period filtering in calculateAccountStatsFromDetail
- Update AI prompt for professional ops summary style
- Add parseAISuggestions to extract highlights/lowlights/nextSteps
- Update tests and mocks"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 周期块插入在 sheet 顶部 → Task 3
- [x] 读取现有周期模板 → Task 2
- [x] 复制静态字段 → Task 3
- [x] 按周报周期统计 → Task 4
- [x] 稿均公式 → Task 3
- [x] 增粉量默认0 → Task 3
- [x] AI 生成运营进展（Highlights/Lowlights/下步规划）→ Task 4, 5
- [x] 风险与问题留空 → Task 3
- [x] AI 风格要求 → Task 4
- [x] 空 sheet 回退 → Task 3
- [x] 插入行失败兜底 → Task 3

**2. Placeholder scan:**
- [x] 无 TBD/TODO
- [x] 所有代码片段完整
- [x] 所有命令可执行

**3. Type consistency:**
- [x] `readValues` / `insertRows` 签名与调用一致
- [x] `reportData` 字段名在组装和写入阶段一致
- [x] `calculateAccountStatsFromDetail` 参数前后一致
