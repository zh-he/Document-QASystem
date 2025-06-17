import {
    request
} from "../../utils/request";
const app = getApp();

Page({
    data: {
        userInfo: {}
    },

    async onLoad() {
        await this.fetchProfile();
    },

    async fetchProfile() {
        wx.showLoading({
            title: '加载中...',
            mask: true
        });

        try {
            const res = await request({
                url: '/api/profile',
                method: 'GET'
            });
            console.log("API 响应:", res);

            if (res && res.username) {
                this.setData({
                    userInfo: {
                        username: res.username,
                        createdAt: res.created_at ? res.created_at.slice(0, 10) : '',
                        document_names: res.document_names || []
                    }
                });
            } else {
                wx.showToast({
                    title: '加载个人信息失败',
                    icon: 'none'
                });
            }
        } catch (e) {
            console.error("请求失败:", e);
            wx.showToast({
                title: '网络或身份已过期，请重新登录',
                icon: 'none'
            });
            wx.reLaunch({
                url: '/pages/login/login'
            });
        } finally {
            wx.hideLoading();
        }
    },

    goToModifyPassword() {
        wx.navigateTo({
            url: '/pages/modify_password/modify_password'
        });
    },

    onLogout() {
        wx.showModal({
            title: '确认退出登录？',
            content: '退出后将无法使用问答功能',
            success: res => {
                if (res.confirm) {
                    const app = getApp();
                    app.globalData.accessToken = '';
                    app.globalData.refreshToken = '';
                    wx.clearStorageSync('accessToken');
                    wx.clearStorageSync('refreshToken');
                    wx.reLaunch({
                        url: '/pages/login/login'
                    });
                }
            }
        });
    }
});