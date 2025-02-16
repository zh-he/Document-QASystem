import { request } from "../../utils/request"; // 引入封装的 request 方法

Page({
  data: {
    sessionList: [],
    currentSessionId: "",
    messageList: [],
    currentMsg: "",
    loading: false,
    showSessionList: false,

    // 用于 scroll-into-view 定位到最新一条消息
    lastMsgId: "",

    // 操作菜单 & 重命名
    showActionsMenuSessionId: "",
    editingSessionId: ""
  },

  onLoad() {
    this.fetchSessions();
  },

  // 切换会话侧边栏显示
  toggleSessionList() {
    this.setData({
      showSessionList: !this.data.showSessionList,
      showActionsMenuSessionId: ""
    });
  },

  // 获取会话列表
  async fetchSessions() {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: "/api/sessions",
        method: "GET"
      });
      this.setData({
        sessionList: res.sessions || [],
        loading: false
      });
    } catch (e) {
      console.error("Error fetching sessions:", e);
      this.setData({ loading: false });
    }
  },

  // 选择某个会话
  async onSelectSession(e) {
    const sid = e.currentTarget.dataset.id;
    this.setData({
      currentSessionId: sid,
      messageList: [], // 先清空消息列表
      lastMsgId: "",   // 先重置 lastMsgId 为空
      loading: true,
      showSessionList: false,
      showActionsMenuSessionId: ""
    });
    await this.fetchMessages(sid); // 再加载消息
  },
  async fetchMessages(sessionId) {
    try {
      const res = await request({
        url: `/api/sessions/${sessionId}`,
        method: "GET"
      });
  
      this.setData({
        messageList: res.messages || [],
        loading: false
      }, () => {
        // 增加延迟确保渲染完成
        setTimeout(() => {
          this.scrollToBottom(true); // 强制滚动
        }, 300);
      });
  
    } catch (e) { 
        console.error("Error fetching messages:", e);
        this.setData({ loading: false });
     }
  },


  // 删除会话
  async onDeleteSession(e) {
    const sid = e.currentTarget.dataset.id || e.currentTarget.dataset.sessionId;
    try {
      await request({
        url: `/api/sessions/${sid}/delete`,
        method: "POST"
      });
      if (this.data.currentSessionId === sid) {
        this.setData({
          currentSessionId: "",
          messageList: []
        });
      }
      this.setData({ showActionsMenuSessionId: "" });
      await this.fetchSessions();
    } catch (e) {
      console.error("Error deleting session:", e);
      wx.showToast({
        title: "删除失败",
        icon: "none"
      });
    }
  },

  // 显示/隐藏操作菜单
  toggleSessionActionsMenu(e) {
    const sid = e.currentTarget.dataset.id;
    this.setData({
      showActionsMenuSessionId: this.data.showActionsMenuSessionId === sid ? "" : sid
    });
  },

  // 进入重命名状态：点击“重命名”后设置编辑状态并聚焦输入框
  onRenameSession(e) {
    e.stopPropagation && e.stopPropagation();
    const sid = e.currentTarget.dataset.sessionId;
    this.setData({
      editingSessionId: sid,
      showActionsMenuSessionId: ""
    });
  },

  // 实时更新输入的会话标题
  onSessionTitleInput(e) {
    const sid = e.currentTarget.dataset.id;
    const newTitle = e.detail.value;
    const sessions = this.data.sessionList.map(item => {
      if (item.id === sid) {
        return { ...item, title: newTitle };
      }
      return item;
    });
    this.setData({
      sessionList: sessions
    });
  },

  // 失去焦点时提交重命名请求
  async onSessionTitleBlur(e) {
    const sid = e.currentTarget.dataset.id;
    const newTitle = e.detail.value;
    try {
      await request({
        url: `/api/sessions/${sid}/rename`,
        method: "POST",
        data: { title: newTitle }
      });
    } catch (err) {
      console.error("Error renaming session:", err);
      wx.showToast({
        title: "重命名失败",
        icon: "none"
      });
    }
    this.setData({
      editingSessionId: ""
    });
  },

  // 输入框
  onInputMessage(e) {
    this.setData({ currentMsg: e.detail.value });
  },

  // 发送消息
  async onSend() {
    const msg = this.data.currentMsg.trim();
    if (!msg) return;

    // 若无会话，则先创建
    if (!this.data.currentSessionId) {
      try {
        const res = await request({
          url: "/api/sessions/create",
          method: "POST"
        });
        if (res.sessionId) {
          this.setData({ currentSessionId: res.sessionId });
          await this.fetchSessions();
        } else {
          wx.showToast({
            title: "未返回有效的 sessionId",
            icon: "none"
          });
          return;
        }
      } catch (e) {
        console.error("Error creating session:", e);
        wx.showToast({
          title: "创建会话失败",
          icon: "none"
        });
        return;
      }
    }

    // 先在前端添加一条“用户”消息
    const newMessage = {
      role: "user",
      content: msg
    };
    this.setData({
      messageList: [...this.data.messageList, newMessage],
      currentMsg: "",
      loading: true
    }, () => {
      // 滚动到底部
      this.scrollToBottom();
    });

    // 调用后端
    try {
      const res = await request({
        url: "/api/chat",
        method: "POST",
        data: {
          sessionId: this.data.currentSessionId,
          question: msg
        }
      });
      const botMessage = {
        role: "bot",
        content: res.answer || "对不起，我没有理解您的问题"
      };
      this.setData({
        messageList: [...this.data.messageList, botMessage],
        loading: false
      }, () => {
        // 再滚到底部
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("Error sending message:", e);
      wx.showToast({
        title: "发送失败",
        icon: "none"
      });
      this.setData({ loading: false });
    }
  },

  // 滚动到底：让 lastMsgId 指向最后一条消息
  scrollToBottom() {
    console.log('scrollToBottom 函数被调用了!');
    console.log('messageList 长度:', this.data.messageList.length); // 输出 messageList 的长度
  
    if (this.data.messageList.length === 0) {
      console.log('messageList 为空，不进行滚动'); // 添加日志：messageList 为空的情况
      this.setData({ lastMsgId: "" });
      return;
    }
  
    const lastIndex = this.data.messageList.length - 1;
    const calculatedLastMsgId = "msg-" + lastIndex; // 先计算出期望的 lastMsgId 值
    console.log('计算出的 lastMsgId:', calculatedLastMsgId); // 输出计算出的 lastMsgId
  
    console.log('准备设置 setData({ lastMsgId: ... })'); // 设置 setData 前的日志
    this.setData({
      lastMsgId: calculatedLastMsgId
    }, () => {
      console.log('setData 完成，lastMsgId 已设置为:', this.data.lastMsgId); // 设置 setData 后的日志
      console.log('scroll-into-view 应该会滚动到 id 为:', this.data.lastMsgId, '的元素'); // 提示 scroll-into-view 应该做的事情
    });
  }
});
