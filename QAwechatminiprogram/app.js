// app.js
App({
    onLaunch() {
      // 可以放置一些初始化逻辑，如检查更新等
      console.log("App Launch");
    },
  
    globalData: {
      // 用于存储全局状态：如登录信息、session、用户数据等
      token: "",
      userInfo: {}
    }
  });
  