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

describe('parseAISuggestions', () => {
  it('should parse highlights and lowlights', () => {
    const input = `本周 Highlights：
- 账号A播放量破10万，环比增长30%
- 整体发布完成率达标

本周 Lowlights：
- 账号B播放量下滑明显

下步规划：
- 复刻账号A爆款选题
- 督促账号B调整内容方向`;

    const result = weeklyReportService.parseAISuggestions(input);
    expect(result.highlights).toContain('账号A播放量破10万');
    expect(result.lowlights).toContain('账号B播放量下滑明显');
    expect(result.nextSteps).toContain('复刻账号A爆款选题');
  });

  it('should handle empty input', () => {
    const result = weeklyReportService.parseAISuggestions('');
    expect(result.highlights).toBe('');
    expect(result.lowlights).toBe('');
    expect(result.nextSteps).toBe('');
  });
});

describe('_colIndexToLetter', () => {
  it('should convert 0 to A', () => {
    expect(weeklyReportService._colIndexToLetter(0)).toBe('A');
  });
  it('should convert 12 to M', () => {
    expect(weeklyReportService._colIndexToLetter(12)).toBe('M');
  });
  it('should convert 25 to Z', () => {
    expect(weeklyReportService._colIndexToLetter(25)).toBe('Z');
  });
  it('should convert 26 to AA', () => {
    expect(weeklyReportService._colIndexToLetter(26)).toBe('AA');
  });
});