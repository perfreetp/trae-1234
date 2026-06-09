const { db, generateId } = require('../data/database');
const { success, fail, notFound, paginate, isWithinRadius } = require('../utils/response');

const queryObjects = (req, res) => {
  const { keyword, type, status, lat, lng, radius, page = 1, pageSize = 20 } = req.query;
  let list = [...db.cityObjects];

  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(o => o.name.toLowerCase().includes(kw) || o.id.toLowerCase().includes(kw) || (o.address && o.address.toLowerCase().includes(kw)));
  }
  if (type) {
    const types = type.split(',');
    list = list.filter(o => types.includes(o.type));
  }
  if (status) list = list.filter(o => o.status === status);

  if (lat && lng) {
    const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const r = radius ? parseFloat(radius) : 2000;
    list = list.filter(o => o.location && isWithinRadius(o.location, center, r));
    list.sort((a, b) => {
      const da = isWithinRadius(a.location, center, 999999) ? 0 : 1;
      const db_ = isWithinRadius(b.location, center, 999999) ? 0 : 1;
      return da - db_;
    });
  }

  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getObject = (req, res) => {
  const obj = db.cityObjects.find(o => o.id === req.params.id);
  if (!obj) return notFound(res, '城市对象不存在');
  const relatedSensors = db.sensors.filter(s => s.objectId === obj.id);
  const relatedEvents = db.emergencyEvents.filter(e => e.objectId === obj.id);
  return success(res, { object: obj, relatedSensors, relatedEvents });
};

const createObject = (req, res) => {
  const { name, type, address, location, ...rest } = req.body;
  if (!name || !type) return fail(res, 400, '名称和类型为必填项');
  const obj = { id: generateId(), name, type, address: address || '', location: location || { lat: 0, lng: 0 }, status: 'normal', ...rest, createdAt: new Date().toISOString() };
  db.cityObjects.push(obj);
  return success(res, { object: obj }, '城市对象创建成功');
};

const updateObject = (req, res) => {
  const idx = db.cityObjects.findIndex(o => o.id === req.params.id);
  if (idx === -1) return notFound(res, '城市对象不存在');
  db.cityObjects[idx] = { ...db.cityObjects[idx], ...req.body, updatedAt: new Date().toISOString() };
  return success(res, { object: db.cityObjects[idx] }, '更新成功');
};

const deleteObject = (req, res) => {
  const idx = db.cityObjects.findIndex(o => o.id === req.params.id);
  if (idx === -1) return notFound(res, '城市对象不存在');
  db.cityObjects.splice(idx, 1);
  return success(res, null, '删除成功');
};

const getObjectTypes = (req, res) => {
  const types = [...new Set(db.cityObjects.map(o => o.type))];
  return success(res, { types });
};

module.exports = { queryObjects, getObject, createObject, updateObject, deleteObject, getObjectTypes };
