const { db } = require('../data/database');
const { success, notFound } = require('../utils/response');
const moment = require('moment');

const LEVEL_NAMES = { I: 'Ⅰ级(特别重大)', II: 'Ⅱ级(重大)', III: 'Ⅲ级(较大)', IV: 'Ⅳ级(一般)' };
const TYPE_NAMES = {
  fire: '火灾爆炸', gas: '燃气泄漏', traffic: '交通事故',
  structural: '建筑坍塌', chemical: '危化品泄漏', medical: '公共卫生',
  flood: '洪涝灾害', public_order: '治安事件'
};

const minutesBetween = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null;

const overview = (req, res) => {
  const todayStr = new Date().toDateString();
  const monthStart = moment().startOf('month');

  const events = db.emergencyEvents;
  const tasks = db.tasks;

  const eventsToday = events.filter(e => new Date(e.createdAt).toDateString() === todayStr);
  const eventsThisMonth = events.filter(e => moment(e.createdAt).isSameOrAfter(monthStart));
  const openEvents = events.filter(e => e.status !== 'closed' && e.status !== 'resolved');
  const closedEvents = events.filter(e => e.status === 'closed' || e.status === 'resolved');

  const activeTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'dispatched');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const alarms = db.sensors.filter(s => s.threshold && s.value >= s.threshold);

  const byLevel = {};
  ['I', 'II', 'III', 'IV'].forEach(lv => {
    byLevel[lv] = { name: LEVEL_NAMES[lv], count: events.filter(e => e.level === lv).length };
  });

  const responseTimes = tasks
    .filter(t => t.createdAt && t.acceptedAt)
    .map(t => minutesBetween(t.createdAt, t.acceptedAt))
    .filter(Boolean);

  const resolutionTimes = closedEvents
    .map(e => minutesBetween(e.createdAt, e.closedAt || e.updatedAt))
    .filter(t => t != null && t > 0);

  const totalEvents = events.length || 1;

  return success(res, {
    events: {
      total: events.length,
      today: eventsToday.length,
      thisMonth: eventsThisMonth.length,
      open: openEvents.length,
      byLevel
    },
    tasks: {
      total: tasks.length,
      active: activeTasks.length,
      completed: completedTasks.length
    },
    sensors: {
      total: db.sensors.length,
      online: db.sensors.filter(s => s.status === 'online').length,
      alarm: alarms.length
    },
    departments: {
      total: db.departments.length,
      onDuty: db.departments.reduce((s, d) => s + (d.onDutyStaff || 0), 0)
    },
    performance: {
      avgResponseTime: responseTimes.length ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length) : 0,
      avgResolutionTime: resolutionTimes.length ? Math.round(resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length) : 0,
      resolutionRate: Math.round((closedEvents.length / totalEvents) * 1000) / 10
    }
  });
};

const eventStatistics = (req, res) => {
  const { period = 'month' } = req.query;
  const events = db.emergencyEvents;

  const byType = {};
  Object.keys(TYPE_NAMES).forEach(t => {
    byType[t] = { name: TYPE_NAMES[t], count: events.filter(e => e.type === t).length };
  });

  const byLevel = {};
  ['I', 'II', 'III', 'IV'].forEach(lv => {
    byLevel[lv] = { name: LEVEL_NAMES[lv], count: events.filter(e => e.level === lv).length };
  });

  const trend = [];
  const days = period === 'month' ? 30 : period === 'week' ? 7 : 24;
  for (let i = days - 1; i >= 0; i--) {
    const t = moment().subtract(i, period === 'month' ? 'd' : period === 'week' ? 'd' : 'h');
    const isHour = period === 'hour';
    const dateStr = isHour ? t.format('YYYY-MM-DD HH:00') : t.format('YYYY-MM-DD');
    const count = events.filter(e => {
      const et = moment(e.createdAt);
      return isHour ? et.format('YYYY-MM-DD HH') === t.format('YYYY-MM-DD HH') : et.format('YYYY-MM-DD') === t.format('YYYY-MM-DD');
    }).length;
    trend.push({ date: dateStr, count });
  }

  const statusStats = {
    pending: events.filter(e => e.status === 'pending').length,
    handling: events.filter(e => e.status === 'handling' || e.status === 'in_progress' || e.status === 'dispatched').length,
    resolved: events.filter(e => e.status === 'resolved' || e.status === 'closed').length,
    total: events.length
  };

  const deptStats = {};
  db.departments.forEach(d => {
    const eventCount = events.filter(e => (e.departmentIds || []).includes(d.id)).length;
    const taskCount = db.tasks.filter(t => t.department === d.id).length;
    deptStats[d.id] = { name: d.name, events: eventCount, tasks: taskCount, onDuty: d.onDutyStaff };
  });

  return success(res, { byType, byLevel, trend, statusStats, deptStats });
};

const disposalStatistics = (req, res) => {
  const { eventId } = req.query;
  if (eventId) {
    const event = db.emergencyEvents.find(e => e.id === eventId);
    if (!event) return notFound(res, '事件不存在');
    const tasks = db.tasks.filter(t => t.eventId === eventId);
    const timeline = db.eventTimelines[eventId] || [];
    const notifications = db.notifications.filter(n => n.eventId === eventId);

    const taskStats = {
      total: tasks.length,
      dispatched: tasks.filter(t => t.status === 'dispatched').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      avgProgress: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0
    };

    const deptInvolvement = {};
    tasks.forEach(t => {
      deptInvolvement[t.department] = deptInvolvement[t.department] || { tasks: 0, completed: 0 };
      deptInvolvement[t.department].tasks++;
      if (t.status === 'completed') deptInvolvement[t.department].completed++;
    });

    const resourcesUsed = new Set();
    tasks.forEach(t => (t.resourceIds || []).forEach(id => resourcesUsed.add(id)));

    let totalDuration = null;
    if (event.closedAt) {
      totalDuration = Math.round((new Date(event.closedAt) - new Date(event.createdAt)) / 60000);
    }

    return success(res, {
      eventId,
      eventTitle: event.title,
      totalDurationMinutes: totalDuration,
      taskStats,
      timelineCount: timeline.length,
      notificationsSent: notifications.length,
      departments: Object.keys(deptInvolvement).length,
      deptInvolvement,
      resourcesUsed: Array.from(resourcesUsed).map(id => db.resources.find(r => r.id === id)).filter(Boolean)
    });
  }

  return success(res, { message: '请提供eventId参数' });
};

const commandDashboard = (req, res) => {
  const events = db.emergencyEvents;
  const tasks = db.tasks;

  const activeEvents = events
    .filter(e => e.status !== 'closed' && e.status !== 'resolved')
    .sort((a, b) => {
      const levelOrder = { I: 0, II: 1, III: 2, IV: 3 };
      return (levelOrder[a.level] || 99) - (levelOrder[b.level] || 99);
    })
    .slice(0, 10);

  const eventSummaries = activeEvents.map(e => {
    const eTasks = tasks.filter(t => t.eventId === e.id);
    const avgProgress = eTasks.length ? Math.round(eTasks.reduce((s, t) => s + t.progress, 0) / eTasks.length) : 0;
    return {
      ...e,
      tasksCount: eTasks.length,
      completedTasks: eTasks.filter(t => t.status === 'completed').length,
      avgProgress,
      affectedObjects: db.cityObjects.filter(o => o.location && Math.abs(o.location.lat - e.location.lat) < 0.01 && Math.abs(o.location.lng - e.location.lng) < 0.01).length
    };
  });

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 15);

  const resourceUtil = db.resources.slice(0, 10).map(r => {
    const used = tasks.filter(t => (t.resourceIds || []).includes(r.id)).length;
    const util = Math.min(100, Math.round((used / Math.max(1, r.totalCount || 5)) * 100));
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      totalCount: r.totalCount || 5,
      usedCount: used,
      utilization: util,
      status: util > 80 ? 'high' : util > 40 ? 'medium' : 'low'
    };
  });

  return success(res, {
    activeEvents: eventSummaries,
    recentTasks,
    resourceUtilization: resourceUtil,
    onDutyPersonnel: db.departments.map(d => ({ id: d.id, name: d.name, dutyLeader: d.dutyLeader, onDuty: d.onDutyStaff, contact: d.contact }))
  });
};

module.exports = { overview, eventStatistics, disposalStatistics, commandDashboard };
