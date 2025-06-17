import { request } from "../../utils/request";

Page({
  data: {
    username: "",
    password: "",
    confirmPassword: "",
    isAgree: false
  },

  /* ===== 输入绑定 ===== */
  onInputUsername(e)       { this.setData({ username: e.detail.value.trim() }); },
  onInputPassword(e)       { this.setData({ password: e.detail.value }); },
  onInputConfirmPassword(e){ this.setData({ confirmPassword: e.detail.value }); },
  toggleAgreement()        { this.setData({ isAgree: !this.data.isAgree }); },
  onViewAgreement()        { wx.navigateTo({ url: "/pages/agreement/agreement" }); },

  /* ===== 注册 ===== */
  async onRegister() {
    const { username, password, confirmPassword, isAgree } = this.data;

    /* ---------- 前端校验 ---------- */
    if (!username || !password || !confirmPassword)
      return wx.showToast({ title: "请填写所有信息", icon: "none" });
    if (!isAgree)
      return wx.showToast({ title: "请先阅读并同意《用户协议》", icon: "none" });
    if (password.length < 8)
      return wx.showToast({ title: "密码长度不能少于8位", icon: "none" });
    if (password !== confirmPassword)
      return wx.showToast({ title: "密码和确认密码不一致", icon: "none" });

/* ---------- 提交到后端 ---------- */
try {
    const res = await request({
      url: "/api/register",
      method: "POST",
      data: { username, password }
    });

    const statusCode = res.statusCode ?? 201;              // 默认成功
    const data       = res.data       ?? res;              // 兼容两种结构
    const errMsg     = data.error     || data.msg || "";
  
    /* 1) 用户名已存在 */
    if (
      statusCode === 400 &&
      /已存在|已被注册|exists/i.test(errMsg)
    ) {
      return wx.showToast({ title: "该用户名已被注册", icon: "none" });
    }
  
    /* 2) 其它后端错误（非 201） */
    if (statusCode !== 201) {
      return wx.showToast({ title: errMsg || "注册失败，请重试", icon: "none" });
    }
  
    /* 3) 成功：201 */
    wx.showToast({ title: data.message || "注册成功", icon: "success" });
    return setTimeout(() => wx.redirectTo({ url: "/pages/login/login" }), 1200);
  
  } catch (err) {
    /* 4) 封装把 400/409 直接 reject —— 从 err 对象里取 error 字段 */
    const msg = err?.data?.error || err?.data?.msg || err.errMsg || "";
    if (/已存在|已被注册|exists/i.test(msg)) {
      return wx.showToast({ title: "该用户名已被注册", icon: "none" });
    }
    wx.showToast({ title: "注册失败，请重试", icon: "none" });
  }
},
  
  /* ===== 已有账号，去登录 ===== */
  onLoginLink() {
    wx.redirectTo({ url: "/pages/login/login" });
  }
});
