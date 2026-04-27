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
  logSyncError: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/sync-service', () => ({
  setProjectMgmtAppToken: jest.fn(),
  syncProject: jest.fn().mockResolvedValue({ accountsCount: 2 }),
}));

jest.mock('../../src/services/weekly-report-service', () => ({
  setProjectMgmtAppToken: jest.fn(),
  generateWeeklyReport: jest.fn().mockResolvedValue({ summary: {} }),
}));

jest.mock('../../src/services/report-service', () => ({
  setProjectMgmtAppToken: jest.fn(),
  generateReviewReport: jest.fn().mockResolvedValue({ docUrl: 'https://example.com/doc' }),
}));

describe('POST /api/webhook/button', () => {
  it('should trigger sync action', async () => {
    const res = await request(app)
      .post('/api/webhook/button?token=test-secret')
      .set('x-webhook-token', 'test-secret')
      .send({ recordId: 'rec123', action: 'sync' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should trigger weekly report action', async () => {
    const res = await request(app)
      .post('/api/webhook/button?token=test-secret')
      .set('x-webhook-token', 'test-secret')
      .send({ recordId: 'rec123', action: 'weekly' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should trigger review report action', async () => {
    const res = await request(app)
      .post('/api/webhook/button?token=test-secret')
      .set('x-webhook-token', 'test-secret')
      .send({ recordId: 'rec123', action: 'review' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should reject unknown action', async () => {
    const res = await request(app)
      .post('/api/webhook/button?token=test-secret')
      .set('x-webhook-token', 'test-secret')
      .send({ recordId: 'rec123', action: 'unknown' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });

  it('should reject without token', async () => {
    process.env.WEBHOOK_SECRET = 'test-secret';
    const res = await request(app)
      .post('/api/webhook/button')
      .send({ recordId: 'rec123', action: 'sync' });

    expect(res.statusCode).toBe(401);
    process.env.WEBHOOK_SECRET = '';
  });
});

describe('POST /api/webhook/sync/:recordId', () => {
  it('should trigger sync with valid token', async () => {
    const res = await request(app)
      .post('/api/webhook/sync/1?token=test-secret')
      .set('x-webhook-token', 'test-secret');

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('should reject without token', async () => {
    process.env.WEBHOOK_SECRET = 'test-secret';
    const res = await request(app).post('/api/webhook/sync/1');

    expect(res.statusCode).toBe(401);
    process.env.WEBHOOK_SECRET = '';
  });
});
