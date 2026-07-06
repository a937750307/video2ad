document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('pipVideo');
  const status = document.getElementById('status');
  const customHeader = document.getElementById('customHeader');
  const titleElement = customHeader ? customHeader.querySelector('.pip-title') : null;
  const refreshBtn = document.getElementById('refreshBtn');

  let activeStream = null;
  let isLoading = false;
  let lockedTabId = null; // 锁定打开侧边栏时的标签页ID

  // 加载自定义标题
  async function loadCustomTitle() {
    try {
      const result = await chrome.storage.local.get('sidePanelTitle');
      if (result.sidePanelTitle !== undefined && titleElement) {
        const title = result.sidePanelTitle.trim();
        if (title === '') {
          // 如果标题为空，隐藏整个 header
          customHeader.classList.add('hidden');
        } else {
          // 设置自定义标题并显示 header
          titleElement.textContent = title;
          customHeader.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.warn('加载自定义标题失败:', e);
    }
  }

  // 页面加载时应用自定义标题
  loadCustomTitle();

  function stopStream() {
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
  }

  function captureTab() {
    return new Promise((resolve, reject) => {
      if (!chrome.tabCapture || !chrome.tabCapture.capture) {
        reject(new Error('当前浏览器不支持 tabCapture'));
        return;
      }
      chrome.tabCapture.capture({ audio: true, video: true }, (stream) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(stream);
      });
    });
  }

  async function getVideoInfoFromPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error('无法获取当前标签页');
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, { type: 'get_video' });
    } catch (e) {
      // 可能 content script 没注入，尝试注入
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        return await chrome.tabs.sendMessage(tab.id, { type: 'get_video' });
      } catch (injectErr) {
        throw new Error('无法连接到当前页面');
      }
    }
  }

  async function loadActiveTabVideo() {
    if (isLoading) return;
    isLoading = true;

    try {
      status.textContent = '正在获取头条热搜...';

      // 1. 获取头条热搜数据
      const res = await fetch('https://api.guiguiya.com/api/hotlist?type=toutiao');
      const data = await res.json();
      renderHotList(data);

      // 2. 尝试获取视频源并播放（只使用锁定的标签页）
      if (!lockedTabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          lockedTabId = tab.id;
        }
      }

      if (!lockedTabId) {
        status.textContent = '无法获取当前标签页';
        return;
      }

      let videoSrc = null;
      try {
        const response = await chrome.tabs.sendMessage(lockedTabId, { type: 'get_video' });
        if (response && response.src) {
          videoSrc = response.src;
        }
      } catch (e) {
        console.warn('无法从页面获取视频源:', e);
      }

      if (videoSrc) {
        if (videoSrc.startsWith('blob:') || videoSrc.startsWith('data:')) {
           // 如果是 blob，尝试用 tabCapture 捕获
           if (chrome.tabCapture && chrome.tabCapture.capture) {
             status.textContent = '正在捕获标签页画面...';
             const stream = await captureTab();
             stopStream();
             activeStream = stream;
             video.srcObject = stream;
             video.muted = false;
             video.play().catch(() => {});
             status.textContent = '';
           } else {
             status.textContent = '该网站使用加密/流式视频，侧边栏无法直接播放';
           }
        } else {
          // 切换到普通 URL 前先释放旧的 tabCapture 流
          stopStream();
          video.srcObject = null;
          video.src = videoSrc;
          video.currentTime = 0;
          video.play().catch(() => {});
          status.textContent = '';
        }
      } else {
        // 即使没有检测到视频 src，也尝试用 tabCapture 捕获（针对某些特殊嵌入方式）
        if (chrome.tabCapture && chrome.tabCapture.capture) {
          status.textContent = '正在尝试捕获标签页画面...';
          const stream = await captureTab();
          stopStream();
          activeStream = stream;
          video.srcObject = stream;
          video.muted = false;
          video.play().catch(() => {});
          status.textContent = '';
        } else {
          status.textContent = '当前页面未检测到可播放视频';
        }
      }
    } catch (err) {
      console.warn('加载失败:', err);
      status.textContent = '加载失败：' + err.message;
    } finally {
      isLoading = false;
    }
  }

  function renderHotList(response) {
    const list = document.getElementById('hotList');
    if (!list) return;

    let items = [];
    if (Array.isArray(response)) {
      items = response;
    } else if (response && Array.isArray(response.data)) {
      items = response.data;
    } else if (response && response.data && Array.isArray(response.data.list)) {
      items = response.data.list;
    }

    list.innerHTML = items.slice(0, 15).map((item, index) => {
      const rank = item.rank || item.index || index + 1;
      const title = item.title || item.topic || item.word || item.name || item.desc || item.keyword || item.show_name || '';
      const heat = item.hot || item.heat || item.value || '';
      const isHot = index < 3 ? 'hot' : '';
      
      return `
        <li class="hot-item">
          <span class="rank ${isHot}">${rank}</span>
          <span class="title">${escapeHtml(title)}</span>
          ${heat ? `<span class="heat">${formatHeat(heat)}</span>` : ''}
        </li>
      `;
    }).join('');
  }

  function formatHeat(heat) {
    if (typeof heat === 'number') {
      if (heat > 100000000) return (heat / 100000000).toFixed(1) + '亿';
      if (heat > 10000) return (heat / 10000).toFixed(1) + '万';
      return heat.toString();
    }
    return heat;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  // 不在 visibilitychange 时停止流，否则其他窗口遮挡侧边栏时会导致视频卡住。
  // 资源清理由 beforeunload 负责。

  window.addEventListener('beforeunload', stopStream);

  // 刷新按钮事件监听
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('用户点击刷新按钮');
      loadActiveTabVideo();
    });
  }

  loadActiveTabVideo();
});
