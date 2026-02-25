import { describe, it, expect } from 'vitest';
import {
  PWA_THEME_COLOR,
  PWA_BACKGROUND_COLOR,
  PWA_APP_NAME,
  PWA_SHORT_NAME,
  PWA_DESCRIPTION,
  PWA_MANIFEST_PATH,
  PWA_DISPLAY_MODE,
  PWA_ICON_SIZES,
  CACHE_STRATEGIES,
} from './pwa-config';

describe('PWA 配置', () => {
  it('应用名称应为中文', () => {
    expect(PWA_APP_NAME).toBe('吃了么 - 极简三餐饮食记录');
    expect(PWA_SHORT_NAME).toBe('吃了么');
  });

  it('主题色应为绿色（健康主题）', () => {
    expect(PWA_THEME_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(PWA_THEME_COLOR).toBe('#22c55e');
  });

  it('背景色应为白色', () => {
    expect(PWA_BACKGROUND_COLOR).toBe('#ffffff');
  });

  it('描述应包含核心功能关键词', () => {
    expect(PWA_DESCRIPTION).toContain('AI');
    expect(PWA_DESCRIPTION).toContain('饮食');
  });

  it('manifest 路径应正确', () => {
    expect(PWA_MANIFEST_PATH).toBe('/manifest.json');
  });

  it('显示模式应为 standalone（沉浸式）', () => {
    expect(PWA_DISPLAY_MODE).toBe('standalone');
  });

  it('应包含所有必需的图标尺寸', () => {
    expect(PWA_ICON_SIZES).toContain(192);
    expect(PWA_ICON_SIZES).toContain(512);
    // 至少包含 192 和 512 是 PWA 最低要求
    expect(PWA_ICON_SIZES.length).toBeGreaterThanOrEqual(2);
  });

  describe('缓存策略配置', () => {
    it('静态资源应使用 CacheFirst 策略', () => {
      expect(CACHE_STRATEGIES.staticAssets.strategy).toBe('CacheFirst');
    });

    it('页面导航应使用 NetworkFirst 策略', () => {
      expect(CACHE_STRATEGIES.pages.strategy).toBe('NetworkFirst');
    });

    it('API 请求应使用 NetworkFirst 策略', () => {
      expect(CACHE_STRATEGIES.api.strategy).toBe('NetworkFirst');
    });

    it('图片应使用 CacheFirst 策略', () => {
      expect(CACHE_STRATEGIES.images.strategy).toBe('CacheFirst');
    });

    it('每个策略应有缓存名称和条目限制', () => {
      for (const [, config] of Object.entries(CACHE_STRATEGIES)) {
        expect(config.cacheName).toBeTruthy();
        expect(config.maxEntries).toBeGreaterThan(0);
        expect(config.maxAgeSeconds).toBeGreaterThan(0);
      }
    });
  });
});
