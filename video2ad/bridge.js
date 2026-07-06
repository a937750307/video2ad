(function () {
  'use strict';
  if (window.__videoAdBridge) return;

  const REQ_PREFIX = 'va-req-';
  let reqId = 0;
  const pending = new Map();

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== 'video-ad-content') return;
    const { id, payload } = e.data;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(payload);
    }
  });

  window.__videoAdBridge = {
    installed: true,
    send(type, payload) {
      return new Promise((resolve) => {
        const id = REQ_PREFIX + (++reqId);
        pending.set(id, resolve);
        window.postMessage({ source: 'video-ad-page', id, type, payload }, '*');
      });
    }
  };
})();
