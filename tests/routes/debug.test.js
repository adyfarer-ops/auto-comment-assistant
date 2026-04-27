const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/services/feishu-bitable', () => ({
  getAppTables: jest.fn().mockResolvedValue({
    items: [
      { table_id: 'tbl1', name: '项目管理' },
      { table_id: 'tbl2', name: '项目规划' },
    ],
  }),
  searchRecords: jest.fn().mockResolvedValue([
    {
      record_id: 'rec1',
      fields: {
        '项目名称': '测试项目',
        '同步时间': 1714204800000,
      },
    },
  ]),
  updateRecord: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/feishu-auth', () => ({
  getAppToken: jest.fn().mockResolvedValue('fake-token'),
  tokens: { clear: jest.fn() },
}));

jest.mock('../../src/services/tikhub-api', () => ({
  request: jest.fn().mockResolvedValue({ status: 'ok' }),
}));

jest.mock('../../src/services/youtube-api', () => ({
  getChannelByHandle: jest.fn().mockRejectedValue(new Error('mock')),
}));

describe('GET /api/debug/tables', () => {
  it('should return table list', async () => {
    const res = await request(app).get('/api/debug/tables');
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/debug/records/:tableId', () => {
  it('should return records', async () => {
    const res = await request(app).get('/api/debug/records/tbl1');
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/debug/migrate-sync-time', () => {
  it('should migrate sync time fields', async () => {
    const res = await request(app)
      .post('/api/debug/migrate-sync-time')
      .send({ tableId: 'tbl1', fieldName: '同步时间' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(typeof res.body.data.migrated).toBe('number');
  });

  it('should require tableId and fieldName', async () => {
    const res = await request(app)
      .post('/api/debug/migrate-sync-time')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
