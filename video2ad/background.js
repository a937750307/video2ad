const API_MAP = {
  weibo: 'https://api.guiguiya.com/api/hotlist?type=weibo',
  zhihu: 'https://api.guiguiya.com/api/hotlist?type=zhihu',
  baidu: 'https://api.guiguiya.com/api/hotlist?type=baidu',
  toutiao: 'https://api.guiguiya.com/api/hotlist?type=toutiao',
  douyin: 'https://api.guiguiya.com/api/hotlist?type=douyin',
  bilihot: 'https://api.guiguiya.com/api/hotlist?type=bilihot'
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ping') {
    sendResponse({ pong: true });
    return;
  }

  if (request.type === 'scan_video_tabs') {
    scanVideoTabs().then(sendResponse);
    return true;
  }

  if (request.type === 'activate_pip') {
    activatePip(request.tabId, request.mode, request.newsSource).then(sendResponse);
    return true;
  }

  if (request.type === 'get_hot_search') {
    fetchHotSearch(request.source).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }

  if (request.type === 'set_side_panel_title') {
    setSidePanelTitle(request.title).then(sendResponse);
    return true;
  }
});

async function scanVideoTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const results = [];
    const errors = [];

    for (const tab of tabs) {
      if (!tab.id || !tab.url || !tab.url.startsWith('http')) continue;
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: detectVideosInPage
        });
        results.push({
          id: tab.id,
          title: tab.title || tab.url,
          url: tab.url,
          ...(result && result.result ? result.result : {})
        });
      } catch (e) {
        errors.push({ tabId: tab.id, url: tab.url, error: e.message });
      }
    }

    console.log('[视频小广告] scan errors:', errors);
    return { tabs: results, errors };
  } catch (error) {
    return { error: error.message, tabs: [] };
  }
}

function detectVideosInPage() {
  const videos = document.querySelectorAll('video');
  const playingVideo = Array.from(videos).find(v => !v.paused && v.currentTime > 0);
  return {
    hasVideo: videos.length > 0,
    videoCount: videos.length,
    playing: !!playingVideo
  };
}

async function activatePip(tabId, mode, newsSource) {
  try {
    // Ensure content script is injected before sending message
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'show_activate_button',
      mode: mode || 'news',
      newsSource: newsSource || 'weibo'
    });
    return { success: true, buttonShown: true, ...response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function fetchHotSearch(source) {
  const url = API_MAP[source] || API_MAP.weibo;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`热榜接口请求失败: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

async function setSidePanelTitle(title) {
  await chrome.storage.local.set({ sidePanelTitle: title });
  if (chrome.sidePanel && chrome.sidePanel.setOptions) {
    await chrome.sidePanel.setOptions({ title: title || '' });
  }
  return { success: true, title: title || '' };
}

// 启动时应用保存的标题
chrome.storage.local.get('sidePanelTitle').then(result => {
  if (result.sidePanelTitle !== undefined) {
    setSidePanelTitle(result.sidePanelTitle).catch(console.warn);
  }
});
