// pages/login/login.js
import { request } from "../../utils/request";

Page({
  data: {
    username: "",
    password: ""
  },

  onLoad() {},

  onInputUsername(e) {
    this.setData({ username: e.detail.value });
  },
  onInputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  async onLogin() {
    if(!this.data.username || !this.data.password){
      wx.showToast({
        title: "请输入用户名和密码",
        icon: "none"
      });
      return;
    }
    try {
      const res = await request({
        url: "/api/login",
        method: "POST",
        data: {
          username: this.data.username,
          password: this.data.password
        }
      });
      if(res.error) {
        wx.showToast({
          title: res.error,
          icon: "none"
        });
        return;
      }
      // 登录成功
      const app = getApp();
      app.globalData.token = res.token || ""; // 从后端响应中获取 token 并赋值给 globalData
      wx.setStorage({  //  <---  **强烈建议使用 wx.setStorage 持久化存储 Token**
        key: 'token',
        data: res.token,
      });
      // 也可存储 userInfo (如果后端返回了用户信息)
      wx.showToast({
        title: "登录成功",
        icon: "success"
      });
      // 跳转到问答页
      wx.switchTab({ url: "/pages/qa/qa" });
    } catch(e) {
      wx.showToast({
        title: "登录失败",
        icon: "none"
      });
    }
  },

  // 注册功能
  onRegister() {
    wx.navigateTo({
      url: '/pages/register/register'  // 跳转到注册页面
    });
  }
});