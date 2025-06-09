import { request } from "../../utils/request";

Page({
  data: {
    username: "",
    password: "",
    isLoading: false
  },

  /* ===== 工具函数 ===== */
  showToast(msg, success = false) {
    wx.showToast({
      title: msg,
      icon: success ? "success" : "none",
      duration: 2000
    });
  },

  clearInputs() {
    this.setData({ username: "", password: "" });
  },

  /* ===== 双向绑定 ===== */
  onInputUsername(e) {
    this.setData({ username: e.detail.value });
  },
  onInputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  /* ===== 忘记密码 ===== */
  onForgotPassword() {
    this.showToast("请联系管理员重置密码");
  },

  /* ===== 登录 ===== */
  async onLogin() {
    const { username, password } = this.data;

    if (!username.trim()) {
      this.showToast("请输入用户名");
      return;
    }
    if (!password) {
      this.showToast("请输入密码");
      return;
    }

    this.setData({ isLoading: true });

    try {
      const res = await request({
        url: "/api/login",
        method: "POST",
        data: { username, password }
      });

      if (res.error) {
        // 登录失败：提示 + 清空输入框
        this.showToast("登录失败，请重新输入账号密码");
        this.clearInputs();
        return;
      }

      // 登录成功
      const app = getApp();
      app.setTokens(res.access_token, res.refresh_token);

      if (res.userInfo) {
        app.globalData.userInfo = res.userInfo;
        wx.setStorageSync("userInfo", res.userInfo);
      }

      this.showToast("登录成功", true);
      setTimeout(() => {
        wx.switchTab({ url: "/pages/qa/qa" });
      }, 800);
    } catch (e) {
      console.error("登录请求异常:", e);
      this.showToast("登录失败，请重新输入账号密码");
      this.clearInputs();
    } finally {
      this.setData({ isLoading: false });
    }
  },

  /* ===== 跳转注册 ===== */
  onRegister() {
    wx.navigateTo({ url: "/pages/register/register" });
  }
});
