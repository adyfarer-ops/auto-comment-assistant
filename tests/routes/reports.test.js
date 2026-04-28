const request = require('supertest');
const app = require('../../src/app');

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: {
      code: 0,
      data: {
        document: { document_id: 'doc123' },
      },
    },
  }),
  create: jest.fn(() => ({
    post: jest.fn().mockResolvedValue({ data: { code: 0 } }),
    get: jest.fn().mockResolvedValue({ data: { code: 0 } }),
    defaults: {},
  })),
}));

jest.mock('../../src/services/feishu-bitable', () => ({
  searchRecords: jest.fn().mockImplementation((appToken, tableId, filter) => {
    if (tableId === 'tblxbkkh03Kw10lI' || (filter && filter.includes('rec123'))) {
      return [
        {
          record_id: 'rec123',
          fields: {
            '项目名称': '测试项目',
            '表格ID': 'tbl123',
            '任务执行状态': '空闲',
            '周报开始日期': '2026-04-20',
            '周报结束日期': '2026-04-26',
          },
        },
      ];
    }
    return [
      {
        record_id: 'rec456',
        fields: {
          '账号名称': 'TK-TestAccount',
          '已发布': '10',
          '目前播放量': 50000,
          '粉丝总量': 1000,
          '发布完成率': '0.8',
          '保底条数': 20,
          '负责人': '张三',
        },
      },
    ];
  }),
  updateRecord: jest.fn().mockResolvedValue({}),
  createRecord: jest.fn().mockResolvedValue({}),
  getRecord: jest.fn().mockResolvedValue({
    record: {
      record_id: 'rec123',
      fields: {
        '项目名称': '测试项目',
        '表格ID': 'tbl123',
        '任务执行状态': '空闲',
        '周报开始日期': '2026-04-20',
        '周报结束日期': '2026-04-26',
      },
    },
  }),
}));

jest.mock('../../src/services/feishu-auth', () => ({
  getAppToken: jest.fn().mockResolvedValue('fake-token'),
  getNotifyAppToken: jest.fn().mockResolvedValue('fake-notify-token'),
}));

jest.mock('../../src/services/feishu-spreadsheet', () => ({
  writeValues: jest.fn().mockResolvedValue({}),
  readValues: jest.fn().mockResolvedValue([]),
  getSheetMetadata: jest.fn().mockResolvedValue({ sheets: [{ sheet_id: '0' }] }),
  insertRows: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/ai-service', () => ({
  generateSuggestions: jest.fn().mockResolvedValue('AI 建议'),
}));

describe('POST /api/weekly-report/generate', () => {
  it('should generate weekly report', async () => {
    const res = await request(app)
      .post('/api/weekly-report/generate')
      .send({ recordId: 'rec123' });

    expect(res.statusCode).toBe(202);
    expect(res.body.code).toBe(0);
    expect(res.body.traceId).toBeDefined();
  });

  it('should require recordId', async () => {
    const res = await request(app)
      .post('/api/weekly-report/generate')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});

describe('POST /api/review-report/generate', () => {
  it('should generate review report', async () => {
    const res = await request(app)
      .post('/api/review-report/generate')
      .send({ recordId: 'rec123', templateType: '终末地' });

    expect(res.statusCode).toBe(202);
    expect(res.body.code).toBe(0);
    expect(res.body.traceId).toBeDefined();
  });

  it('should require recordId', async () => {
    const res = await request(app)
      .post('/api/review-report/generate')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
