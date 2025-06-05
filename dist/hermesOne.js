(function () {
  const ENDPOINT = "http://91.107.181.122:7778/api/v1/project/test";
  const SCROLL_THRESHOLD = 0.5; // 50%
  const TIME_ON_PAGE_THRESHOLD = 10 * 1000; // 10 seconds

  // --- Generate UUID
  function uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  // --- Identify user & session
  const userId = localStorage.getItem("ab_user_id") || (() => {
    const id = uuid();
    localStorage.setItem("ab_user_id", id);
    return id;
  })();

  const now = Date.now();
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  let sessionId = localStorage.getItem("ab_session_id");
  let lastActivity = parseInt(localStorage.getItem("ab_last_activity") || "0", 10);

  if (!sessionId || now - lastActivity > SESSION_TIMEOUT) {
    sessionId = uuid();
  }

  localStorage.setItem("ab_session_id", sessionId);
  localStorage.setItem("ab_last_activity", now.toString());

  // --- Helper: Build event payload
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

  // --- Helper: Send event
  function send(data) {
    try {
      const jsonData = JSON.stringify(data);
      console.log('Sending:', jsonData);
      console.log('Sending:', data);
      navigator.sendBeacon?.(ENDPOINT, json) ||
      fetch(ENDPOINT, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: jsonData
      });
    } catch (e) {}
  }

  // --- 1. Track Clicks
  function handleClick(e) {
    localStorage.setItem("ab_last_activity", Date.now().toString());
    const data = buildEvent("click", e.target);
    send(data);
  }

  // --- 2. Track Scroll Depth
  let scrollTracked = false;
  function handleScroll() {
    if (scrollTracked) return;
    const scrollDepth = window.scrollY + window.innerHeight;
    const totalHeight = document.body.scrollHeight;
    if (scrollDepth / totalHeight >= SCROLL_THRESHOLD) {
      scrollTracked = true;
      send(buildEvent("scroll-depth", null, { depth: SCROLL_THRESHOLD }));
    }
  }

  // --- 3. Time on page engagement
  setTimeout(() => {
    send(buildEvent("engaged"));
  }, TIME_ON_PAGE_THRESHOLD);

  // --- 4. Track unload (optional)
  window.addEventListener("beforeunload", () => {
    send(buildEvent("unload"));
  });

  // --- 5. Expose custom tracking API
  window.abTracker = {
    track: (eventName, extra = {}) => {
      const data = buildEvent(eventName, null, { custom: extra });
      send(data);
    },
    optOut: () => {
      localStorage.setItem("ab_optout", "1");
    },
    optIn: () => {
      localStorage.removeItem("ab_optout");
    }
  };

  // --- Attach listeners if not opted out
  if (!localStorage.getItem("ab_optout")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.addEventListener("click", handleClick);
      document.addEventListener("scroll", handleScroll, { passive: true });
    });
  }
})();

