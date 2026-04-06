(function () {
  const SESSION_KEY = 'ket_analytics_session';
  const QUEUE_LIMIT = 10;
  const FLUSH_INTERVAL = 5000;
  const PAGE_START = Date.now();
  const state = {
    sessionId: getSessionId(),
    queue: [],
    flushTimer: null,
    interactions: 0,
    pagePath: location.pathname,
    deviceType: detectDeviceType(),
    hasTrackedView: false,
  };

  function getSessionId() {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  function detectDeviceType() {
    const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    if (width <= 767) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }

  function track(eventName, options) {
    const event = normalizeEvent(eventName, options || {});
    if (!event) return;
    state.queue.push(event);
    if (shouldCountInteraction(eventName, options || {})) state.interactions += 1;
    if (state.queue.length >= QUEUE_LIMIT || options?.immediate) {
      flush(Boolean(options?.keepalive));
      return;
    }
    scheduleFlush();
  }

  function shouldCountInteraction(eventName, options) {
    if (options.countInteraction === false) return false;
    if (options.countInteraction === true) return true;
    return !['page_view', 'page_load', 'page_leave', 'low_engagement_bounce'].includes(eventName)
      && options.eventGroup !== 'error'
      && options.eventGroup !== 'performance';
  }

  function normalizeEvent(eventName, options) {
    if (!eventName) return null;
    return {
      pagePath: state.pagePath,
      eventName: String(eventName),
      eventGroup: options.eventGroup || 'behavior',
      label: options.label || null,
      value: Number.isFinite(options.value) ? Math.round(options.value) : null,
      deviceType: state.deviceType,
      meta: {
        ...limitMeta(options.meta || {}),
        href: location.href,
      },
    };
  }

  function limitMeta(meta) {
    const output = {};
    Object.entries(meta).slice(0, 20).forEach(([key, value]) => {
      if (value == null) return;
      if (typeof value === 'string') output[key] = value.slice(0, 300);
      if (typeof value === 'number' || typeof value === 'boolean') output[key] = value;
    });
    return output;
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => flush(false), FLUSH_INTERVAL);
  }

  async function flush(keepalive) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;

    if (!state.queue.length) return;
    const payload = { events: state.queue.splice(0, state.queue.length) };
    const headers = { 'Content-Type': 'application/json', 'X-Analytics-Session': state.sessionId };
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive,
      });
    } catch {
      state.queue.unshift(...payload.events);
    }
  }

  function trackPageView() {
    if (state.hasTrackedView) return;
    state.hasTrackedView = true;
    track('page_view', {
      meta: {
        referrer: document.referrer || '',
        title: document.title,
        viewportWidth: window.innerWidth || 0,
        viewportHeight: window.innerHeight || 0,
      },
      immediate: true,
    });
  }

  function trackPageLeave() {
    const durationSeconds = Math.round((Date.now() - PAGE_START) / 1000);
    track('page_leave', {
      value: durationSeconds,
      meta: {
        interactions: state.interactions,
        hidden: document.visibilityState === 'hidden',
      },
      keepalive: true,
      immediate: true,
    });
    if (durationSeconds <= 15 && state.interactions <= 1) {
      track('low_engagement_bounce', {
        eventGroup: 'friction',
        value: durationSeconds,
        keepalive: true,
        immediate: true,
      });
    }
  }

  function trackPerformance() {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!navigation) return;
    const loadEventMs = Math.round(navigation.loadEventEnd || 0);
    if (!loadEventMs) return;
    track('page_load', {
      eventGroup: 'performance',
      value: Math.round(loadEventMs / 1000),
      meta: {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd || 0),
        loadEventMs,
      },
    });
    if (loadEventMs >= 4000) {
      track('page_load_slow', {
        eventGroup: 'friction',
        value: loadEventMs,
      });
    }
  }

  window.addEventListener('error', (event) => {
    track('js_error', {
      eventGroup: 'error',
      label: event.message || 'unknown',
      meta: {
        source: event.filename || '',
        line: event.lineno || 0,
        column: event.colno || 0,
      },
      immediate: true,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    track('promise_rejection', {
      eventGroup: 'error',
      label: String(event.reason || 'promise rejection').slice(0, 120),
      immediate: true,
    });
  });

  window.addEventListener('pagehide', () => {
    trackPageLeave();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });

  document.addEventListener('DOMContentLoaded', () => {
    trackPageView();
  });

  window.addEventListener('load', () => {
    setTimeout(trackPerformance, 0);
  });

  window.KETAnalytics = {
    track,
    flush,
    getSessionId: () => state.sessionId,
  };
})();
