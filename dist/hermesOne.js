(function () {
  const scriptTag = document.currentScript || document.querySelector('script[src*="hermesOne.min.js"]');
  const ENDPOINT = "http://91.107.181.122:7778/api/v1/project/test";
  const SCROLL_THRESHOLD = 0.5;
  const TIME_ON_PAGE_THRESHOLD = 10 * 1000;
  const SEND_INTERVAL = 10 * 1000; // هر ۱۰ ثانیه
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
        }
      },
      device: {
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

    const batch = eventQueue.splice(0, eventQueue.length); // تمام ایونت‌ها رو بگیر و صف رو خالی کن

    const payload = {
      data: batch,
      OdinKey: OdinKey
    };

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

  // --- Trackers
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
    flushQueue(); // هرچی مونده سریعاً بفرست
  });

  window.abTracker = {
    track: (eventName, extra = {}) => {
      enqueue(buildEvent(eventName, null, { custom: extra }));
    },
    optOut: () => {
      localStorage.setItem("ab_optout", "1");
    },
    optIn: () => {
      localStorage.removeItem("ab_optout");
    }
  };

  if (!localStorage.getItem("ab_optout")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.addEventListener("click", handleClick);
      document.addEventListener("scroll", handleScroll, { passive: true });
    });
  }
})();
