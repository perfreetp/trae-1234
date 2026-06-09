const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../data/database');

const SECRET = process.env.JWT_SECRET || 'emergency-response-jwt-secret-key-2024';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

const signToken = (payload) => {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
};

const ROLE_HIERARCHY = {
  ADMIN: ['*'],
  COMMANDER: ['event:*', 'task:*', 'resource:*', 'plan:*', 'notification:*', 'statistics:view', 'command:*', 'city-object:view', 'place:view', 'sensor:view', 'location:view', 'evacuation:view'],
  STREET: ['event:view', 'event:create', 'task:view', 'task:update', 'notification:view', 'place:view', 'city-object:view', 'sensor:view', 'location:view', 'evacuation:view', 'statistics:view'],
  PATROL: ['event:create', 'event:view', 'task:view', 'task:update', 'place:view', 'city-object:view', 'sensor:view', 'location:view']
};

const hasPermission = (user, permission) => {
  if (!user) return false;
  const userPerms = ROLE_HIERARCHY[user.role] || [];
  if (userPerms.includes('*')) return true;
  if (user.permissions && user.permissions.includes('*')) return true;

  const checkMatch = (pattern) => {
    if (pattern === permission) return true;
    const [pModule, pAction] = pattern.split(':');
    const [module, action] = permission.split(':');
    if (pModule === module && (pAction === '*' || pAction === action)) return true;
    return false;
  };

  if (userPerms.some(checkMatch)) return true;
  if (user.permissions && user.permissions.some(checkMatch)) return true;
  return false;
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 401, message: '未提供认证令牌，请先登录' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ code: 401, message: '认证令牌无效或已过期' });
  }

  const user = db.users.find(u => u.id === decoded.id);
  if (!user) {
    return res.status(401).json({ code: 401, message: '用户不存在' });
  }

  req.user = user;
  next();
};

const authorize = (permission) => {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        code: 403,
        message: '权限不足，无法执行此操作',
        requiredPermission: permission,
        userRole: req.user?.role
      });
    }
    next();
  };
};

const authenticateOptional = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = db.users.find(u => u.id === decoded.id) || null;
    }
  }
  next();
};

module.exports = {
  signToken,
  verifyToken,
  hashPassword: (pw) => bcrypt.hashSync(pw, 10),
  comparePassword: (pw, hash) => bcrypt.compareSync(pw, hash),
  authenticate,
  authorize,
  authenticateOptional,
  hasPermission,
  ROLE_HIERARCHY
};
