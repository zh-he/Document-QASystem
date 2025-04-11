// 引入封装的 request 方法 (来自你的原始代码)
import { request } from "../../utils/request";

Page({
  data: {
    sessions: [],
    currentSessionId: "",
    messages: [],
    inputValue: "",
    isLoading: false, // 用于表示消息加载或机器人回复等待状态
    showSessionList: false, // 控制左侧会话列表的显示/隐藏
    scrollTop: 0 // 使用 scrollTop
  },

  // --- 生命周期回调函数 ---
  onLoad() {
    console.log("==> [onLoad] 页面加载");
    this.fetchSessions(); // 页面加载时获取会话列表
    // 可选：如果获取到会话列表，自动选择第一个会话加载消息
    // .then(() => {
    //   if (!this.data.currentSessionId && this.data.sessions.length > 0) {
    //     this.selectSession({ currentTarget: { dataset: { id: this.data.sessions[0].id } } });
    //   }
    // });
  },

  // --- 全局点击隐藏操作菜单 ---
  handlePageTap(e) {
    // 判断 sessions 中是否有菜单正在展示
    const hasMenuOpen = this.data.sessions.some(s => s.showMenu);
    if (hasMenuOpen) {
      const updatedSessions = this.data.sessions.map(s => ({ ...s, showMenu: false }));
      this.setData({ sessions: updatedSessions });
    }
  },

  // --- 会话管理相关函数 ---

  // 切换会话侧边栏显示/隐藏
  toggleSessionList() {
    console.log("==> [toggleSessionList] showSessionList from:", this.data.showSessionList, "to:", !this.data.showSessionList);
    this.setData({
      showSessionList: !this.data.showSessionList
    });
  },

  // 创建新会话
  async createNewSession() {
    console.log("==> [createNewSession] 请求创建新会话");
    try {
      const res = await request({
        url: "/api/sessions/create", // 请替换为你的 API 地址
        method: "POST"
      });
      console.log("==> [createNewSession] 后端返回:", res);
      if (res.sessionId) {
        // 创建新会话后，设置其为当前会话，并清空消息列表
        this.setData({
          currentSessionId: res.sessionId,
          messages: [], // 新会话开始时消息列表为空
          showSessionList: false // 创建后通常关闭侧边栏
        });
        console.log("==> [createNewSession] 设置 currentSessionId =", res.sessionId);
        // 重新获取会话列表以在侧边栏显示新会话
        await this.fetchSessions();
        // 新创建的会话没有历史消息，不需要调用 fetchMessages 或 scrollToBottom
      } else {
        wx.showToast({ title: "未返回有效的会话ID", icon: "none" });
      }
    } catch (e) {
      console.error("==> [createNewSession] 创建会话异常:", e);
      wx.showToast({ title: "创建会话失败", icon: "none" });
    }
  },

  // 获取会话列表
  async fetchSessions() {
    console.log("==> [fetchSessions] 开始获取会话列表");
    this.setData({ isLoading: true }); // 可以用 isLoading 表示正在加载列表
    try {
      const res = await request({
        url: "/api/sessions", // 请替换为你的 API 地址
        method: "GET"
      });
      console.log("==> [fetchSessions] 后端返回 sessions:", res);
      this.setData({
        sessions: res.sessions || [],
        isLoading: false // 列表加载完成
      });
      console.log("==> [fetchSessions] sessions 已更新:", this.data.sessions);
      // 可选：检查当前是否有选中会话，若无且列表不空，则自动选第一个
      if (!this.data.currentSessionId && this.data.sessions.length > 0) {
        console.log("==> [fetchSessions] 无选中会话，自动选择第一个");
        this.selectSession({ currentTarget: { dataset: { id: this.data.sessions[0].id } } });
      }
    } catch (e) {
      console.error("==> [fetchSessions] 获取会话列表异常:", e);
      this.setData({ isLoading: false }); // 出错也要结束加载状态
      wx.showToast({ title: '加载列表失败', icon: 'none' });
    }
  },

  // 选择某个会话
  async selectSession(e) {
    const sid = e.currentTarget.dataset.id;
    // 如果点击的是当前已选中的会话，则只关闭侧边栏（如果打开的话），不重新加载
    if (sid === this.data.currentSessionId && this.data.showSessionList) {
      this.setData({ showSessionList: false });
      return;
    }
    // 如果点击的是当前已选中的会话，但侧边栏是关闭的，则什么都不做
    if (sid === this.data.currentSessionId) {
      return;
    }

    console.log("==> [selectSession] 选中了会话ID:", sid);
    // 切换会话时，清空旧消息，显示加载状态，关闭侧边栏
    this.setData({
      currentSessionId: sid,
      messages: [],
      isLoading: true, // 开始加载该会话的消息
      showSessionList: false
    });
    // 获取并显示选中会话的消息
    await this.fetchMessages(sid);
  },

  // 显示会话操作菜单 (例如重命名、删除)
  showActionsMenu(e) {
    // 阻止事件冒泡，防止触发全局点击隐藏
    e.stopPropagation && e.stopPropagation();
    const sid = e.currentTarget.dataset.id;
    console.log("==> [showActionsMenu] 显示/隐藏操作菜单, sessionId =", sid);
    // 更新 sessions 数组，切换对应项的 showMenu 状态，并隐藏其他项的菜单
    const updatedSessions = this.data.sessions.map(item => {
      if (item.id === sid) {
        return { ...item, showMenu: !item.showMenu };
      } else {
        return { ...item, showMenu: false };
      }
    });
    this.setData({ sessions: updatedSessions });
  },

  // 删除会话
  async deleteSession(e) {
    // 阻止事件冒泡
    const sid = e.currentTarget.dataset.id;
    console.log("==> [deleteSession] 准备删除会话ID:", sid);

    // 弹出确认框，防止误删
    wx.showModal({
      title: '确认删除',
      content: '你确定要删除此会话吗？此操作不可恢复。',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#e53935', // 确认按钮用警示色
      cancelColor: '#666666',
      success: async (res) => {
        if (res.confirm) {
          // 用户点击了“删除”
          console.log("==> [deleteSession] 用户确认删除");
          try {
            await request({
              url: `/api/sessions/${sid}/delete`, // 你的删除 API 端点
              method: "POST" // 或者 "DELETE"，根据你的后端
            });
            console.log("==> [deleteSession] 后端删除成功, 被删会话ID =", sid);
            // 如果删除的是当前正在查看的会话，需要清空聊天界面
            if (this.data.currentSessionId === sid) {
              this.setData({
                currentSessionId: "",
                messages: []
              });
            }
            // 删除后，隐藏所有可能打开的菜单，并刷新会话列表
            this.setData({
              sessions: this.data.sessions.filter(s => s.id !== sid).map(s => ({ ...s, showMenu: false }))
            });
            wx.showToast({ title: '删除成功', icon: 'success', duration: 1000 });
          } catch (e) {
            console.error("==> [deleteSession] 删除会话异常:", e);
            wx.showToast({ title: "删除失败", icon: "none" });
            // 即使失败，也隐藏菜单
            this.setData({
              sessions: this.data.sessions.map(s => ({ ...s, showMenu: false }))
            });
          }
        } else {
          // 用户点击了“取消”
          console.log("==> [deleteSession] 用户取消删除");
          // 用户取消，仅需隐藏菜单
          this.setData({
            sessions: this.data.sessions.map(s => s.id === sid ? { ...s, showMenu: false } : s)
          });
        }
      }
    });
  },

  // 重命名会话
  renameSession(e) {
    // 阻止事件冒泡
    const sid = e.currentTarget.dataset.id;
    // 找到当前会话的旧标题用于输入框默认值 (可选)
    const currentSession = this.data.sessions.find(s => s.id === sid);
    const oldTitle = currentSession ? currentSession.title : '';

    console.log("==> [renameSession] 进入重命名状态, sessionId =", sid);

    // 弹出带有输入框的模态对话框
    wx.showModal({
      title: '重命名会话',
      editable: true, // 允许编辑
      placeholderText: '请输入新的会话名称', // 输入框提示文字
      content: oldTitle, // 设置默认值为旧标题
      success: async (res) => {
        if (res.confirm) {
          const newTitle = res.content ? res.content.trim() : ''; // 获取输入内容
          // 用户点击确认
          if (!newTitle) {
            wx.showToast({ title: '名称不能为空', icon: 'none' });
            // 保持菜单关闭状态或根据需要处理
            this.setData({ sessions: this.data.sessions.map(s => ({ ...s, showMenu: false })) });
            return;
          }
          if (newTitle === oldTitle) {
            console.log("==> [renameSession] 名称未改变，取消操作");
            this.setData({ sessions: this.data.sessions.map(s => ({ ...s, showMenu: false })) });
            return; // 名称未变，不请求后端
          }

          console.log("==> [renameSession] 用户确认重命名, 新名称:", newTitle);
          try {
            await request({
              url: `/api/sessions/${sid}/rename`, // 你的重命名 API 端点
              method: "POST", // 或者 "PUT"
              data: { title: newTitle } // 发送新名称给后端
            });
            // 重命名成功后，隐藏菜单并刷新会话列表以显示新名称
            // 可前端直接修改，减少一次 fetch 请求
            const updatedSessions = this.data.sessions.map(s => {
              if (s.id === sid) {
                return { ...s, title: newTitle, showMenu: false };
              }
              return { ...s, showMenu: false };
            });
            this.setData({ sessions: updatedSessions });
            wx.showToast({ title: '重命名成功', icon: 'success', duration: 1000 });
          } catch (err) {
            console.error("==> [renameSession] 重命名异常:", err);
            wx.showToast({ title: "重命名失败", icon: "none" });
            // 即使失败，也隐藏菜单
            this.setData({ sessions: this.data.sessions.map(s => ({ ...s, showMenu: false })) });
          }
        } else {
          // 用户取消
          console.log("==> [renameSession] 用户取消重命名");
          // 隐藏菜单
          this.setData({ sessions: this.data.sessions.map(s => ({ ...s, showMenu: false })) });
        }
      }
    });
  },

  // --- 消息处理与交互 ---

  // 获取会话消息
  async fetchMessages(sessionId) {
    console.log("==> [fetchMessages] 开始获取会话消息, sessionId =", sessionId);
    // isLoading 状态已在 selectSession 中设置
    try {
      const res = await request({
        url: `/api/sessions/${sessionId}`, // 获取指定会话消息的 API
        method: "GET"
      });
      console.log("==> [fetchMessages] 后端返回:", res);

      // 假设后端返回的消息数组是按时间顺序排列好的
      const messages = res.messages || [];
      console.log("==> [fetchMessages] 准备设置 messages:", messages);

      // 使用 setData 更新消息列表，并在回调函数中执行滚动操作
      this.setData({
        messages: messages,
        isLoading: false // 消息加载完成，结束加载状态
      }, () => {
        console.log("==> [fetchMessages:setData callback] messages 更新完成，准备滚动");
        // 调用滚动到底部的函数
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("==> [fetchMessages] 获取消息异常:", e);
      // 获取消息失败，也要结束加载状态，并可能显示错误提示
      this.setData({ isLoading: false });
      wx.showToast({ title: "加载消息失败", icon: 'none' });
    }
  },

  // 通过 scrollTop 滚动到底部
  scrollToBottom() {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery();
      query.select(".msg-wrapper").boundingClientRect(rect => {
        if (rect) {
          this.setData({ scrollTop: rect.height * 10000 });
          console.log("==> [scrollToBottom] Setting scrollTop to:", rect.height);
        }
      }).exec();
    });
  },

  // 监听输入框内容变化
  onInputChange(e) {
    // 将输入框的值同步到 data 中
    this.setData({ inputValue: e.detail.value });
  },

  // 发送消息
  async sendMessage() {
    const msg = this.data.inputValue.trim(); // 获取输入内容并去除首尾空格
    console.log("==> [sendMessage] 用户点击发送, msg =", msg);

    if (!msg) {
      console.log("==> [sendMessage] 输入消息为空, 不发送");
      wx.showToast({ title: '不能发送空消息', icon: 'none' });
      return; // 输入为空，直接返回
    }

    let currentSessionId = this.data.currentSessionId; // 获取当前会话 ID

    // 检查：如果当前没有选中任何会话
    if (!currentSessionId) {
      console.log("==> [sendMessage] 没有 currentSessionId, 尝试创建新会话...");
      try {
        const res = await request({ url: "/api/sessions/create", method: "POST" });
        console.log("==> [sendMessage] 创建会话返回:", res);
        if (res.sessionId) {
          currentSessionId = res.sessionId; // 更新 currentSessionId
          this.setData({ currentSessionId: currentSessionId, messages: [] }); // 更新 data
          console.log("==> [sendMessage] 新会话ID =", currentSessionId);
          await this.fetchSessions(); // 刷新侧边栏
        } else {
          wx.showToast({ title: "创建会话失败，无法发送", icon: "none" });
          return; // 创建失败则无法发送
        }
      } catch (e) {
        console.error("==> [sendMessage] 创建会话异常:", e);
        wx.showToast({ title: "创建会话失败，无法发送", icon: "none" });
        return; // 创建异常也无法发送
      }
    }

    // 乐观更新 UI：先将用户消息添加到消息列表
    const newMessage = { role: "user", content: msg };
    const updatedMessages = [...this.data.messages, newMessage];
    console.log("==> [sendMessage] 插入用户消息 (乐观更新):", newMessage);

    // 更新界面：显示用户消息，清空输入框，显示等待状态，并在回调中滚动
    this.setData({
      messages: updatedMessages,
      inputValue: "", // 清空输入框
      isLoading: true // 开始等待机器人回复
    }, () => {
      console.log("==> [sendMessage:setData callback user] 用户消息已更新，准备滚动");
      this.scrollToBottom();
    });

    // 调用后端聊天接口
    try {
      const chatRes = await request({
        url: "/api/chat", // 你的聊天 API 端点
        method: "POST",
        data: {
          sessionId: currentSessionId, // 发送当前会话 ID
          question: msg // 发送用户的问题
        }
      });
      console.log("==> [sendMessage] 后端 /api/chat 返回:", chatRes);

      const botMessage = {
        role: "assistant", // 假设机器人 role 为 'assistant'
        content: chatRes.answer || "对不起，我暂时无法回答您的问题。" // 后端可能未返回 answer 时的兜底提示
      };
      console.log("==> [sendMessage] 插入机器人回复:", botMessage);
      const finalMessages = [...this.data.messages, botMessage];
      this.setData({
        messages: finalMessages,
        isLoading: false // 结束等待
      }, () => {
        console.log("==> [sendMessage:setData callback assistant] 机器人消息已更新，准备滚动");
        this.scrollToBottom();
      });
    } catch (e) {
      console.error("==> [sendMessage] 调用 /api/chat 异常:", e);
      const errorBotMessage = { role: "assistant", content: "抱歉，发生错误，请稍后重试。" };
      this.setData({
        messages: [...this.data.messages, errorBotMessage],
        isLoading: false // 结束等待状态
      }, () => {
        this.scrollToBottom();
      });
      wx.showToast({ title: "消息发送失败", icon: "none" });
    }
  }
});
