const platformResolver = require('../../src/services/platform-resolver');

describe('PlatformResolver', () => {
  describe('detectPlatform', () => {
    it('should detect TikTok', () => {
      const p = platformResolver.detectPlatform('https://www.tiktok.com/@user');
      expect(p.code).toBe('TK');
    });

    it('should detect YouTube', () => {
      const p = platformResolver.detectPlatform('https://www.youtube.com/@user');
      expect(p.code).toBe('YTB');
    });

    it('should detect Instagram', () => {
      const p = platformResolver.detectPlatform('https://www.instagram.com/user');
      expect(p.code).toBe('INS');
    });

    it('should return null for unknown', () => {
      const p = platformResolver.detectPlatform('https://example.com');
      expect(p).toBeNull();
    });
  });

  describe('extractUsername', () => {
    it('should extract TikTok username', () => {
      const u = platformResolver.extractUsername('https://www.tiktok.com/@user', 'TK');
      expect(u).toBe('@user');
    });

    it('should extract YouTube handle', () => {
      const u = platformResolver.extractUsername('https://www.youtube.com/@user', 'YTB');
      expect(u).toBe('@user');
    });
  });
});
