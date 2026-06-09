const moment = require('moment');
const geolib = require('geolib');

const success = (res, data = null, message = '操作成功', extra = {}) => {
  const response = { code: 200, message, timestamp: new Date().toISOString(), ...extra };
  if (data !== null) response.data = data;
  return res.status(200).json(response);
};

const created = (res, data = null, message = '创建成功') => {
  return res.status(201).json({ code: 201, message, timestamp: new Date().toISOString(), data });
};

const fail = (res, code = 400, message = '请求参数错误', errors = null) => {
  const response = { code, message, timestamp: new Date().toISOString() };
  if (errors) response.errors = errors;
  return res.status(code).json(response);
};

const notFound = (res, message = '资源不存在') => fail(res, 404, message);
const forbidden = (res, message = '无权访问') => fail(res, 403, message);
const unauthorized = (res, message = '未认证') => fail(res, 401, message);

const paginate = (array, page = 1, pageSize = 20) => {
  const p = Math.max(1, parseInt(page));
  const ps = Math.max(1, Math.min(100, parseInt(pageSize)));
  const total = array.length;
  const totalPages = Math.ceil(total / ps);
  const start = (p - 1) * ps;
  const list = array.slice(start, start + ps);
  return { list, pagination: { page: p, pageSize: ps, total, totalPages } };
};

const calculateDistance = (p1, p2) => {
  if (!p1 || !p2) return 0;
  return geolib.getDistance(
    { latitude: p1.lat, longitude: p1.lng },
    { latitude: p2.lat, longitude: p2.lng }
  );
};

const isWithinRadius = (point, center, radiusMeters) => {
  return calculateDistance(point, center) <= radiusMeters;
};

const generateCirclePoints = (center, radiusMeters, points = 32) => {
  const result = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = Math.cos(angle) * radiusMeters / 111320;
    const dy = Math.sin(angle) * radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180));
    result.push({ lat: center.lat + dx, lng: center.lng + dy });
  }
  return result;
};

const formatDate = (date, fmt = 'YYYY-MM-DD HH:mm:ss') => {
  return moment(date).format(fmt);
};

const validateRequired = (obj, fields) => {
  const missing = [];
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      missing.push(f);
    }
  }
  return missing;
};

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const randomBetween = (min, max) => Math.random() * (max - min) + min;

module.exports = {
  success, created, fail, notFound, forbidden, unauthorized,
  paginate, calculateDistance, isWithinRadius, generateCirclePoints,
  formatDate, validateRequired, deepClone, randomBetween
};
