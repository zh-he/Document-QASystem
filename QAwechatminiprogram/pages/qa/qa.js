import { request } from "../../utils/request";

Page({
  data: {
    sessions: [],
    currentSessionId: "",
    messages: [],
    inputValue: "",
    isLoading: false,
    showSessionList: false,
    modes: ["rag", "lightrag", "search", "agent"],
    selectedMode: "rag",
    showModeOptions: false,
    textareaHeight: 68, // 初始高度
    activeMenuIndex: -1, // 标记当前活动菜单的索引
  },

  onLoad() {
    console.log("==> [onLoad] 页面加载");
    this.fetchSessions();
  },

  handlePageTap() {
    // 点击空白区域关闭菜单
    if (this.data.activeMenuIndex !== -1) {
      this.setData({ activeMenuIndex: -1 });
    }
    
    // 同时关闭模式选择下拉菜单
    if (this.data.showModeOptions) {
      this.setData({ showModeOptions: false });
    }
  },

  toggleSessionList() {
    // 关闭所有打开的菜单
    this.setData({ 
      showSessionList: !this.data.showSessionList,
      activeMenuIndex: -1
    });
  },
  
  // 阻止遮罩上的触摸事件
  preventTouchMove() {
    return;
  },

  async createNewSession() {
    try {
      const res = await request({ url: "/api/sessions/create", method: "POST" });
      if (res.sessionId) {
        this.setData({ 
          currentSessionId: res.sessionId, 
          messages: [], 
          showSessionList: false,
          activeMenuIndex: -1
        });
        await this.fetchSessions();
      } else {
        wx.showToast({ title: "未返回有效的会话ID", icon: "none" });
      }
    } catch (e) {
      console.error("==> [createNewSession] 异常:", e);
      wx.showToast({ title: "创建会话失败", icon: "none" });
    }
  },

  async fetchSessions() {
    this.setData({ isLoading: true });
    try {
      const res = await request({ url: "/api/sessions", method: "GET" });
      this.setData({ 
        sessions: res.sessions || [], 
        isLoading: false 
      });
      
      if (!this.data.currentSessionId && res.sessions && res.sessions.length > 0) {
        this.selectSession({ currentTarget: { dataset: { id: res.sessions[0].id } } });
      }
    } catch (e) {
      console.error("==> [fetchSessions] 异常:", e);
      this.setData({ isLoading: false });
      wx.showToast({ title: "加载列表失败", icon: "none" });
    }
  },

  async selectSession(e) {
    const sid = e.currentTarget.dataset.id;
    
    // 关闭菜单
    this.setData({ activeMenuIndex: -1 });
    
    if (sid === this.data.currentSessionId && this.data.showSessionList) {
      this.setData({ showSessionList: false });
      return;
    }
    
    if (sid === this.data.currentSessionId) return;

    this.setData({ 
      currentSessionId: sid, 
      messages: [], 
      isLoading: true, 
      showSessionList: false 
    });
    
    await this.fetchMessages(sid);
  },

  // 极简的菜单显示功能，仅使用索引
  showActionsMenu(e) {
    console.log("Show actions menu clicked", e.currentTarget.dataset.index);
    const index = e.currentTarget.dataset.index;
    
    // 如果已经打开了这个菜单，则关闭它
    if (this.data.activeMenuIndex === index) {
      this.setData({ activeMenuIndex: -1 });
    } else {
      // 否则打开它
      this.setData({ activeMenuIndex: index });
    }
    
    // 阻止事件冒泡
    e.stopPropagation && e.stopPropagation();
  },

  // 重命名会话
  renameSession(e) {
    console.log("Rename session clicked", e.currentTarget.dataset.id);
    const sid = e.currentTarget.dataset.id;
    
    // 关闭菜单
    this.setData({ activeMenuIndex: -1 });
    
    const oldTitle = (this.data.sessions.find(s => s.id === sid) || {}).title || '';
    
    // 显示对话框
    wx.showModal({
      title: '重命名会话',
      editable: true,
      placeholderText: '输入新名称',
      content: oldTitle,
      success: async res => {
        if (res.confirm) {
          const newTitle = (res.content || '').trim();
          if (!newTitle) {
            wx.showToast({ title: '名称不能为空', icon: 'none' });
          } else if (newTitle !== oldTitle) {
            try {
              await request({ url: `/api/sessions/${sid}/rename`, method: 'POST', data: { title: newTitle } });
              this.setData({
                sessions: this.data.sessions.map(s => s.id === sid ? { ...s, title: newTitle } : s)
              });
              wx.showToast({ title: '重命名成功', icon: 'success' });
            } catch (err) {
              console.error("==> [renameSession] 异常:", err);
              wx.showToast({ title: '重命名失败', icon: 'none' });
            }
          }
        }
      }
    });
    
    // 阻止事件冒泡
    e.stopPropagation && e.stopPropagation();
  },

  // 删除会话
  deleteSession(e) {
    console.log("Delete session clicked", e.currentTarget.dataset.id);
    const sid = e.currentTarget.dataset.id;
    
    // 关闭菜单
    this.setData({ activeMenuIndex: -1 });
    
    // 显示确认对话框
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      success: async res => {
        if (res.confirm) {
          try {
            await request({ url: `/api/sessions/${sid}/delete`, method: "POST" });
            if (this.data.currentSessionId === sid) {
              this.setData({ currentSessionId: "", messages: [] });
            }
            this.setData({
              sessions: this.data.sessions.filter(s => s.id !== sid)
            });
            wx.showToast({ title: '删除成功', icon: 'success' });
          } catch (err) {
            console.error("==> [deleteSession] 异常:", err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
    
    // 阻止事件冒泡
    e.stopPropagation && e.stopPropagation();
  },

  async fetchMessages(sessionId) {
    try {
      const res = await request({ url: `/api/sessions/${sessionId}`, method: "GET" });
      
      this.setData({
        messages: res.messages || [],
        isLoading: false
      }, () => {
        // 滚动到底部
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("==> [fetchMessages] 异常:", e);
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载消息失败', icon: 'none' });
    }
  },

  // 滚动到底部方法
  scrollToBottom() {
    setTimeout(() => {
      wx.createSelectorQuery()
        .select('#message-anchor')
        .boundingClientRect((rect) => {
          if (rect) {
            // 平滑滚动到底部，但留出一些空间
            wx.pageScrollTo({
              scrollTop: rect.top*100000, // 减去150px留出空间
              duration: 300
            });
          }
        })
        .exec();
    }, 200);
  },

  // 输入内容变化
  onInputChange(e) {
    const value = e.detail.value;
    this.setData({ inputValue: value });
    
    // 根据内容估算高度并限制最大高度
    const lineBreaks = (value.match(/\n/g) || []).length;
    const estimatedLines = Math.ceil((value.length - lineBreaks) / 20) + lineBreaks;
    const newHeight = Math.min(68 + (estimatedLines - 1) * 30, 180);
    
    if (this.data.textareaHeight !== newHeight) {
      this.setData({ textareaHeight: newHeight });
    }
  },

  // 获取焦点时
  onInputFocus() {
    // 关闭所有菜单
    this.setData({
      activeMenuIndex: -1,
      showModeOptions: false
    });
    
    // 延迟滚动到底部
    setTimeout(() => {
      this.scrollToBottom();
    }, 300);
  },

  // 失去焦点时
  onInputBlur() {
    // 可在需要时添加逻辑
  },

  // 切换模式下拉面板
  toggleModeOptions() {
    // 关闭所有会话菜单
    this.setData({ 
      activeMenuIndex: -1,
      showModeOptions: !this.data.showModeOptions 
    });
  },

  // 选择模式
  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ selectedMode: mode, showModeOptions: false });
  },

  async sendMessage() {
    // 检查是否正在等待上一条消息的回复
    if (this.data.isLoading) {
      wx.showToast({ title: '请等待上条消息回复', icon: 'none' });
      return;
    }

    const msg = this.data.inputValue.trim();
    if (!msg) {
      wx.showToast({ title: '不能发送空消息', icon: 'none' });
      return;
    }

    let sid = this.data.currentSessionId;
    if (!sid) {
      try {
        const res = await request({ url: "/api/sessions/create", method: "POST" });
        sid = res.sessionId;
        this.setData({ currentSessionId: sid, messages: [] });
        await this.fetchSessions();
      } catch {
        wx.showToast({ title: '创建会话失败', icon: 'none' });
        return;
      }
    }

    // 用户消息乐观更新
    this.setData({ 
      messages: [...this.data.messages, { role: 'user', content: msg }], 
      inputValue: '', 
      textareaHeight: 68, // 重置输入框高度
      isLoading: true
    }, () => {
      // 立即滚动到底部显示新消息
      this.scrollToBottom();
    });

    try {
      const chatRes = await request({
        url: "/api/chat",
        method: "POST",
        data: { sessionId: sid, question: msg, mode: this.data.selectedMode },
        timeout: 180000
      });
      
      this.setData({ 
        messages: [...this.data.messages, { 
          role: 'assistant', 
          content: chatRes.answer || '抱歉，暂时无法回答。'
        }],
        isLoading: false
      }, () => {
        // 滚动到底部显示回复消息
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("==> [sendMessage] 异常:", e);
      
      this.setData({ 
        messages: [...this.data.messages, { 
          role: 'assistant', 
          content: '发生错误，请稍后再试。'
        }],
        isLoading: false
      }, () => {
        this.scrollToBottom();
      });
      wx.showToast({ title: '消息发送失败', icon: 'none' });
    }
  },
  
  // 页面显示时
  onShow() {
    // 延迟滚动到底部
    if (this.data.messages && this.data.messages.length > 0) {
      setTimeout(() => {
        this.scrollToBottom();
      }, 500);
    }
  },
  
  // 页面隐藏时
  onHide() {
    // 关闭所有弹出菜单
    this.setData({
      activeMenuIndex: -1,
      showModeOptions: false
    });
  },
  
  // 页面卸载时
  onUnload() {
    // 清理资源
  }
});