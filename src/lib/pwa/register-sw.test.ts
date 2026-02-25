import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isServiceWorkerSupported,
  registerServiceWorker,
  unregisterServiceWorker,
} from './register-sw';

describe('Service Worker 注册工具', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('isServiceWorkerSupported', () => {
    it('当 navigator.serviceWorker 存在时应返回 true', () => {
      Object.defineProperty(global, 'navigator', {
        value: { serviceWorker: {} },
        writable: true,
        configurable: true,
      });
      expect(isServiceWorkerSupported()).toBe(true);
    });

    it('当 navigator.serviceWorker 不存在时应返回 false', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      expect(isServiceWorkerSupported()).toBe(false);
    });
  });

  describe('registerServiceWorker', () => {
    it('当 Service Worker 不支持时应返回 null', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      const result = await registerServiceWorker();
      expect(result).toBeNull();
    });

    it('应使用默认 SW URL 注册', async () => {
      const mockRegistration = {
        installing: null,
        onupdatefound: null,
      };
      const registerMock = vi.fn().mockResolvedValue(mockRegistration);

      Object.defineProperty(global, 'navigator', {
        value: {
          serviceWorker: {
            register: registerMock,
            controller: null,
          },
        },
        writable: true,
        configurable: true,
      });

      await registerServiceWorker();
      expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    it('应使用自定义 SW URL 注册', async () => {
      const mockRegistration = {
        installing: null,
        onupdatefound: null,
      };
      const registerMock = vi.fn().mockResolvedValue(mockRegistration);

      Object.defineProperty(global, 'navigator', {
        value: {
          serviceWorker: {
            register: registerMock,
            controller: null,
          },
        },
        writable: true,
        configurable: true,
      });

      await registerServiceWorker({ swUrl: '/custom-sw.js' });
      expect(registerMock).toHaveBeenCalledWith('/custom-sw.js', { scope: '/' });
    });

    it('注册失败时应调用 onError 回调', async () => {
      const error = new Error('Registration failed');
      const registerMock = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();

      Object.defineProperty(global, 'navigator', {
        value: {
          serviceWorker: {
            register: registerMock,
          },
        },
        writable: true,
        configurable: true,
      });

      const result = await registerServiceWorker({ onError });
      expect(result).toBeNull();
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('unregisterServiceWorker', () => {
    it('当 Service Worker 不支持时应返回 false', async () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      const result = await unregisterServiceWorker();
      expect(result).toBe(false);
    });

    it('应成功注销 Service Worker', async () => {
      const unregisterMock = vi.fn().mockResolvedValue(true);
      Object.defineProperty(global, 'navigator', {
        value: {
          serviceWorker: {
            ready: Promise.resolve({ unregister: unregisterMock }),
          },
        },
        writable: true,
        configurable: true,
      });

      const result = await unregisterServiceWorker();
      expect(result).toBe(true);
      expect(unregisterMock).toHaveBeenCalled();
    });
  });
});
