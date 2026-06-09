const { db } = require('../data/database');
const { success, paginate, calculateDistance, isWithinRadius, notFound } = require('../utils/response');

const listResources = (req, res) => {
  const { category, subCategory, status, lat, lng, radius, page = 1, pageSize = 50 } = req.query;
  let list = [...db.resources];
  if (category) list = list.filter(r => r.category === category);
  if (subCategory) list = list.filter(r => r.subCategory === subCategory);
  if (status) list = list.filter(r => r.status === status);

  if (lat && lng) {
    const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const r = radius ? parseFloat(radius) : 5000;
    list = list
      .filter(r_ => r_.location && isWithinRadius(r_.location, center, r))
      .map(r_ => ({ ...r_, distance: calculateDistance(r_.location, center) }))
      .sort((a, b) => a.distance - b.distance);
  }

  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getResource = (req, res) => {
  const r = db.resources.find(r_ => r_.id === req.params.id);
  if (!r) return notFound(res, '资源不存在');
  return success(res, { resource: r });
};

const getDirectory = (req, res) => {
  const categories = [
    { code: 'fire', name: '消防力量', subCategories: [{ code: 'vehicle', name: '消防车辆' }, { code: 'personnel', name: '消防人员' }, { code: 'equipment', name: '消防装备' }] },
    { code: 'medical', name: '医疗急救', subCategories: [{ code: 'vehicle', name: '救护车辆' }, { code: 'personnel', name: '医护人员' }, { code: 'facility', name: '医疗机构' }] },
    { code: 'police', name: '治安交通', subCategories: [{ code: 'vehicle', name: '警用车辆' }, { code: 'personnel', name: '警务人员' }] },
    { code: 'shelter', name: '避难场所', subCategories: [{ code: 'facility', name: '固定避难所' }, { code: 'temporary', name: '临时安置点' }] },
    { code: 'supply', name: '物资储备', subCategories: [{ code: 'warehouse', name: '物资仓库' }, { code: 'food', name: '食品饮用水' }, { code: 'medicine', name: '医疗物资' }] },
    { code: 'engineering', name: '工程抢险', subCategories: [{ code: 'vehicle', name: '工程车辆' }, { code: 'personnel', name: '抢险人员' }] }
  ];

  const summary = {};
  categories.forEach(c => {
    const items = db.resources.filter(r => r.category === c.code);
    const totalQty = items.reduce((s, r) => s + (r.quantity || (r.capacity ? 1 : 0)), 0);
    const availQty = items.reduce((s, r) => s + (r.availableQty || (r.capacity ? 1 : 0)), 0);
    summary[c.code] = { total: items.length, totalQty, availableQty: availQty };
  });

  const byDept = {};
  db.departments.forEach(d => {
    const items = db.resources.filter(r => r.department === d.id);
    byDept[d.id] = { name: d.name, contact: d.contact, resources: items };
  });

  return success(res, { categories, summary, byDept });
};

const getNearbyResources = (req, res) => {
  const { lat, lng, radius = 5000, categories } = req.query;
  if (!lat || !lng) return success(res, { resources: [] });
  const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
  const r = parseFloat(radius);
  const cats = categories ? categories.split(',') : null;

  let list = db.resources
    .filter(r_ => {
      if (!r_.location) return false;
      if (cats && !cats.includes(r_.category)) return false;
      return true;
    })
    .map(r_ => ({ ...r_, distance: calculateDistance(r_.location, center) }))
    .filter(r_ => r_.distance <= r)
    .sort((a, b) => a.distance - b.distance);

  const grouped = {};
  list.forEach(r_ => {
    grouped[r_.category] = grouped[r_.category] || [];
    grouped[r_.category].push(r_);
  });

  return success(res, { center, radius: r, total: list.length, byCategory: grouped, all: list });
};

module.exports = { listResources, getResource, getDirectory, getNearbyResources };
