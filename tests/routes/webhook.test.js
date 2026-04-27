const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/services/feishu-bitable', () => ({
  searchRecords: jest.fn().mockResolvedValue([
    {
      record_id: 'rec123',
      fields: {
        '项目名称': '测试项目',
        '表格ID': 'tbl123',
        '任务执行状态': '空闲',
      },
    },
  ]),
  updateRecord: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/feishu-auth', () => ({
  getAppToken: jest.fn().mockResolvedValue('fake-token'),
}));

jest.mock('../../src/services/log-service', () => ({
  setProjectMgmtAppToken: jest.fn(),
  logSyncStart: jest.fn().mockResolvedValue({}),
  logSyncSuccess: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/sync-service', () => ({
  setProjectMgmtAppToken: jest.fn(),
  syncProject: jest.fn().mockResolvedValue({ accountsCount: 2 }),
}));

describe('POST /webhook/sync/:recordId', () => {
  it('should trigger sync with valid token', async () => {
    const res = await request(app)
      .post('/webhook/sync/1?token=test-secret')
      .set('x-webhook-token', 'test-secret');

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should reject without token', async () => {
    process.env.WEBHOOK_SECRET = 'test-secret';
    const res = await request(app).post('/webhook/sync/1');

    expect(res.statusCode).toBe(401);
    process.env.WEBHOOK_SECRET = '';
  });
});
