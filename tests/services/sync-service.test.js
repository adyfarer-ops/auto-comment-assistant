const syncService = require('../../src/services/sync-service');

describe('SyncService', () => {
  describe('calculateDateStats', () => {
    it('should group works by date', () => {
      const works = [
        { publishTime: '2026-04-18' },
        { publishTime: '2026-04-18' },
        { publishTime: '2026-04-19' },
      ];

      const stats = syncService.calculateDateStats(works);
      expect(stats['4月18日']).toBe('2条');
      expect(stats['4月19日']).toBe('1条');
    });

    it('should return empty for no works', () => {
      const stats = syncService.calculateDateStats([]);
      expect(Object.keys(stats).length).toBe(0);
    });
  });

  describe('calculateVersionProgress', () => {
    it('should calculate progress between dates', () => {
      const start = Date.now() - 86400000;
      const end = Date.now() + 86400000;

      const progress = syncService.calculateVersionProgress({
        '版本开始日期': start,
        '版本结束日期': end,
      });

      expect(parseFloat(progress)).toBeGreaterThan(0);
      expect(parseFloat(progress)).toBeLessThan(1);
    });

    it('should return 0 before start', () => {
      const start = Date.now() + 86400000;
      const end = Date.now() + 172800000;

      const progress = syncService.calculateVersionProgress({
        '版本开始日期': start,
        '版本结束日期': end,
      });

      expect(progress).toBe(0);
    });

    it('should return 1 after end', () => {
      const start = Date.now() - 172800000;
      const end = Date.now() - 86400000;

      const progress = syncService.calculateVersionProgress({
        '版本开始日期': start,
        '版本结束日期': end,
      });

      expect(progress).toBe(1);
    });

    it('should return null for missing dates', () => {
      const progress = syncService.calculateVersionProgress({});
      expect(progress).toBeNull();
    });
  });
});
