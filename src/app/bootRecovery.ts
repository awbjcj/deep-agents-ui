/**
 * Pre-hydration boot watchdog.
 *
 * The UI ships as a Next.js static export (`output: "export"`, basePath
 * `/chat`) served by the FastAPI backend. Every build emits content-hashed
 * chunk filenames, but browsers happily serve `index.html` from the HTTP cache.
 * After a redeploy that stale HTML points at chunk URLs that no longer exist,
 * so the JS never loads, React never hydrates, and the page sits on the
 * prerendered "Loading…" markup forever. A plain reload re-uses the same cached
 * HTML; only a cache-bypassing hard reload (Ctrl+F5) recovers — exactly the
 * symptom users reported.
 *
 * This script runs before hydration and recovers automatically:
 *   1. Listens for chunk/stylesheet load failures and chunk-related promise
 *      rejections.
 *   2. Arms a watchdog timer; if the app has not signalled hydration by then,
 *      it assumes the boot is wedged.
 *   3. Recovery escalates: reload → cache-busted reload → visible fallback UI
 *      with a manual retry, so we can never spin in a reload loop.
 *
 * `AppReadyBeacon` clears the watchdog and the attempt counter once React has
 * actually mounted.
 */

import {
  BOOT_ATTEMPT_KEY,
  BOOT_CACHE_BUST_PARAM,
  BOOT_MAX_ATTEMPTS,
  BOOT_READY_FLAG,
  BOOT_WATCHDOG_MS,
} from "@/app/bootConstants";

export {
  BOOT_ATTEMPT_KEY,
  BOOT_CACHE_BUST_PARAM,
  BOOT_MAX_ATTEMPTS,
  BOOT_READY_FLAG,
  BOOT_WATCHDOG_MS,
};

export const bootRecoveryScript = `
(function () {
  var READY = ${JSON.stringify(BOOT_READY_FLAG)};
  var KEY = ${JSON.stringify(BOOT_ATTEMPT_KEY)};
  var CB = ${JSON.stringify(BOOT_CACHE_BUST_PARAM)};
  var MAX = ${BOOT_MAX_ATTEMPTS};
  var TIMEOUT = ${BOOT_WATCHDOG_MS};
  var recovering = false;

  function attempts() {
    try {
      return parseInt(window.sessionStorage.getItem(KEY) || '0', 10) || 0;
    } catch (e) {
      // Storage blocked (private mode / third-party context). Fall back to the
      // cache-bust marker in the URL as a one-shot counter: without it we get
      // exactly one hard reload, with it we stop and show the manual retry.
      // This must never loop, so it can only ever report the last attempt.
      return String(window.location.search || '').indexOf(CB + '=') !== -1
        ? MAX
        : MAX - 1;
    }
  }

  function bumpAttempts(n) {
    try { window.sessionStorage.setItem(KEY, String(n)); } catch (e) {}
  }

  function showFallback(reason) {
    if (document.getElementById('vsda-boot-fallback')) return;
    var el = document.createElement('div');
    el.id = 'vsda-boot-fallback';
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
      'justify-content:center;background:#fff;color:#111;font-family:system-ui,sans-serif;padding:24px;';
    if (document.documentElement.classList.contains('dark')) {
      el.style.background = '#111';
      el.style.color = '#f5f5f5';
    }
    var msg = document.createElement('div');
    msg.style.cssText = 'max-width:420px;text-align:center;';
    msg.innerHTML =
      '<h1 style="font-size:18px;font-weight:600;margin:0 0 8px">Couldn\\u2019t finish loading</h1>' +
      '<p style="font-size:14px;opacity:.75;margin:0 0 16px">' +
      'The app failed to start (' + String(reason || 'unknown') + '). ' +
      'A stale cached version may be in the way.</p>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Reload app';
    btn.style.cssText =
      'cursor:pointer;border:0;border-radius:9999px;padding:9px 20px;font-size:14px;' +
      'font-weight:600;background:#ff6a13;color:#fff;';
    btn.onclick = function () {
      try { window.sessionStorage.removeItem(KEY); } catch (e) {}
      hardReload();
    };
    msg.appendChild(btn);
    el.appendChild(msg);
    (document.body || document.documentElement).appendChild(el);
  }

  function hardReload() {
    // A same-URL reload can be answered from the HTTP cache with the very HTML
    // that is broken, so vary the URL to guarantee a fresh document fetch.
    try {
      var url = new URL(window.location.href);
      url.searchParams.set(CB, String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      window.location.reload();
    }
  }

  function recover(reason) {
    if (recovering || window[READY]) return;
    recovering = true;
    var n = attempts();
    if (n >= MAX) {
      showFallback(reason);
      return;
    }
    bumpAttempts(n + 1);
    var go = function () {
      if (n === 0) window.location.reload();
      else hardReload();
    };
    // Purge any Cache Storage entries (service worker / PWA caches) that could
    // keep re-serving the dead build, then reload.
    if (window.caches && window.caches.keys) {
      window.caches
        .keys()
        .then(function (keys) {
          return Promise.all(keys.map(function (k) { return window.caches.delete(k); }));
        })
        .then(go, go);
    } else {
      go();
    }
  }

  window.__vsdaBootRecover = recover;

  // Resource-level failures (a <script>/<link> 404) do not bubble, so listen in
  // the capture phase on window.
  window.addEventListener(
    'error',
    function (event) {
      if (window[READY]) return;
      var target = event.target;
      if (!target || target === window) return;
      var tag = target.tagName;
      if (tag !== 'SCRIPT' && tag !== 'LINK') return;
      var url = String(target.src || target.href || '');
      if (url.indexOf('/_next/') === -1) return;
      recover('asset');
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    if (window[READY]) return;
    var reason = event && event.reason;
    var text = String((reason && (reason.name + ' ' + reason.message)) || reason || '');
    if (
      text.indexOf('ChunkLoadError') !== -1 ||
      text.indexOf('Loading chunk') !== -1 ||
      text.indexOf('Loading CSS chunk') !== -1 ||
      text.indexOf('dynamically imported module') !== -1
    ) {
      recover('chunk');
    }
  });

  window.setTimeout(function () {
    if (window[READY]) return;
    // Offline: reloading cannot help and would just blank the page. Show the
    // manual retry instead.
    if (navigator.onLine === false) {
      showFallback('offline');
      return;
    }
    // Background tabs throttle timers and defer resource loads, so a slow boot
    // there is expected rather than wedged. Re-check when the tab is focused.
    if (document.visibilityState === 'hidden') {
      document.addEventListener(
        'visibilitychange',
        function onVisible() {
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', onVisible);
          window.setTimeout(function () {
            if (!window[READY]) recover('timeout');
          }, TIMEOUT);
        },
        false
      );
      return;
    }
    recover('timeout');
  }, TIMEOUT);
})();
`;
