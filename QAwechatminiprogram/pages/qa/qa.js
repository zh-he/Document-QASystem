import { request } from "../../utils/request";

const CSS_TRANSITION_DURATION = 200;

const ANIMATION_FINISH_DELAY = CSS_TRANSITION_DURATION + 100; 

const UI_SMOOTHING_DELAY = 50; // ms

Page({
  data: {
    sessions: [],
    currentSessionId: "",
    messages: [],
    inputValue: "",
    isLoading: false,
    showSessionList: false,
    scrollTop: 0,
    isNewSession: false 
  },

  onLoad() {
    console.log("==> [onLoad] QA 页面加载");
    this.fetchSessions();
  },

  handlePageTap() {
    const hasMenuOpen = this.data.sessions.some(s => s.showMenu);
    if (hasMenuOpen) {
      this.setData({
        sessions: this.data.sessions.map(s => ({ ...s, showMenu: false }))
      });
    }
  },

  toggleSessionList() {
    this.setData({ showSessionList: !this.data.showSessionList });
    if (this.data.sessions.some(s => s.showMenu)) {
        this.setData({
            sessions: this.data.sessions.map(s => ({ ...s, showMenu: false }))
        });
    }
  },

  createNewSession() {
    console.log("==> [createNewSession] - 仅打开新会话栏");
    // 只是打开一个新会话栏，不实际创建会话
    this.setData({
      currentSessionId: "", 
      messages: [], 
      isLoading: false, 
      showSessionList: false, 
      isNewSession: true 
    });
    this.scrollToBottom(); 
  },

  async fetchSessions() {
    console.log("==> [fetchSessions]");
    try {
      const res = await request({ url: "/api/sessions", method: "GET" });
      const fetchedSessions = res.sessions || [];
      const sessionsWithMenuState = fetchedSessions.map(s_new => {
        const existingSession = this.data.sessions.find(s_old => s_old.id === s_new.id);
        return {
          ...s_new,
          showMenu: existingSession ? existingSession.showMenu : false
        };
      });
      this.setData({ sessions: sessionsWithMenuState });

      // 如果当前为未保存的新会话，保持当前状态
      if (this.data.isNewSession) {
        return;
      }

      const currentSessionStillExists = sessionsWithMenuState.some(s => s.id === this.data.currentSessionId);

      if (!this.data.currentSessionId || !currentSessionStillExists) {
        if (sessionsWithMenuState.length > 0) {

          this.selectSession({ currentTarget: { dataset: { id: sessionsWithMenuState[0].id } } }, true);
        } else {
          this.setData({ currentSessionId: "", messages: [], isLoading: false });
          this.scrollToBottom();
        }
      }
    } catch (e) {
      console.error("==> [fetchSessions] 异常", e);
      wx.showToast({ title: "加载列表失败", icon: "none" });
    }
  },

  async selectSession(e, isInternalCall = false) {
    const sid = e.currentTarget.dataset.id;
    if (!isInternalCall && sid === this.data.currentSessionId) {
      this.setData({ showSessionList: false }); 
      return;
    }
    console.log("==> [selectSession]", sid);
    this.setData({
      currentSessionId: sid,
      messages: [],
      isLoading: true, 
      showSessionList: false, 
      sessions: this.data.sessions.map(s => ({ ...s, showMenu: false })), 
      isNewSession: false 
    });
    await this.fetchMessages(sid);
  },

  showActionsMenu(e) {
    const sid = e.currentTarget.dataset.id;
    console.log("==> [showActionsMenu]", sid);

    setTimeout(() => {
      const updatedSessions = this.data.sessions.map(item => ({
        ...item,
        showMenu: item.id === sid ? !item.showMenu : false 
      }));
      this.setData({ sessions: updatedSessions });
    }, UI_SMOOTHING_DELAY);
  },

  deleteSession(e) {
    const sid = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认删除",
      content: "你确定要删除此会话吗？此操作不可恢复。",
      confirmText: "删除",
      cancelText: "取消",
      confirmColor: "#e53935",
      success: async (resModal) => {    
        this.setData({
          sessions: this.data.sessions.map(s => ({ ...s, showMenu: false }))
        });

        if (!resModal.confirm) return;

        try {
          await request({ url: `/api/sessions/${sid}/delete`, method: "POST" });
          
          setTimeout(() => {
            const remainingSessions = this.data.sessions.filter(s => s.id !== sid);
            let newCurrentSessionId = this.data.currentSessionId;
            let messagesNeedUpdate = false;

            if (this.data.currentSessionId === sid) { 
              if (remainingSessions.length > 0) {
                newCurrentSessionId = remainingSessions[0].id; 
              } else {
                newCurrentSessionId = ""; 
              }
              messagesNeedUpdate = true; 
            }

            this.setData({
              sessions: remainingSessions,
              currentSessionId: newCurrentSessionId,
             
              ...(messagesNeedUpdate && newCurrentSessionId === "" && { messages: [] }),
              isLoading: messagesNeedUpdate && newCurrentSessionId !== "", 
              isNewSession: newCurrentSessionId === "" 
            });

            if (messagesNeedUpdate && newCurrentSessionId !== "") {
              this.fetchMessages(newCurrentSessionId); 
            } else if (newCurrentSessionId === "") {
                this.scrollToBottom(); 
            }

            wx.showToast({ title: "删除成功", icon: "success" });
          }, ANIMATION_FINISH_DELAY);

        } catch (err) {
          console.error("==> [deleteSession] 异常", err);
          wx.showToast({ title: "删除失败", icon: "none" });
        }
      }
    });
  },

  renameSession(e) {
    const sid = e.currentTarget.dataset.id;
    const currentSessionData = this.data.sessions.find(s => s.id === sid) || {};
    wx.showModal({
      title: "重命名会话",
      editable: true,
      placeholderText: "请输入新的会话名称",
      content: currentSessionData.title || "",
      success: async (resModal) => {
        this.setData({
          sessions: this.data.sessions.map(s => ({ ...s, showMenu: false }))
        });

        if (!resModal.confirm) return;
        
        const newTitle = (resModal.content || "").trim();
        if (!newTitle) {
          return wx.showToast({ title: "名称不能为空", icon: "none" });
        }
        if (newTitle === currentSessionData.title) return; 

        try {
          await request({
            url: `/api/sessions/${sid}/rename`,
            method: "POST",
            data: { title: newTitle }
          });

          setTimeout(() => {
            this.setData({
              sessions: this.data.sessions.map(s =>
                s.id === sid ? { ...s, title: newTitle, showMenu: false } : s
              )
            });
            wx.showToast({ title: "重命名成功", icon: "success" });
          }, ANIMATION_FINISH_DELAY);

        } catch (err) {
          console.error("==> [renameSession] 异常", err);
          wx.showToast({ title: "重命名失败", icon: "none" });
        }
      }
    });
  },

  async fetchMessages(sessionId) {
    if (!sessionId) {
      this.setData({ messages: [], isLoading: false });
      this.scrollToBottom();
      return;
    }
    console.log("==> [fetchMessages]", sessionId);
    this.setData({ isLoading: true }); 
    try {
      const res = await request({ url: `/api/sessions/${sessionId}`, method: "GET" });
      this.setData({ messages: res.messages || [], isLoading: false }, () => {
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("==> [fetchMessages] 异常", e);
      this.setData({ messages: [], isLoading: false }); 
      wx.showToast({ title: "加载消息失败", icon: "none" });
      this.scrollToBottom();
    }
  },

  scrollToBottom() {
    wx.nextTick(() => {
      if (this.data.messages.length > 0) {
        this.setData({ scrollTop: this.data.messages.length * 2000 }); // Large number
      } else {
        this.setData({ scrollTop: 0 }); // Scroll to top for empty state
      }
    });
  },

  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  async sendMessage() {
    const msgContent = this.data.inputValue.trim();
    if (!msgContent) {
      return wx.showToast({ title: "不能发送空消息", icon: "none" });
    }

    // 确保发送按钮不可点击
    this.setData({ isLoading: true });

    let currentOpenSid = this.data.currentSessionId;
    if (!currentOpenSid || this.data.isNewSession) {
      try {
        // 创建新会话
        console.log("==> [sendMessage] 创建新会话");
        const createRes = await request({
            url: "/api/sessions/create", 
            method: "POST",
            data: { firstMessage: msgContent }
        });
        if (!createRes || !createRes.sessionId) {
          this.setData({ isLoading: false });
          return wx.showToast({ title: "创建新会话失败", icon: "none" });
        }
        currentOpenSid = createRes.sessionId;
        // 不立即刷新会话列表，等待消息发送完成后再刷新
      } catch (e) {
        console.error("==> [sendMessage] 创建会话失败", e);
        this.setData({ isLoading: false });
        return wx.showToast({ title: "创建会话失败", icon: "none" });
      }
    }

    const userMsg = { role: "user", content: msgContent };
    this.setData({
      messages: [...this.data.messages, userMsg],
      inputValue: "",
    }, () => this.scrollToBottom());

    try {
      const chatRes = await request({
        url: "/api/chat",
        method: "POST",
        data: { sessionId: currentOpenSid, question: msgContent }
      });
      
      const botMsg = { role: "assistant", content: chatRes.answer || "对不起，暂时无法回答。" };
      
      // 如果是新会话，需要刷新会话列表，并更新当前会话ID
      if (!this.data.currentSessionId || this.data.isNewSession) {
        await this.fetchSessions();
        this.setData({
          currentSessionId: currentOpenSid,
          isNewSession: false
        });
      }
      
      this.setData({
        messages: [...this.data.messages, botMsg],
        isLoading: false
      }, () => this.scrollToBottom());
    } catch (e) {
      console.error("==> [sendMessage] 异常", e);
      const errorMsg = { role: "assistant", content: "抱歉，发生错误，请稍后再试。" };
      
      // 即使发生错误，如果是新会话，也要尝试更新会话列表
      if (!this.data.currentSessionId || this.data.isNewSession) {
        try {
          await this.fetchSessions();
          this.setData({
            currentSessionId: currentOpenSid,
            isNewSession: false
          });
        } catch (listErr) {
          console.error("==> [sendMessage] 更新会话列表失败", listErr);
        }
      }
      
      this.setData({
        messages: [...this.data.messages, errorMsg],
        isLoading: false
      }, () => this.scrollToBottom());
      wx.showToast({ title: "消息发送失败", icon: "none" });
    }
  }
});