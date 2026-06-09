const { db } = require('../data/database');
const { signToken, comparePassword } = require('../middleware/auth');
const { success, fail, unauthorized } = require('../utils/response');

const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return fail(res, 400, '用户名和密码不能为空');
  }

  const user = db.users.find(u => u.username === username);
  if (!user || !comparePassword(password, user.password)) {
    return unauthorized(res, '用户名或密码错误');
  }

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  const userInfo = { ...user };
  delete userInfo.password;

  return success(res, { token, user: userInfo }, '登录成功');
};

const logout = (req, res) => {
  return success(res, null, '登出成功');
};

const currentUser = (req, res) => {
  const userInfo = { ...req.user };
  delete userInfo.password;
  return success(res, { user: userInfo });
};

const listUsers = (req, res) => {
  const users = db.users.map(u => {
    const info = { ...u };
    delete info.password;
    return info;
  });
  return success(res, { users });
};

module.exports = { login, logout, currentUser, listUsers };
