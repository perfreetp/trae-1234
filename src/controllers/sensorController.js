const { db } = require('../data/database');
const { success, notFound, paginate } = require('../utils/response');

const listSensors = (req, res) => {
  const { type, status, objectId, page = 1, pageSize = 50 } = req.query;
  let list = [...db.sensors];
  if (type) list = list.filter(s => s.type === type);
  if (status) list = list.filter(s => s.status === status);
  if (objectId) list = list.filter(s => s.objectId === objectId);
  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getSensor = (req, res) => {
  const sensor = db.sensors.find(s => s.id === req.params.id);
  if (!sensor) return notFound(res, '传感器不存在');
  return success(res, { sensor });
};

const summary = (req, res) => {
  const total = db.sensors.length;
  const online = db.sensors.filter(s => s.status === 'online').length;
  const warning = db.sensors.filter(s => s.status === 'warning').length;
  const offline = db.sensors.filter(s => s.status === 'offline').length;
  const fault = db.sensors.filter(s => s.status === 'fault').length;
  const alarm = db.sensors.filter(s => s.threshold && s.value >= s.threshold).length;

  const byType = {};
  db.sensors.forEach(s => {
    byType[s.type] = byType[s.type] || { total: 0, online: 0, warning: 0, alarm: 0 };
    byType[s.type].total++;
    if (s.status === 'online') byType[s.type].online++;
    if (s.status === 'warning') byType[s.type].warning++;
    if (s.threshold && s.value >= s.threshold) byType[s.type].alarm++;
  });

  const alarmList = db.sensors.filter(s => s.threshold && s.value >= s.threshold);
  const warningList = db.sensors.filter(s => s.status === 'warning');

  return success(res, {
    overview: { total, online, warning, offline, fault, alarm, onlineRate: ((online / total) * 100).toFixed(1) + '%' },
    byType,
    alarmList,
    warningList
  });
};

const sensorTypes = (req, res) => {
  const types = [
    { code: 'smoke', name: '烟雾传感器', unit: '%obs/m' },
    { code: 'temperature', name: '温度传感器', unit: '°C' },
    { code: 'camera', name: '视频监控', unit: '' },
    { code: 'gas', name: '可燃气体', unit: '%LEL' },
    { code: 'traffic', name: '交通流量', unit: '辆/小时' },
    { code: 'structure', name: '结构应力', unit: 'MPa' },
    { code: 'power', name: '电力监测', unit: 'A' },
    { code: 'pressure', name: '压力传感器', unit: 'MPa' },
    { code: 'crowd', name: '人流计数', unit: '人' },
    { code: 'water', name: '水位传感器', unit: 'cm' }
  ];
  return success(res, { types });
};

const getSensorHistory = (req, res) => {
  const sensor = db.sensors.find(s => s.id === req.params.id);
  if (!sensor) return notFound(res, '传感器不存在');
  const history = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600 * 1000);
    let v;
    if (typeof sensor.value === 'number') {
      const base = sensor.value;
      v = +(base + (Math.random() - 0.5) * base * 0.1).toFixed(2);
    } else {
      v = sensor.value;
    }
    history.push({ timestamp: t.toISOString(), value: v });
  }
  return success(res, { history, sensor });
};

module.exports = { listSensors, getSensor, summary, sensorTypes, getSensorHistory };
