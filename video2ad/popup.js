async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('无法获取当前标签页');
  return tab;
}

// 加载保存的侧边栏标题
async function loadSidePanelTitle() {
  const result = await chrome.storage.local.get('sidePanelTitle');
  const titleInput = document.getElementById('sidePanelTitle');
  if (titleInput && result.sidePanelTitle) {
    titleInput.value = result.sidePanelTitle;
  }
}

// 保存侧边栏标题
async function saveSidePanelTitle(title) {
  await chrome.storage.local.set({ sidePanelTitle: title });
  // 通知 background 通过 sidePanel API 实时更新标题
  try {
    await chrome.runtime.sendMessage({ type: 'set_side_panel_title', title });
  } catch (e) {
    console.warn('无法更新侧边栏标题:', e);
  }
}

// 监听标题输入变化
const titleInput = document.getElementById('sidePanelTitle');
if (titleInput) {
  titleInput.addEventListener('input', (e) => {
    saveSidePanelTitle(e.target.value);
  });
}

// 页面加载时读取已保存的标题
loadSidePanelTitle();

document.getElementById('openSidePanel').addEventListener('click', async () => {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    // 浏览器支持侧边栏 API 时直接打开
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    } else {
      // 不支持时回退到一个 popup 小窗口
      window.open(
        chrome.runtime.getURL('sidepanel.html'),
        'video-ad-sidepanel',
        'popup,width=400,height=600,left=100,top=100'
      );
    }
  } catch (err) {
    alert('打开侧边栏失败：' + err.message);
  }
});
