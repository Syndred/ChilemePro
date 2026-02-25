/**
 * Service Worker 注册工具
 * 在客户端注册 Service Worker，支持缓存策略和离线访问
 */

export interface SWRegistrationOptions {
  /** Service Worker 文件路径 */
  swUrl?: string;
  /** 注册成功回调 */
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  /** 注册失败回调 */
  onError?: (error: Error) => void;
  /** 有更新可用回调 */
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
}

const DEFAULT_SW_URL = '/sw.js';

/**
 * 检查当前环境是否支持 Service Worker
 */
export function isServiceWorkerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator
  );
}

/**
 * 注册 Service Worker
 */
export async function registerServiceWorker(
  options: SWRegistrationOptions = {}
): Promise<ServiceWorkerRegistration | null> {
  const {
    swUrl = DEFAULT_SW_URL,
    onSuccess,
    onError,
    onUpdate,
  } = options;

  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/',
    });

    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // 新内容可用，通知用户刷新
            onUpdate?.(registration);
          } else {
            // 首次安装成功
            onSuccess?.(registration);
          }
        }
      };
    };

    return registration;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    return null;
  }
}

/**
 * 注销 Service Worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.unregister();
  } catch {
    return false;
  }
}
