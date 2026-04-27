const feishuAuth = require('../../src/services/feishu-auth');
const axios = require('axios');

jest.mock('axios');
jest.mock('../../config', () => ({
  feishu: {
    appId: 'cli_test',
    appSecret: 'test_secret',
    notifyAppId: 'cli_notify_test',
    notifyAppSecret: 'notify_secret',
  },
}));

describe('FeishuAuthService', () => {
  beforeEach(() => {
    feishuAuth.tokens.clear();
    jest.clearAllMocks();
  });

  it('should get token from API on first call', async () => {
    axios.post.mockResolvedValue({
      data: { code: 0, tenant_access_token: 'token_123', expire: 7200 },
    });

    const token = await feishuAuth.getAppToken();
    expect(token).toBe('token_123');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('should reuse cached token', async () => {
    axios.post.mockResolvedValue({
      data: { code: 0, tenant_access_token: 'token_123', expire: 7200 },
    });

    await feishuAuth.getAppToken();
    const token = await feishuAuth.getAppToken();
    expect(token).toBe('token_123');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('should refresh expired token', async () => {
    axios.post.mockResolvedValue({
      data: { code: 0, tenant_access_token: 'token_old', expire: 1 },
    });

    await feishuAuth.getAppToken();

    // Wait for token to expire
    await new Promise((r) => setTimeout(r, 1100));

    axios.post.mockResolvedValue({
      data: { code: 0, tenant_access_token: 'token_new', expire: 7200 },
    });

    const token = await feishuAuth.getAppToken();
    expect(token).toBe('token_new');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('should throw error on API failure', async () => {
    axios.post.mockResolvedValue({
      data: { code: 1, msg: 'app not found' },
    });

    await expect(feishuAuth.getAppToken()).rejects.toThrow('app not found');
  });
});
