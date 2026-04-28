const weeklyReportService = require('../../src/services/weekly-report-service');

describe('WeeklyReportService helpers', () => {
  describe('formatPeriodTitle', () => {
    it('should format same month period', () => {
      const result = weeklyReportService.formatPeriodTitle('2026-04-21', '2026-04-27');
      expect(result).toBe('4.21-27');
    });

    it('should format cross month period', () => {
      const result = weeklyReportService.formatPeriodTitle('2026-03-28', '2026-04-03');
      expect(result).toBe('3.28-4.03');
    });
  });
});