// pages/modify_password/modify_password.js
import { request } from "../../utils/request";

Page({
  data: {
    oldPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  },

  onLoad() {},

  onOldPasswordInput(e) {
    this.setData({ oldPassword: e.detail.value });
  },
  onNewPasswordInput(e) {
    this.setData({ newPassword: e.detail.value });
  },
  onConfirmNewPasswordInput(e) {
    this.setData({ confirmNewPassword: e.detail.value });
  },

  async onChangePassword() {
    const { oldPassword, newPassword, confirmNewPassword } = this.data;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      wx.showToast({
        title: "所有密码字段不能为空",
        icon: "none"
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      wx.showToast({
        title: "两次输入的新密码不一致",
        icon: "none"
      });
      return;
    }
    if (newPassword.length < 6) {
      wx.showToast({
        title: "新密码长度至少为6位",
        icon: "none"
      });
      return;
    }

    wx.showLoading({ title: "修改密码中...", mask: true });
    const token = wx.getStorageSync("token");

    try {
      // 这里的 res 就是后端的 JSON { "success": bool, "message": str, "error": str }
      const res = await request({
        url: "/api/profile/password",
        method: "POST",
        header: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        data: { oldPassword, newPassword }
      });

      wx.hideLoading();
      console.log("修改密码接口返回: ", res);

      // 根据 res.success 判断
      if (res.success) {
        wx.showToast({
          title: res.message || "密码修改成功",
          icon: "none",
          duration: 2000
        });
        // 如果要强制重新登录：
        wx.removeStorageSync("token");
        setTimeout(() => {
          wx.reLaunch({ url: "/pages/login/login" });
        }, 1000);
      } else {
        // 修改失败
        const errorMsg = res.error || "密码修改失败";
        wx.showToast({
          title: errorMsg,
          icon: "none"
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error("修改密码失败", error);
      wx.showToast({
        title: "网络错误，请稍后重试",
        icon: "none"
      });
    }
  }
});
