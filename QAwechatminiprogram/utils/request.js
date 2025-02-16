// utils/request.js
const baseURL = "http://127.0.0.1:5000"; // 替换为你的后端域名

function request({url, data={}, method="GET"}) {
  return new Promise((resolve, reject) => {
    const app = getApp();
    wx.request({
      url: baseURL + url,
      data: data,
      method: method,
      header: {
        'content-type': 'application/json',  // 确保请求的内容类型为JSON
        'Authorization': 'Bearer ' + (app.globalData.token || "")
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) { // <---  修改为判断 2xx 范围
          resolve(res.data);
        } else {
          reject(res.data);  // 返回错误信息
        }
      },
      fail: (err) => {
        reject(err);  // 请求失败时返回错误信息
      }
    });
  });
}

module.exports = {
  request
};