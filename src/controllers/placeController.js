const { db, generateId } = require('../data/database');
const { success, fail, notFound, paginate, isWithinRadius } = require('../utils/response');
const { markDirty } = require('../utils/persist');

const listPlaces = (req, res) => {
  const { keyword, category, level, lat, lng, radius, page = 1, pageSize = 50 } = req.query;
  let list = [...db.keyPlaces];

  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw));
  }
  if (category) list = list.filter(p => p.category === category);
  if (level) list = list.filter(p => p.level === level);

  if (lat && lng) {
    const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const r = radius ? parseFloat(radius) : 3000;
    list = list.filter(p => p.location && isWithinRadius(p.location, center, r));
  }

  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getPlace = (req, res) => {
  const place = db.keyPlaces.find(p => p.id === req.params.id);
  if (!place) return notFound(res, '重点场所不存在');
  const relatedSensors = db.sensors.filter(s => s.objectId === place.id);
  return success(res, { place, relatedSensors });
};

const registerPlace = (req, res) => {
  const { name, category, level, address, location, manager, contact, ...rest } = req.body;
  if (!name || !category || !level) return fail(res, 400, '名称、类别、等级为必填项');
  const place = {
    id: generateId(), name, category, level,
    address: address || '',
    location: location || { lat: 0, lng: 0 },
    manager: manager || '',
    contact: contact || '',
    ...rest,
    createdAt: new Date().toISOString()
  };
  db.keyPlaces.push(place);
  markDirty();
  return success(res, { place }, '重点场所登记成功');
};

const updatePlace = (req, res) => {
  const idx = db.keyPlaces.findIndex(p => p.id === req.params.id);
  if (idx === -1) return notFound(res, '重点场所不存在');
  db.keyPlaces[idx] = { ...db.keyPlaces[idx], ...req.body, updatedAt: new Date().toISOString() };
  markDirty();
  return success(res, { place: db.keyPlaces[idx] }, '更新成功');
};

const getCategories = (req, res) => {
  const categories = [
    { code: 'government', name: '政府机关' },
    { code: 'hazard', name: '危险化学品' },
    { code: 'energy', name: '能源设施' },
    { code: 'assembly', name: '人员密集' },
    { code: 'transport', name: '交通枢纽' },
    { code: 'medical', name: '医疗卫生' },
    { code: 'education', name: '教育机构' },
    { code: 'finance', name: '金融机构' }
  ];
  const levels = [
    { code: 'A', name: '一级重大危险源' },
    { code: 'B', name: '二级重要目标' },
    { code: 'C', name: '三级关注目标' }
  ];
  return success(res, { categories, levels });
};

module.exports = { listPlaces, getPlace, registerPlace, updatePlace, getCategories };
