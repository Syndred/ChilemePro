/**
 * PWA 配置常量
 * 集中管理 PWA 相关的配置值
 */

/** 应用主题色 - 绿色，代表健康饮食 */
export const PWA_THEME_COLOR = '#22c55e';

/** 应用背景色 */
export const PWA_BACKGROUND_COLOR = '#ffffff';

/** 应用名称 */
export const PWA_APP_NAME = '吃了么 - 极简三餐饮食记录';

/** 应用短名称 */
export const PWA_SHORT_NAME = '吃了么';

/** 应用描述 */
export const PWA_DESCRIPTION = 'AI 拍照识别热量、健康激励返现、轻社交饮食记录应用';

/** manifest.json 路径 */
export const PWA_MANIFEST_PATH = '/manifest.json';

/** 显示模式 - standalone 提供沉浸式体验 */
export const PWA_DISPLAY_MODE = 'standalone' as const;

/** 支持的图标尺寸 */
export const PWA_ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512] as const;

/** Apple 启动画面配置 */
export const PWA_APPLE_SPLASH_SCREENS = [
  { width: 1170, height: 2532, ratio: 3, device: 'iPhone 12/13/14' },
  { width: 1284, height: 2778, ratio: 3, device: 'iPhone 12/13/14 Pro Max' },
  { width: 1179, height: 2556, ratio: 3, device: 'iPhone 14 Pro' },
  { width: 1290, height: 2796, ratio: 3, device: 'iPhone 14 Pro Max' },
  { width: 750, height: 1334, ratio: 2, device: 'iPhone 8' },
  { width: 1125, height: 2436, ratio: 3, device: 'iPhone X/XS/11 Pro' },
] as const;

/**
 * Workbox 风格的缓存策略配置
 * 用于 Service Worker 中的缓存决策
 */
export const CACHE_STRATEGIES = {
  /** 静态资源 - 缓存优先 */
  staticAssets: {
    strategy: 'CacheFirst' as const,
    cacheName: 'static-assets-v1',
    maxEntries: 100,
    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 天
    urlPatterns: [/\.(js|css|woff2?|png|jpg|jpeg|svg|ico)$/],
  },
  /** 页面导航 - 网络优先 */
  pages: {
    strategy: 'NetworkFirst' as const,
    cacheName: 'pages-v1',
    maxEntries: 50,
    maxAgeSeconds: 24 * 60 * 60, // 1 天
    networkTimeoutSeconds: 3,
  },
  /** API 请求 - 网络优先 */
  api: {
    strategy: 'NetworkFirst' as const,
    cacheName: 'api-v1',
    maxEntries: 200,
    maxAgeSeconds: 5 * 60, // 5 分钟
    networkTimeoutSeconds: 5,
  },
  /** 图片 - 缓存优先 */
  images: {
    strategy: 'CacheFirst' as const,
    cacheName: 'images-v1',
    maxEntries: 200,
    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 天
    urlPatterns: [/\.(png|jpg|jpeg|gif|webp|svg)$/],
  },
} as const;

export type CacheStrategy = typeof CACHE_STRATEGIES;
export type CacheStrategyName = keyof CacheStrategy;
