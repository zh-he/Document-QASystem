const baseURL = "http://127.0.0.1:8000"; 

function request({ url, data = {}, method = "GET" }) {
  const app = getApp();

  return new Promise((resolve, reject) => {
    const doRequest = () => {
      wx.request({
        url: baseURL + url,
        data,
        method,
        header: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + (app.globalData.accessToken || "")
        },
        success: res => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);

          // access token 过期或无效
          } else if (res.statusCode === 401 && app.globalData.refreshToken) {
            // 尝试用 refreshToken 刷新
            wx.request({
              url: baseURL + '/api/token/refresh',
              method: 'POST',
              header: {
                'Authorization': 'Bearer ' + app.globalData.refreshToken
              },
              success: refreshRes => {
                if (refreshRes.statusCode === 200 && refreshRes.data.access_token) {
                  // 更新新的 accessToken，然后重试
                  app.globalData.accessToken = refreshRes.data.access_token;
                  wx.setStorageSync('accessToken', refreshRes.data.access_token);
                  doRequest();
                } else {
                  // 刷新失败，直接 reject 刷新接口的返回
                  reject(refreshRes.data);
                }
              },
              fail: err => {
                reject(err);
              }
            });

          // 其它错误
          } else {
            reject(res.data);
          }
        },
        fail: err => {
          reject(err);
        }
      });
    };

    // 发起第一次请求
    doRequest();
  });
}

module.exports = {
  request
};
