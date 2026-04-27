const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/services/feishu-bitable', () => ({
  searchRecords: jest.fn().mockResolvedValue([
    {
      record_id: 'rec123',
      fields: {
        '项目名称': '测试项目',
        '表格ID': 'tbl123',
      },
    },
  ]),
}));

jest.mock('../../src/services/ai-service', () => ({
  generateSuggestions: jest.fn().mockResolvedValue('AI 建议内容'),
}));

describe('POST /api/suggest/project', () => {
  it('should return suggestions', async () => {
    const res = await request(app)
      .post('/api/suggest/project')
      .send({ recordId: 'rec123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.suggestions).toBe('AI 建议内容');
  });

  it('should require recordId', async () => {
    const res = await request(app)
      .post('/api/suggest/project')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
  });
});
