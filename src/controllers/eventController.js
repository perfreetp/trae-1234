const { db, createEventId, generateId } = require('../data/database');
const { success, fail, notFound, paginate, isWithinRadius, generateCirclePoints, calculateDistance } = require('../utils/response');

const listEvents = (req, res) => {
  const { type, level, status, keyword, page = 1, pageSize = 20 } = req.query;
  let list = [...db.emergencyEvents];
  if (type) list = list.filter(e => e.type === type);
  if (level) list = list.filter(e => e.level === level);
  if (status) list = list.filter(e => e.status === status);
  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(e => e.title.toLowerCase().includes(kw) || e.id.toLowerCase().includes(kw));
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getEvent = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.id);
  if (!event) return notFound(res, '事件不存在');
  const timeline = db.eventTimelines[event.id] || [];
  const tasks = db.tasks.filter(t => t.eventId === event.id);
  const notifications = db.notifications.filter(n => n.eventId === event.id);
  return success(res, { event, timeline, tasks, notifications });
};

const reportEvent = (req, res) => {
  const { type, level, title, description, location, address, objectId, reporter, tags } = req.body;
  if (!type || !title || !location) {
    return fail(res, 400, '事件类型、标题和位置为必填项');
  }

  const LEVELS = ['I', 'II', 'III', 'IV'];
  const eventLevel = level || LEVELS[LEVELS.length - 1];
  if (!LEVELS.includes(eventLevel)) return fail(res, 400, '事件等级无效');

  const event = {
    id: createEventId(),
    type,
    level: eventLevel,
    title,
    description: description || '',
    location,
    address: address || '',
    objectId: objectId || null,
    reporter: reporter || { type: 'user', id: req.user?.id, name: req.user?.name },
    status: 'pending',
    currentPhase: '待处置',
    impactRadius: eventLevel === 'I' ? 2000 : eventLevel === 'II' ? 1000 : eventLevel === 'III' ? 500 : 200,
    affectedPeople: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    createdBy: req.user?.id || 'system',
    commanderId: null,
    departmentIds: [],
    tags: tags || []
  };

  db.emergencyEvents.push(event);
  db.eventTimelines[event.id] = [{
    id: generateId(),
    timestamp: event.createdAt,
    actor: req.user?.id || 'system',
    action: 'event_created',
    description: `${req.user?.name || '系统'} 上报了突发事件: ${title}`,
    data: { source: 'manual_report' }
  }];

  return success(res, { event }, '事件上报成功');
};

const updateEvent = (req, res) => {
  const idx = db.emergencyEvents.findIndex(e => e.id === req.params.id);
  if (idx === -1) return notFound(res, '事件不存在');
  const old = db.emergencyEvents[idx];
  db.emergencyEvents[idx] = { ...old, ...req.body, updatedAt: new Date().toISOString() };
  db.eventTimelines[old.id] = db.eventTimelines[old.id] || [];
  db.eventTimelines[old.id].push({
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor: req.user?.id || 'system',
    action: 'event_updated',
    description: `事件信息已更新`,
    data: req.body
  });
  return success(res, { event: db.emergencyEvents[idx] }, '更新成功');
};

const getTimeline = (req, res) => {
  const timeline = db.eventTimelines[req.params.id] || [];
  timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return success(res, { eventId: req.params.id, timeline });
};

const addTimeline = (req, res) => {
  const { action, description, data } = req.body;
  if (!action) return fail(res, 400, '动作为必填项');
  db.eventTimelines[req.params.id] = db.eventTimelines[req.params.id] || [];
  const item = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor: req.user?.id || 'system',
    action,
    description: description || action,
    data: data || {}
  };
  db.eventTimelines[req.params.id].push(item);
  return success(res, { item }, '时间线已添加');
};

const assessImpact = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.id);
  if (!event) return notFound(res, '事件不存在');
  const center = event.location;
  const radius = event.impactRadius || 500;

  const affectedObjects = db.cityObjects.filter(o => o.location && isWithinRadius(o.location, center, radius));
  const affectedPlaces = db.keyPlaces.filter(p => p.location && isWithinRadius(p.location, center, radius));
  const affectedSensors = db.sensors.filter(s => s.location && isWithinRadius({ lat: s.location.lat, lng: s.location.lng }, center, radius));

  let affectedPeople = 0;
  affectedObjects.forEach(o => {
    if (o.capacity) affectedPeople += Math.floor(o.capacity * 0.6);
    else if (o.students) affectedPeople += o.students;
    else if (o.dailyFlow) affectedPeople += Math.floor(o.dailyFlow * 0.1);
  });

  const heat = db.heatmapData.grids.filter(g => isWithinRadius({ lat: g.lat, lng: g.lng }, center, radius));
  const peopleInHeat = heat.reduce((s, g) => s + g.peopleCount, 0);
  affectedPeople = Math.max(affectedPeople, peopleInHeat);

  const perimeter = generateCirclePoints(center, radius);
  const nearestResources = db.resources
    .filter(r => r.location)
    .map(r => ({ ...r, distance: calculateDistance(r.location, center) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  const result = {
    eventId: event.id,
    center,
    radius,
    perimeter,
    affectedObjects,
    affectedPlaces,
    affectedSensors,
    affectedPeople,
    nearestResources,
    heatSnapshot: heat
  };

  return success(res, result);
};

const playback = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.id);
  if (!event) return notFound(res, '事件不存在');
  const timeline = (db.eventTimelines[event.id] || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const tasks = db.tasks.filter(t => t.eventId === event.id);
  const frames = [];
  if (timeline.length > 0) {
    const startTime = new Date(timeline[0].timestamp).getTime();
    const endTime = new Date(timeline[timeline.length - 1].timestamp).getTime();
    const duration = Math.max(endTime - startTime, 60000);
    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      const relative = (new Date(t.timestamp).getTime() - startTime) / 1000;
      frames.push({ offsetSeconds: Math.floor(relative), timestamp: t.timestamp, event: t, tasksSnapshot: tasks.filter(ts => new Date(ts.createdAt) <= new Date(t.timestamp)) });
    }
  }
  return success(res, { eventId: event.id, startTime: timeline[0]?.timestamp, totalSeconds: frames.length > 0 ? frames[frames.length - 1].offsetSeconds + 10 : 300, frames, timeline, tasks });
};

const eventTypes = (req, res) => {
  const types = [
    { code: 'fire', name: '火灾爆炸', levels: ['I', 'II', 'III', 'IV'], defaultRadius: { I: 2000, II: 1000, III: 500, IV: 200 } },
    { code: 'traffic', name: '交通事故', levels: ['II', 'III', 'IV'], defaultRadius: { II: 500, III: 300, IV: 150 } },
    { code: 'gas', name: '燃气泄漏', levels: ['I', 'II', 'III'], defaultRadius: { I: 2000, II: 1000, III: 500 } },
    { code: 'medical', name: '公共卫生', levels: ['I', 'II', 'III', 'IV'], defaultRadius: { I: 5000, II: 2000, III: 1000, IV: 500 } },
    { code: 'structural', name: '建筑坍塌', levels: ['I', 'II', 'III'], defaultRadius: { I: 2000, II: 1000, III: 500 } },
    { code: 'flood', name: '内涝积水', levels: ['I', 'II', 'III', 'IV'], defaultRadius: { I: 3000, II: 1500, III: 800, IV: 300 } },
    { code: 'chemical', name: '危化品事故', levels: ['I', 'II', 'III'], defaultRadius: { I: 3000, II: 2000, III: 1000 } },
    { code: 'public_order', name: '公共治安', levels: ['II', 'III', 'IV'], defaultRadius: { II: 500, III: 300, IV: 150 } }
  ];
  return success(res, { types });
};

module.exports = { listEvents, getEvent, reportEvent, updateEvent, getTimeline, addTimeline, assessImpact, playback, eventTypes };
