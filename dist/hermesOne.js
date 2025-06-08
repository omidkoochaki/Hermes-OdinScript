(function () {
  const scriptTag = document.currentScript || document.querySelector('script[src*="hermesOne.min.js"]');
  const ENDPOINT = "http://91.107.181.122:7777/api/v1/event/";
  const SCROLL_THRESHOLD = 0.5;
  const TIME_ON_PAGE_THRESHOLD = 10 * 1000;
  const SEND_INTERVAL = 10 * 1000;
  const OdinKey = scriptTag?.dataset.odinKey || '';
  const eventQueue = [];

  function uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  const userId = localStorage.getItem("ab_user_id") || (() => {
    const id = uuid();
    localStorage.setItem("ab_user_id", id);
    return id;
  })();

  const now = Date.now();
  const SESSION_TIMEOUT = 30 * 60 * 1000;
  let sessionId = localStorage.getItem("ab_session_id");
  let lastActivity = parseInt(localStorage.getItem("ab_last_activity") || "0", 10);

  if (!sessionId || now - lastActivity > SESSION_TIMEOUT) {
    sessionId = uuid();
  }

  localStorage.setItem("ab_session_id", sessionId);
  localStorage.setItem("ab_last_activity", now.toString());

  let pageEnterTime = Date.now();

  function getDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(ua)) return "Tablet";
    if (/mobile|iphone|android/.test(ua)) return "Mobile";
    return "Desktop";
  }

  function buildEvent(event, el = null, custom = {}) {
    return {
      event,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      element: el ? {
        tag: el.tagName,
        id: el.id || null,
        class: el.className || null,
        text: el.innerText?.substring(0, 100) || null
      } : null,
      page: {
        url: location.href,
        referrer: document.referrer || null,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scroll: {
          x: window.scrollX,
          y: window.scrollY
        },
        utm: Object.fromEntries(new URLSearchParams(location.search).entries())
      },
      device: {
        type: getDeviceType(),
        language: navigator.language,
        platform: navigator.platform,
        userAgent: navigator.userAgent
      },
      ...custom
    };
  }

  function enqueue(data) {
    eventQueue.push(data);
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, eventQueue.length);
    const payload = { data: batch, OdinKey };
    try {
      const json = JSON.stringify(payload);
      navigator.sendBeacon?.(ENDPOINT, json) ||
      fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "OdinKey": OdinKey
        },
        body: json
      });
    } catch (e) {}
  }

  setInterval(flushQueue, SEND_INTERVAL);

  function handleClick(e) {
    localStorage.setItem("ab_last_activity", Date.now().toString());
    enqueue(buildEvent("click", e.target, {
      coordinates: { x: e.clientX, y: e.clientY }
    }));
  }

  let scrollTracked = false;
  function handleScroll() {
    if (scrollTracked) return;
    const scrollDepth = window.scrollY + window.innerHeight;
    const totalHeight = document.body.scrollHeight;
    if (scrollDepth / totalHeight >= SCROLL_THRESHOLD) {
      scrollTracked = true;
      enqueue(buildEvent("scroll-depth", null, { depth: SCROLL_THRESHOLD }));
    }
  }

  setTimeout(() => {
    enqueue(buildEvent("engaged"));
  }, TIME_ON_PAGE_THRESHOLD);

  window.addEventListener("beforeunload", () => {
    const duration = Date.now() - pageEnterTime;
    enqueue(buildEvent("page-exit", null, { duration }));
    flushQueue();
  });

  window.abTracker = {
    track: (eventName, extra = {}) => {
      enqueue(buildEvent(eventName, null, { custom: extra }));
    },
    conversion: (goal = "signup", value = null) => {
      enqueue(buildEvent("conversion", null, { goal, value }));
    },
    optOut: () => {
      localStorage.setItem("ab_optout", "1");
    },
    optIn: () => {
      localStorage.removeItem("ab_optout");
    }
  };

  function registerView() {
    pageEnterTime = Date.now();
    enqueue(buildEvent("view"));
  }

  function registerPageExit() {
    const duration = Date.now() - pageEnterTime;
    enqueue(buildEvent("page-exit", null, { duration }));
  }

  function observeUrlChanges() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function handleRouteChange() {
      registerPageExit();
      registerView();
    }

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleRouteChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleRouteChange();
    };

    window.addEventListener("popstate", () => {
      handleRouteChange();
    });
  }

  if (!localStorage.getItem("ab_optout")) {
    document.addEventListener("DOMContentLoaded", () => {
      registerView();              // first view
      observeUrlChanges();        // SPA support
      document.body.addEventListener("click", handleClick);
      document.addEventListener("scroll", handleScroll, { passive: true });
    });
  }
})();
