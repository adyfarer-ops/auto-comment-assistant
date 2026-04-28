# 周报生成周期块模式设计文档

## 背景

现有 `weekly-report-service.js` 的周报写入逻辑是**覆盖式**的：每次生成周报时，清空 sheet 并写入简化版表头和账号数据。这无法满足运营团队对周报格式的要求——需要在同一张 sheet 中保留历史周期，新周期插入在顶部，每个周期包含完整的静态信息 + 统计数据 + 运营进展区块。

## 目标

将周报 sheet 写入逻辑升级为**周期块模式**：
- 同一张 sheet 自上而下保留多个历史周期
- 新周期始终插入在 sheet 最顶部
- 每个周期包含：周期标题、表头、账号数据行、运营进展（Highlights / Lowlights / 风险与问题 / 下步规划）
- 账号静态信息从 sheet 现有顶部周期复制
- 统计字段（发布量、播放量、稿均）按周报起止日期从 Base 详情表自动计算
- 增粉量默认为 0，人工后续补录
- 运营进展由 AI 根据本周数据生成

## 架构设计

### 核心变更点

```
weekly-report-service.js
  ├── generateWeeklyReport (现有入口，逻辑微调)
  ├── calculateAccountStatsFromDetail (修改：支持按周报周期过滤)
  ├── writeToSpreadsheet (重写：改为周期块模式)
  ├── readTopCycleFromSheet (新增：读取 sheet 顶部周期模板)
  ├── insertRowsAtTop (新增：在 sheet 顶部插入空行)
  ├── buildAIPrompt (修改：prompt 风格调整)
  └── createWeeklyReportDoc (保持不变)
```

### 判断逻辑

不再区分"通用模式"和"星铁模式"。**所有配置了「周报Sheet」字段的项目，统一走周期块模式**。`writeToSpreadsheet` 完全替换为新的周期块写入逻辑。

## 数据流

```
1. 用户点击生成周报按钮
   ↓
2. generateWeeklyReport 获取项目信息
   - 周报开始日期 / 周报结束日期
   - 周报 Sheet Token
   - 表格ID（Base总表）
   ↓
3. 同步周报周期数据（syncService.syncProjectIncremental）
   ↓
4. 读取 Sheet 顶部现有周期
   - 通过 feishuSpreadsheet 读取前 200 行
   - 解析出周期标题、表头、账号静态信息
   - 提取每个账号的：编号、类型、供应商、区域、内容类型、平台、userid、名称、链接
   ↓
5. 按周报周期统计每个账号
   - 对每个账号调用 calculateAccountStatsFromDetail
   - 过滤条件：发布时间 >= 周报开始日期 AND 发布时间 <= 周报结束日期
   - 返回：总发布数量、总播放量
   ↓
6. 组装新周期数据
   - 静态字段：从步骤4复制
   - 总发布数量：步骤5结果
   - 总播放量：步骤5结果
   - 稿均：sheet 公式 =总播放量/总发布数量
   - 增粉量：0
   ↓
7. AI 生成运营进展
   - 基于本周所有账号的统计数据
   - 生成 Highlights / Lowlights / 下步规划
   - 风险与问题留空
   ↓
8. 写入 Sheet
   - 在 sheet 顶部插入空行
   - 写入新周期完整数据
   ↓
9. 生成飞书 Docx 文档（保持不变）
   ↓
10. 更新项目管理表、发送通知
```

## Sheet 操作细节

### 1. 读取顶部周期

通过 `feishuSpreadsheet.readRange`（需新增该方法）读取 `Sheet1!A1:M200`，解析出：
- 周期标题行（如 `4.08-4.14`）
- 表头行（账号编号 | 账号类型 | 负责供应商 | 区域 | 内容类型 | 平台 | userid | 账号名称 | 账号链接 | 总发布数量 | 总播放量 | 稿均 | 增粉量）
- 账号数据行（连续非空行，直到遇到空行或运营标题）

### 2. 插入空行

调用飞书 API：
```
POST /sheets/v2/spreadsheets/{token}/dimension-rows
Body: {
  "dimension": {
    "sheetId": "{sheetId}",
    "majorDimension": "ROWS",
    "startIndex": 0,
    "endIndex": {accountCount + 10}
  },
  "inheritStyle": true
}
```

`accountCount + 10` 的组成：
- 周期标题：1行
- 空行：1行
- 表头：1行
- 账号数据：accountCount 行
- 空行：1行
- 运营区块：5行（二、周运营进展同步 / 本周 Highlights / 本周 Lowlights / 风险与问题 / 下步规划）
- 底部空行：1行

### 3. 写入数据

使用 `feishuSpreadsheet.writeValues` 批量写入：
- 第1行：周期标题（格式：`M.DD-M.DD`，跨月时如 `3.28-4.03`）
- 第2行：空行
- 第3行：表头
- 第4行起：账号数据（静态字段原样复制，统计字段填入数值，稿均写入公式）
- 运营区块标题行（A列）+ AI 生成内容（B列，同一条目内换行）

### 4. 周期标题格式

```js
function formatPeriodTitle(startDate, endDate) {
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

## AI Prompt 设计

```
你是一位海外社媒运营专家，请根据以下数据为项目"{projectName}"生成本周运营进展，统计周期为 {period}。

各账号数据：
{accountLines}

整体数据：
- 总发布数：{totalPublished}
- 总播放量：{totalPlayCount}
- 平均稿均：{avgPerPost}

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
- 用数据和事实说话，避免空洞的鼓励或批评
```

AI 返回后，解析为三个部分，写入对应运营标题行的 **B列**（同一行内写入，多条建议用 `\n` 换行分隔）：
- "本周 Highlights" 行 → B列写入 Highlights 内容
- "本周 Lowlights" 行 → B列写入 Lowlights 内容
- "下步规划" 行 → B列写入下步规划内容
- "风险与问题" 行 → B列留空

## 边界处理

| 场景 | 处理方式 |
|---|---|
| sheet 为空 / 找不到周期模板 | 回退到简化模式：清空 sheet，写入表头 + 当前周期账号数据（从 Base 总表读取账号列表） |
| 详情表统计失败（某账号） | 该账号发布量/播放量填 0，不影响其他账号和整体写入 |
| AI 生成失败 | 运营进展区块（Highlights / Lowlights / 下步规划）留空，风险与问题也留空 |
| 插入行 API 失败 | 兜底方案：读取整个 sheet → 在前面拼接新周期数据 → 整体写回（可能较慢，但能work） |
| 稿均除零（发布量为0） | 公式保留，sheet 自动显示为 `#DIV/0!` 或 0，由 sheet 自身处理 |

## API 变更

### feishu-spreadsheet.js 新增方法

```js
// 读取指定 range 的值
async readValues(spreadsheetToken, range)

// 在指定位置插入行
async insertRows(spreadsheetToken, sheetId, startIndex, endIndex)
```

### weekly-report-service.js 修改

- `calculateAccountStatsFromDetail`：增加 `weeklyStart` 和 `weeklyEnd` 参数，优先按周报周期过滤
- `writeToSpreadsheet`：完全重写为周期块逻辑
- `buildAIPrompt`：调整 prompt 内容和风格要求

## 不做的范围（YAGNI）

- 不在项目管理表新增"周报模板类型"字段（当前所有项目统一走周期块模式）
- 不硬编码任何项目专属信息（如20个固定账号），所有账号从 sheet 读取
- 不自动计算增粉量（统一默认为0，人工补录）
- 不删除 sheet 中过旧的周期（保留全部历史数据）
