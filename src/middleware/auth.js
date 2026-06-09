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
  COMMANDER: [
    'event:view', 'event:create', 'event:update', 'event:close', 'event:timeline',
    'task:view', 'task:create', 'task:update', 'task:accept',
    'resource:view', 'resource:manage',
    'plan:view', 'plan:create', 'plan:match',
    'notification:view', 'notification:create', 'notification:send',
    'statistics:view',
    'command:context', 'command:action', 'command:progress', 'command:dashboard', 'command:deep-package',
    'city-object:view', 'city-object:create', 'city-object:update', 'city-object:delete',
    'place:view', 'place:create', 'place:update',
    'sensor:view', 'location:view', 'evacuation:view',
    'user:view', 'auth:manage',
    'report:view'
  ],
  STREET: [
    'event:view', 'event:create', 'event:update', 'event:timeline',
    'task:view', 'task:update', 'task:accept',
    'resource:view', 'plan:view',
    'notification:view',
    'statistics:view',
    'command:progress',
    'city-object:view', 'place:view',
    'sensor:view', 'location:view', 'evacuation:view',
    'street:ledger',
    'report:view'
  ],
  PATROL: [
    'task:view', 'task:accept', 'task:update',
    'command:progress'
  ]
};

const COMMAND_ACTION_PERMISSIONS = {
  MATCH_PLAN: 'command:action',
  DISPATCH_FIRE: 'task:create',
  DISPATCH_MEDICAL: 'task:create',
  DISPATCH_TRAFFIC: 'task:create',
  NOTIFY_DEPTS: 'notification:send',
  ASSIGN_COMMANDER: 'command:action',
  UPGRADE_LEVEL: 'event:update',
  CLOSE_EVENT: 'event:close'
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
  ROLE_HIERARCHY,
  COMMAND_ACTION_PERMISSIONS
};
