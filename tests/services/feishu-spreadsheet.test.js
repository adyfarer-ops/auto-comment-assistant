const feishuSpreadsheet = require('../../src/services/feishu-spreadsheet');

jest.mock('../../src/services/feishu-auth', () => ({
  getAppToken: jest.fn().mockResolvedValue('fake-token'),
}));

jest.mock('axios');

describe('feishuSpreadsheet', () => {
  const axios = require('axios');

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

  it('insertRows should call insert_dimension_range API', async () => {
    axios.mockResolvedValueOnce({
      data: { code: 0, data: {} },
    });
    await feishuSpreadsheet.insertRows('token123', 'sheetId456', 0, 10);
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/insert_dimension_range'),
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
