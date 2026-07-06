(() => {
  'use strict';

  if (window.__videoAdPipLoaded) return;
  window.__videoAdPipLoaded = true;

  // Inject bridge so the companion website can talk to the extension
  // even without externally_connectable.
  function injectBridge() {
    if (document.getElementById('video-ad-bridge')) return;
    const script = document.createElement('script');
    script.id = 'video-ad-bridge';
    script.src = chrome.runtime.getURL('bridge.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  injectBridge();

  // Listen for messages from the page bridge and relay to background
  window.addEventListener('message', async (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== 'video-ad-page') return;
    const { id, type, payload } = e.data;
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type, ...payload });
    } catch (err) {
      response = { error: err.message };
    }
    window.postMessage({ source: 'video-ad-content', id, payload: response }, '*');
  });

  const videoRegistry = new Map();

  function scanVideos() {
    document.querySelectorAll('video').forEach((video, index) => {
      if (!video.dataset.pipId) {
        const id = `va-${Date.now()}-${index}`;
        video.dataset.pipId = id;
        videoRegistry.set(id, video);
      }
    });
  }

  if (document.body) {
    const observer = new MutationObserver(scanVideos);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  scanVideos();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ping') {
      sendResponse({ pong: true });
      return;
    }
    if (request.type === 'activate_pip') {
      activate(request.mode, request.newsSource).then(sendResponse);
      return true;
    }
    if (request.type === 'show_activate_button') {
      showActivateButton(request.mode, request.newsSource);
      sendResponse({ shown: true });
      return;
    }
    if (request.type === 'detect_support') {
      sendResponse(detectSupport());
      return;
    }
    if (request.type === 'start_disguise') {
      startDisguise(request.mode, request.source).then(sendResponse);
      return true;
    }
    if (request.type === 'open_pip') {
      openPictureInPicture().then(sendResponse);
      return true;
    }
    if (request.type === 'get_video') {
      getVideoInfo().then(sendResponse);
      return true;
    }
  });

  function isCrossOriginIframe() {
    if (window.self === window.top) return false;
    try {
      // 同域 iframe 可以访问 parent.location；跨域会抛 SecurityError
      const href = window.parent.location.href;
      return false;
    } catch (e) {
      return true;
    }
  }

  function detectSupport() {
    const videos = document.querySelectorAll('video');
    if (videos.length === 0) return { supported: false, reason: 'no_video_element' };
    if (!document.pictureInPictureEnabled) return { supported: false, reason: 'pip_not_supported' };
    const drm = Array.from(videos).some(v => v.mediaKeys);
    if (drm) return { supported: false, reason: 'drm_protected' };
    if (isCrossOriginIframe()) return { supported: false, reason: 'cross_origin_iframe' };
    return { supported: true, videoCount: videos.length };
  }

  async function activate(mode, newsSource) {
    return startDisguise(mode || 'news', newsSource || 'weibo');
  }

  async function openPictureInPicture() {
    const videos = document.querySelectorAll('video');
    const visibleVideo = Array.from(videos).find(v => v.offsetWidth > 0 && v.offsetHeight > 0);
    if (!visibleVideo) {
      return { success: false, error: '未找到可播放的视频' };
    }
    if (!document.pictureInPictureEnabled) {
      return { success: false, error: '当前页面不支持画中画' };
    }
    try {
      await visibleVideo.requestPictureInPicture();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function getVideoInfo() {
    const videos = Array.from(document.querySelectorAll('video'));
    const playing = videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0 && !v.paused);
    const video = playing || videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0);
    if (!video) {
      return { error: '未找到可播放的视频' };
    }
    return {
      src: video.currentSrc || video.src,
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted,
      volume: video.volume,
      playbackRate: video.playbackRate,
      title: document.title
    };
  }

  function findVisibleVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    const playing = videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0 && !v.paused);
    return playing || videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0);
  }

  async function startDisguise(mode, source) {
    const video = document.pictureInPictureElement || findVisibleVideo();
    if (!video) {
      return { success: false, error: '未检测到视频，请先播放视频' };
    }

    if (!('documentPictureInPicture' in window)) {
      return { success: false, error: '当前浏览器不支持自定义画中画窗口' };
    }

    showActivateButton(mode || 'banner', source || 'weibo', true);
    return { success: true, mode: 'document', delegated: true };
  }

  function showActivateButton(mode, newsSource, autoOpen = false) {
    // Inject the activation script into the page's main world so that the
    // button click is considered a real user gesture for the video element.
    const existing = document.getElementById('video-ad-pip-script');
    if (existing) existing.remove();

    const config = { mode: mode || 'news', source: newsSource || 'weibo', autoOpen };

    const configScript = document.createElement('script');
    configScript.textContent = `window.__videoAdConfig = ${JSON.stringify(config)};`;
    (document.head || document.documentElement).appendChild(configScript);
    configScript.remove();

    const script = document.createElement('script');
    script.id = 'video-ad-pip-script';
    script.src = chrome.runtime.getURL('pip-activate.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  window.__videoAdPip = { activate };
})();
