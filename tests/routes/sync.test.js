const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/services/feishu-bitable', () => ({
  searchRecords: jest.fn().mockImplementation((appToken, tableId, filter) => {
    if (tableId === 'tblxbkkh03Kw10lI' || (filter && filter.includes('tbl123'))) {
      return [
        {
          record_id: 'rec123',
          fields: {
            '项目名称': '测试项目',
            '表格ID': 'tbl123',
            '任务执行状态': '空闲',
          },
        },
      ];
    }
    return [
      {
        record_id: 'rec456',
        fields: {
          '账号名称': 'TK-TestAccount',
          '主页链接': 'https://www.tiktok.com/@test',
          '已发布': '10',
          '目前播放量': 50000,
          '粉丝总量': 1000,
          '发布完成率': '0.8',
        },
      },
    ];
  }),
  updateRecord: jest.fn().mockResolvedValue({}),
  getAppTables: jest.fn().mockResolvedValue({ items: [] }),
}));

jest.mock('../../src/services/tikhub-api', () => ({
  request: jest.fn().mockResolvedValue({ data: {} }),
  getTikTokUserInfo: jest.fn().mockResolvedValue({}),
  getTikTokUserVideos: jest.fn().mockResolvedValue({ data: { videos: [] } }),
}));

describe('POST /api/sync/account', () => {
  it('should sync single account', async () => {
    const res = await request(app)
      .post('/api/sync/account')
      .send({ tableId: 'tbl123', recordId: 'rec456' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should require tableId and recordId', async () => {
    const res = await request(app)
      .post('/api/sync/account')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});

describe('POST /api/sync/project', () => {
  it('should start project sync', async () => {
    const res = await request(app)
      .post('/api/sync/project')
      .send({ tableId: 'tbl123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should require tableId', async () => {
    const res = await request(app)
      .post('/api/sync/project')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});

describe('POST /api/sync/project-incremental', () => {
  it('should start incremental sync', async () => {
    const res = await request(app)
      .post('/api/sync/project-incremental')
      .send({ tableId: 'tbl123', startDate: '2026-04-20', endDate: '2026-04-26' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });
});

describe('POST /api/sync/clear-progress', () => {
  it('should clear sync progress', async () => {
    const res = await request(app)
      .post('/api/sync/clear-progress')
      .send({ projectName: '测试项目' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });
});
