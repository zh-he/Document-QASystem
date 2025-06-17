App({
    onLaunch() {
      // 启动时，从本地缓存里取出之前保存的令牌
      const access = wx.getStorageSync('accessToken') || '';
      const refresh = wx.getStorageSync('refreshToken') || '';
      this.globalData.accessToken  = access;
      this.globalData.refreshToken = refresh;
      console.log('Loaded tokens:', { access, refresh });
    },
  
    // 登录成功后，调用这个方法统一保存到 globalData + 本地缓存
    setTokens(accessToken, refreshToken) {
      this.globalData.accessToken  = accessToken;
      this.globalData.refreshToken = refreshToken;
      wx.setStorageSync('accessToken', accessToken);
      wx.setStorageSync('refreshToken', refreshToken);
    },
  
    globalData: {
      accessToken:  '',
      refreshToken: '',
      userInfo:     {}
    }
  });
  