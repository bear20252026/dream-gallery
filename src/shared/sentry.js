// sentry.js — 错误追踪与性能监控(2026-08-22 大厂标准)
// 使用 Sentry 捕获前端错误和性能数据
// 用法: import { initSentry } from './shared/sentry.js'
//        initSentry();
// 配置: 在 index.html 中添加 <meta name="sentry-dsn" content="https://xxx@sentry.io/xxx">
//       或 URL 加 ?sentry-dsn=https://xxx@sentry.io/xxx
// 未配置 DSN 时不加载 Sentry(零开销)

let sentryLoaded = false;

/**
 * 初始化 Sentry 错误追踪
 * 优先级: URL 参数 > meta 标签 > 环境变量
 */
export function initSentry() {
  if (sentryLoaded) return;

  // 获取 DSN
  const urlDsn = new URLSearchParams(location.search).get('sentry-dsn');
  const metaDsn = document.querySelector('meta[name="sentry-dsn"]')?.content;
  const dsn = urlDsn || metaDsn;

  if (!dsn) {
    console.log('[sentry] 未配置 DSN,跳过初始化');
    return;
  }

  // 动态加载 Sentry SDK(避免未使用时增加 bundle 体积)
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.40.0/bundle.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    if (typeof Sentry === 'undefined') return;

    Sentry.init({
      dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
      tracesSampleRate: 0.1, // 10% 性能采样
      replaysSessionSampleRate: 0.01, // 1% 会话回放
      replaysOnErrorSampleRate: 1.0, // 错误时 100% 回放
      environment: location.hostname === 'cloudbear.cloud' ? 'production' : 'development',
      release: window.__BUILD__ || 'unknown',
      // 过滤噪声错误
      beforeSend(event) {
        // 忽略 ResizeObserver 循环错误(浏览器 bug,无害)
        if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) return null;
        // 忽略 WebGL 上下文丢失(已自动刷新)
        if (event.exception?.values?.[0]?.value?.includes('context lost')) return null;
        return event;
      },
    });

    sentryLoaded = true;
    console.log('[sentry] 已初始化');
  };

  script.onerror = () => {
    console.warn('[sentry] SDK 加载失败');
  };

  document.head.appendChild(script);
}

/**
 * 手动上报错误(不依赖 Sentry SDK 加载)
 * @param {Error} error
 * @param {Object} [context]
 */
export function reportError(error, context = {}) {
  console.error('[error]', error.message, context);
  if (sentryLoaded && typeof Sentry !== 'undefined') {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  }
}
