// profile.js
import { request } from "../../utils/request"; // 引入封装的 request 方法
const app = getApp();

Page({
  data: {
    userInfo: {},
  },

  async onLoad() {
    await this.fetchProfile();
  },

  // 获取个人信息
  async fetchProfile() {
    wx.showLoading({
      title: '加载中...',
      mask: true,
    });

    // 从本地存储中获取 token
    const token = wx.getStorageSync('token');
    console.log("Token:", token);
    if (!token) {
      wx.showToast({
        title: '未获取到 token，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      wx.redirectTo({
        url: '/pages/login/login',
      });
      wx.hideLoading();
      return;
    }

    try {
      const res = await request({
        url: '/api/profile',
        method: 'GET',
        header: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      });
      console.log("API 响应完整 res:", res);

      // 判断返回数据中是否包含 username 字段
      if (res && res.username) {
        this.setData({
          userInfo: {
            username: res.username,
            // 格式化注册时间，只取年月日
            createdAt: res.created_at ? res.created_at.substring(0, 10) : '',
            document_names: res.document_names,
          },
        });
      } else {
        wx.showToast({
          title: '加载个人信息失败',
          icon: 'none',
          duration: 2000,
        });
      }
    } catch (e) {
      console.error("请求失败:", e);
      wx.showToast({
        title: '网络错误，请稍后重试',
        icon: 'none',
        duration: 2000,
      });
    } finally {
      wx.hideLoading();
      console.log("请求 complete，隐藏 loading");
    }
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '确认退出登录？',
      content: '退出后将无法使用问答功能',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync('token'); // 移除 token
          wx.reLaunch({
            url: '/pages/login/login', // 跳转回登录页
          });
        }
      },
    });
  },

goToModifyPassword: function() {
    wx.navigateTo({
      url: '/pages/modify_password/modify_password',
    });
  },
});

