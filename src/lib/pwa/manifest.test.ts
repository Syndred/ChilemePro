import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('manifest.json 验证', () => {
  const manifestPath = resolve(process.cwd(), 'public/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  it('应包含中文应用名称', () => {
    expect(manifest.name).toBe('吃了么 - 极简三餐饮食记录');
    expect(manifest.short_name).toBe('吃了么');
  });

  it('应包含应用描述', () => {
    expect(manifest.description).toBeTruthy();
    expect(manifest.description).toContain('AI');
  });

  it('start_url 应为根路径', () => {
    expect(manifest.start_url).toBe('/');
  });

  it('display 应为 standalone（沉浸式体验）', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('orientation 应为 portrait（竖屏）', () => {
    expect(manifest.orientation).toBe('portrait');
  });

  it('应设置主题色和背景色', () => {
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('语言应为中文', () => {
    expect(manifest.lang).toBe('zh-CN');
  });

  it('应包含健康/食物相关分类', () => {
    expect(manifest.categories).toContain('health');
    expect(manifest.categories).toContain('food');
  });

  describe('图标配置', () => {
    it('应至少包含 192x192 和 512x512 图标（PWA 最低要求）', () => {
      const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });

    it('所有图标应为 PNG 格式', () => {
      for (const icon of manifest.icons) {
        expect(icon.type).toBe('image/png');
      }
    });

    it('应包含 maskable 图标（适配 Android 自适应图标）', () => {
      const maskableIcons = manifest.icons.filter(
        (icon: { purpose?: string }) => icon.purpose?.includes('maskable')
      );
      expect(maskableIcons.length).toBeGreaterThan(0);
    });

    it('所有图标路径应以 /icons/ 开头', () => {
      for (const icon of manifest.icons) {
        expect(icon.src).toMatch(/^\/icons\//);
      }
    });
  });
});
