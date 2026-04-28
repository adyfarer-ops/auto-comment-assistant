const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/services/feishu-bitable', () => ({
  searchRecords: jest.fn().mockImplementation((appToken, tableId, filter) => {
    if (tableId === 'tbl123') {
      return [
        {
          record_id: 'rec456',
          fields: {
            '账号名称': 'TK-TestAccount',
            '已发布': '10',
            '目前播放量': 50000,
            '粉丝总量': 1000,
            '发布完成率': '0.8',
          },
        },
      ];
    }
    if (filter && filter.includes('rec123')) {
      return [
        {
          record_id: 'rec123',
          fields: {
            '项目名称': '测试项目',
            '表格ID': 'tbl123',
          },
        },
      ];
    }
    return [];
  }),
  getRecord: jest.fn().mockResolvedValue({
    record: {
      record_id: 'rec123',
      fields: {
        '项目名称': '测试项目',
        '表格ID': 'tbl123',
      },
    },
  }),
}));

describe('POST /api/summarize/account', () => {
  it('should return account stats', async () => {
    const res = await request(app)
      .post('/api/summarize/account')
      .send({ planTableId: 'tbl123', recordId: 'rec456' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toBeDefined();
  });

  it('should require planTableId and recordId', async () => {
    const res = await request(app)
      .post('/api/summarize/account')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});

describe('POST /api/summarize/project', () => {
  it('should return project stats', async () => {
    const res = await request(app)
      .post('/api/summarize/project')
      .send({ recordId: 'rec123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toBeDefined();
  });

  it('should require recordId', async () => {
    const res = await request(app)
      .post('/api/summarize/project')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
