const { db, generateId } = require('../data/database');
const { success, notFound, fail, paginate } = require('../utils/response');
const { markDirty } = require('../utils/persist');
const moment = require('moment');

const STREET_DEPT_MAP = {
  '街道办': ['中关村街道办', '海淀街道办', '朝阳街道办', '西城街道办', '东城街道办'],
  '巡逻组': ['中关村街道办', '海淀街道办']
};

const getUserStreet = (user) => {
  if (!user) return null;
  if (user.department) return user.department;
  if (user.id === 'street_user_1') return '中关村街道办';
  if (user.id === 'street_user_2') return '海淀街道办';
  return '中关村街道办';
};

const getRelatedStreetsForEvent = (event) => {
  const streets = new Set();
  if (event.reporterDept) streets.add(event.reporterDept);
  if (event.address) {
    Object.values(STREET_DEPT_MAP).flat().forEach(s => {
      if (event.address.includes(s.replace('街道办', ''))) streets.add(s);
    });
  }
  (event.departmentIds || []).forEach(d => {
    (STREET_DEPT_MAP[d] || []).forEach(s => streets.add(s));
  });
  (event.tags || []).forEach(t => {
    Object.values(STREET_DEPT_MAP).flat().forEach(s => {
      if (t.includes(s.replace('街道办', ''))) streets.add(s);
    });
  });
  return Array.from(streets);
};

const getStreetLedger = (req, res) => {
  const userStreet = getUserStreet(req.user);
  const { type, level, status, keyword, page = 1, pageSize = 20 } = req.query;

  const list = db.emergencyEvents.filter(e => {
    const related = getRelatedStreetsForEvent(e);
    const isReporter = e.reporterDept === userStreet || e.createdBy === req.user?.id;
    const isParticipant = related.includes(userStreet);
    if (!isReporter && !isParticipant) return false;
    if (type && e.type !== type) return false;
    if (level && e.level !== level) return false;
    if (status && e.status !== status) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      if (!e.title.toLowerCase().includes(kw) && !(e.description || '').toLowerCase().includes(kw)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const enriched = list.map(e => {
    const tasks = db.tasks.filter(t => t.eventId === e.id && (t.department === userStreet || t.assigneeDepartment === userStreet));
    const timeline = db.eventTimelines[e.id] || [];
    return {
      ...e,
      myStreetTasks: tasks,
      myStreetTasksCount: tasks.length,
      timelineCount: timeline.length,
      latestTimeline: timeline[timeline.length - 1] || null,
      relationType: (e.reporterDept === userStreet || e.createdBy === req.user?.id) ? '上报' : '参与'
    };
  });

  return success(res, {
    street: userStreet,
    total: enriched.length,
    ...paginate(enriched, Number(page), Number(pageSize)),
    summary: {
      total: enriched.length,
      open: enriched.filter(e => e.status !== 'closed' && e.status !== 'resolved').length,
      myTasks: db.tasks.filter(t => t.department === userStreet).length,
      myTasksCompleted: db.tasks.filter(t => t.department === userStreet && t.status === 'completed').length
    }
  }, `街道[${userStreet}]台账加载成功`);
};

const getStreetTasks = (req, res) => {
  const userStreet = getUserStreet(req.user);
  const { eventId, status, page = 1, pageSize = 30 } = req.query;

  let list = db.tasks.filter(t => t.department === userStreet || t.assigneeDepartment === userStreet);
  if (eventId) list = list.filter(t => t.eventId === eventId);
  if (status) list = list.filter(t => t.status === status);

  list = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const enriched = list.map(t => {
    const event = db.emergencyEvents.find(e => e.id === t.eventId);
    return { ...t, eventTitle: event?.title, eventLevel: event?.level, eventStatus: event?.status };
  });

  return success(res, {
    street: userStreet,
    ...paginate(enriched, Number(page), Number(pageSize)),
    summary: {
      total: list.length,
      dispatched: list.filter(t => t.status === 'dispatched').length,
      inProgress: list.filter(t => t.status === 'in_progress').length,
      completed: list.filter(t => t.status === 'completed').length
    }
  });
};

const supplementEvent = (req, res) => {
  const { eventId } = req.params;
  const userStreet = getUserStreet(req.user);
  const { sceneDescription, casualties, trapped, propertyDamage, environmentalImpact, roadCondition, onSiteCommander, additionalNotes, images, attachments } = req.body;

  const idx = db.emergencyEvents.findIndex(e => e.id === eventId);
  if (idx === -1) return notFound(res, '事件不存在');

  const event = db.emergencyEvents[idx];
  const related = getRelatedStreetsForEvent(event);
  const isReporter = event.reporterDept === userStreet || event.createdBy === req.user?.id;
  if (!isReporter && !related.includes(userStreet)) {
    return fail(res, 403, '您所在的街道无权补充此事件的现场信息');
  }

  const supplement = {
    street: userStreet,
    sceneDescription: sceneDescription || '',
    casualties: casualties || { dead: 0, injured: 0, trapped: 0 },
    trapped: Number(trapped) || 0,
    propertyDamage: propertyDamage || '',
    environmentalImpact: environmentalImpact || '',
    roadCondition: roadCondition || '',
    onSiteCommander: onSiteCommander || '',
    additionalNotes: additionalNotes || '',
    images: images || [],
    attachments: attachments || [],
    supplementedAt: new Date().toISOString(),
    supplementedBy: req.user?.id || 'street_user'
  };

  event.sceneSupplements = event.sceneSupplements || [];
  event.sceneSupplements.push(supplement);
  event.updatedAt = supplement.supplementedAt;

  const timelineItem = {
    id: generateId(),
    timestamp: supplement.supplementedAt,
    actor: req.user?.id || 'street_user',
    action: 'scene_supplemented',
    description: `[${userStreet}] 补充现场信息: ${sceneDescription ? sceneDescription.slice(0, 30) : '现场情况已更新'}`,
    data: supplement
  };
  db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
  db.eventTimelines[eventId].push(timelineItem);

  db.emergencyEvents[idx] = event;
  markDirty();

  return success(res, { event, supplement, timelineItem }, '现场信息补充成功，已同步至事件时间线');
};

module.exports = { getStreetLedger, getStreetTasks, supplementEvent, getUserStreet, getRelatedStreetsForEvent };
