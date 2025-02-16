// pages/register/register.js
import { request } from "../../utils/request";

Page({
  data: {
    username: "",
    password: "",
    confirmPassword: ""
  },

  onInputUsername(e) {
    this.setData({ username: e.detail.value });
  },

  onInputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  onInputConfirmPassword(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  async onRegister() {
    if (!this.data.username || !this.data.password || !this.data.confirmPassword) {
      wx.showToast({
        title: "请填写所有信息",
        icon: "none"
      });
      return;
    }

    if (this.data.password !== this.data.confirmPassword) {
      wx.showToast({
        title: "密码和确认密码不一致",
        icon: "none"
      });
      return;
    }

    try {
      // 在发送请求时，将请求的数据转换为 JSON 格式
      const res = await request({
        url: "/api/register",
        method: "POST",
        data: JSON.stringify({
          username: this.data.username,
          password: this.data.password
        })
      });

      if (res.error) {
        wx.showToast({
          title: res.error,
          icon: "none"
        });
        return;
      }

      wx.showToast({
        title: "注册成功",
        icon: "success"
      });
      // 注册成功后可以跳转到登录页或自动登录
      wx.navigateBack();
    } catch (e) {
      wx.showToast({
        title: "注册失败",
        icon: "none"
      });
    }
  }
});
