(() => {
  'use strict';

  const config = window.__videoAdConfig || { mode: 'news', source: 'weibo' };
  const API_MAP = {
    weibo: 'https://api.guiguiya.com/api/hotlist?type=weibo',
    zhihu: 'https://api.guiguiya.com/api/hotlist?type=zhihu',
    baidu: 'https://api.guiguiya.com/api/hotlist?type=baidu',
    toutiao: 'https://api.guiguiya.com/api/hotlist?type=toutiao',
    douyin: 'https://api.guiguiya.com/api/hotlist?type=douyin',
    bilihot: 'https://api.guiguiya.com/api/hotlist?type=bilihot'
  };

  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    const playing = videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0 && !v.paused);
    if (playing) return playing;
    const visible = videos.find(v => v.offsetWidth > 0 && v.offsetHeight > 0);
    if (visible) return visible;
    return document.pictureInPictureElement || null;
  }

  function waitForLeavePiP(timeout = 3000) {
    return new Promise((resolve) => {
      const onLeave = () => {
        document.removeEventListener('leavepictureinpicture', onLeave);
        resolve();
      };
      document.addEventListener('leavepictureinpicture', onLeave);
      document.exitPictureInPicture().catch(() => {
        document.removeEventListener('leavepictureinpicture', onLeave);
        resolve();
      });
      setTimeout(() => {
        document.removeEventListener('leavepictureinpicture', onLeave);
        resolve();
      }, timeout);
    });
  }

  function openDisguise(btn) {
    const video = findVideo();
    if (!video) {
      if (btn) {
        btn.textContent = '找不到可播放的视频';
        setTimeout(() => btn.remove(), 3000);
      }
      return Promise.reject(new Error('no_video'));
    }

    if (btn) btn.textContent = '正在伪装...';

    if (!('documentPictureInPicture' in window)) {
      if (btn) {
        btn.textContent = '浏览器不支持 Document 画中画';
        setTimeout(() => btn.remove(), 3000);
      }
      return Promise.reject(new Error('not_supported'));
    }

    const doOpen = () => window.documentPictureInPicture.requestWindow({ width: 380, height: 520 });

    const request = document.pictureInPictureElement
      ? waitForLeavePiP().then(doOpen)
      : doOpen();

    return request
      .then(win => {
        renderPipUI(win, video, config.mode, config.source);
        if (btn) btn.remove();
      })
      .catch(err => {
        console.warn('Document PiP failed', err);
        if (btn) {
          btn.textContent = '伪装失败：' + err.message;
          setTimeout(() => btn.remove(), 3000);
        }
      });
  }

  function showButton() {
    const existing = document.getElementById('video-ad-activate-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'video-ad-activate-btn';
    btn.textContent = '开始伪装';
    btn.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'z-index: 2147483647',
      'padding: 10px 16px',
      'background: #e6162d',
      'color: #fff',
      'border: none',
      'border-radius: 6px',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.2)',
      'cursor: pointer',
      'font-size: 14px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      'line-height: 1.4'
    ].join(';');

    btn.addEventListener('click', () => openDisguise(btn));
    document.body.appendChild(btn);
  }

  function renderPipUI(win, video, mode, source) {
    const originalParent = video.parentNode;
    const originalNextSibling = video.nextSibling;

    const doc = win.document;
    doc.head.innerHTML = '';
    doc.body.innerHTML = '';

    const style = doc.createElement('style');
    style.textContent = getPipCSS();
    doc.head.appendChild(style);

    const container = doc.createElement('div');
    container.className = 'pip-container mode-' + mode;
    container.innerHTML = getModeTemplate(mode);
    doc.body.appendChild(container);

    const videoArea = container.querySelector('.video-area');
    if (videoArea && originalParent) {
      videoArea.appendChild(video);
    }

    let refreshTimer = setInterval(() => {
      if (win && !win.closed) {
        loadHotSearch(container, source);
      }
    }, 600000);

    win.addEventListener('pagehide', () => {
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      if (originalParent) {
        if (originalNextSibling) {
          originalParent.insertBefore(video, originalNextSibling);
        } else {
          originalParent.appendChild(video);
        }
      }
      clearInterval(refreshTimer);
      refreshTimer = null;
    });

    bindControls(container, video, source, win);
    loadHotSearch(container, source);
  }

  function getPipCSS() {
    return `
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f7f8fa; color: #333; }
      .pip-container { width: 380px; height: 520px; display: flex; flex-direction: column; overflow: hidden; }
      .pip-header { display: flex; align-items: center; padding: 10px 12px; background: #fff; border-bottom: 1px solid #e6e6e6; }
      .pip-title { font-size: 15px; font-weight: 600; flex: 1; }
      .pip-live { font-size: 11px; color: #e6162d; border: 1px solid #e6162d; border-radius: 3px; padding: 1px 5px; margin-right: 8px; }
      .pip-close { cursor: pointer; color: #999; font-size: 14px; }
      .pip-tabs { display: flex; background: #fff; border-bottom: 1px solid #e6e6e6; }
      .tab { flex: 1; text-align: center; padding: 9px 0; font-size: 13px; color: #666; cursor: pointer; }
      .tab.active { color: #e6162d; border-bottom: 2px solid #e6162d; }
      .hot-list { list-style: none; flex: 1; overflow-y: auto; padding: 0; margin: 0; background: #fff; }
      .hot-item { display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
      .hot-item:hover { background: #f7f8fa; }
      .rank { width: 20px; text-align: center; font-family: "SF Mono", Consolas, monospace; font-size: 13px; color: #999; margin-right: 10px; }
      .rank.hot { color: #e6162d; }
      .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .heat { font-size: 11px; color: #999; margin-left: 6px; }
      .video-area { height: 160px; background: #000; flex-shrink: 0; }
      .video-area video { width: 100%; height: 100%; object-fit: contain; }
      .pip-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fff; border-top: 1px solid #e6e6e6; font-size: 12px; color: #999; }
      .refresh { color: #e6162d; cursor: pointer; }
      .excel-grid { display: grid; grid-template-columns: repeat(3, 1fr); background: #fff; }
      .excel-cell { padding: 8px; border: 1px solid #e6e6e6; font-size: 12px; }
      .excel-cell.header { background: #f2f2f2; font-weight: 600; }
      .code-block { background: #1e1e1e; color: #d4d4d4; padding: 12px; font-family: Consolas, monospace; font-size: 12px; flex: 1; overflow: auto; }
      .banner-content { padding: 20px; text-align: center; color: #e6162d; font-size: 14px; background: #fff; }
    `;
  }

  function getModeTemplate(mode) {
    const titles = {
      news: '微博热搜',
      excel: 'Excel 工作表',
      code: 'main.js',
      banner: '系统通知'
    };

    if (mode === 'excel') {
      return `
        <div class="pip-header"><span class="pip-title">${titles[mode]}</span><span class="pip-close">x</span></div>
        <div class="excel-grid">
          <div class="excel-cell header">A</div><div class="excel-cell header">B</div><div class="excel-cell header">C</div>
          <div class="excel-cell">项目</div><div class="excel-cell">数值</div><div class="excel-cell">备注</div>
          <div class="excel-cell">Q1</div><div class="excel-cell">1200</div><div class="excel-cell">--</div>
          <div class="excel-cell">Q2</div><div class="excel-cell">1500</div><div class="excel-cell">--</div>
        </div>
        <div class="video-area"></div>
      `;
    }

    if (mode === 'code') {
      return `
        <div class="pip-header"><span class="pip-title">${titles[mode]}</span><span class="pip-close">x</span></div>
        <pre class="code-block"><code>function init() {
  console.log('loading...');
}</code></pre>
        <div class="video-area"></div>
      `;
    }

    if (mode === 'banner') {
      return `
        <div class="pip-header"><span class="pip-title">${titles[mode]}</span><span class="pip-close">x</span></div>
        <div class="banner-content">恭喜您获得 100 积分！</div>
        <div class="video-area"></div>
      `;
    }

    return `
      <div class="pip-header">
        <span class="pip-title">微博热搜</span>
        <span class="pip-live">实时</span>
        <span class="pip-close">x</span>
      </div>
      <div class="pip-tabs">
        <span class="tab active">热搜榜</span>
        <span class="tab">要闻</span>
        <span class="tab">文娱</span>
      </div>
      <ul class="hot-list"></ul>
      <div class="video-area"></div>
      <div class="pip-footer"><span class="refresh">刷新</span><span class="update-time">--:--</span></div>
    `;
  }

  function bindControls(container, video, source, win) {
    const closeBtn = container.querySelector('.pip-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (win && !win.closed) win.close();
      });
    }

    const refreshBtn = container.querySelector('.refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadHotSearch(container, source);
      });
    }

    const tabs = container.querySelectorAll('.tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    }));
  }

  async function loadHotSearch(container, source) {
    const list = container.querySelector('.hot-list');
    if (!list) return;

    try {
      const url = API_MAP[source] || API_MAP.weibo;
      const res = await fetch(url);
      const data = await res.json();
      renderList(list, data);
      updateTime(container);
    } catch (e) {
      list.innerHTML = '<li class="hot-item">加载失败，请稍后重试</li>';
    }
  }

  function renderList(list, response) {
    let items = [];
    if (Array.isArray(response)) {
      items = response;
    } else if (response && Array.isArray(response.data)) {
      items = response.data;
    } else if (response && Array.isArray(response.list)) {
      items = response.list;
    }

    list.innerHTML = items.slice(0, 10).map((item, index) => {
      const rank = item.rank || item.index || index + 1;
      const highlight = index < 3 ? 'hot' : '';
      return `
        <li class="hot-item">
          <span class="rank ${highlight}">${rank}</span>
          <span class="title">${escapeHtml(item.title || '')}</span>
          <span class="heat">${item.heat || ''}</span>
        </li>
      `;
    }).join('');
  }

  function updateTime(container) {
    const timeEl = container.querySelector('.update-time');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
  }

  function pad(n) {
    return n < 10 ? '0' + n : n;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m]));
  }

  if (config.autoOpen) {
    openDisguise(null);
  } else {
    showButton();
  }
})();
