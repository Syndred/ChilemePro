'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa/register-sw';

/**
 * Service Worker 注册组件
 * 在客户端挂载后自动注册 Service Worker
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker({
        onSuccess: () => {
          console.log('[PWA] Service Worker 注册成功');
        },
        onError: (error) => {
          console.error('[PWA] Service Worker 注册失败:', error);
        },
        onUpdate: () => {
          console.log('[PWA] 新版本可用，请刷新页面');
        },
      });
    }
  }, []);

  return null;
}
