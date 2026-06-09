const { db } = require('../data/database');
const { success, notFound } = require('../utils/response');
const moment = require('moment');

const overview = (req, res) => {
  const openEvents = db.emergencyEvents.filter(e => e.status !== 'closed' && e.status !== 'resolved');
  const activeTasks = db.tasks.filter(t => t.status === 'in_progress' || t.status === 'dispatched');
  const alarms = db.sensors.filter(s => s.threshold && s.value >= s.threshold);

  return success(res, {
    events: {
      total: db.statistics.totalEvents,
      today: db.statistics.eventsToday,
      thisMonth: db.statistics.eventsThisMonth,
      open: openEvents.length,
      byLevel: db.statistics.eventsByLevel
    },
    tasks: {
      total: db.tasks.length,
      active: activeTasks.length,
      completed: db.tasks.filter(t => t.status === 'completed').length
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
      avgResponseTime: db.statistics.averageResponseTime,
      avgResolutionTime: db.statistics.averageResolutionTime,
      resolutionRate: db.statistics.resolutionRate
    }
  });
};

const eventStatistics = (req, res) => {
  const { period = 'month' } = req.query;
  const byType = db.statistics.eventsByType;
  const byLevel = db.statistics.eventsByLevel;

  const trend = [];
  const days = period === 'month' ? 30 : period === 'week' ? 7 : 24;
  for (let i = days - 1; i >= 0; i--) {
    const t = moment().subtract(i, period === 'month' ? 'd' : period === 'week' ? 'd' : 'h');
    trend.push({
      date: t.format('YYYY-MM-DD') + (period === 'hour' ? ' ' + t.format('HH') + ':00' : ''),
      count: Math.floor(Math.random() * 5) + 1
    });
  }

  const statusStats = {
    pending: db.emergencyEvents.filter(e => e.status === 'pending').length,
    handling: db.emergencyEvents.filter(e => e.status === 'handling' || e.status === 'in_progress').length,
    resolved: db.emergencyEvents.filter(e => e.status === 'resolved' || e.status === 'closed').length,
    total: db.emergencyEvents.length
  };

  const deptStats = {};
  db.departments.forEach(d => {
    const eventCount = db.emergencyEvents.filter(e => (e.departmentIds || []).includes(d.id)).length;
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
  const activeEvents = db.emergencyEvents
    .filter(e => e.status !== 'closed' && e.status !== 'resolved')
    .sort((a, b) => {
      const levelOrder = { I: 0, II: 1, III: 2, IV: 3 };
      return (levelOrder[a.level] || 99) - (levelOrder[b.level] || 99);
    })
    .slice(0, 10);

  const eventSummaries = activeEvents.map(e => {
    const tasks = db.tasks.filter(t => t.eventId === e.id);
    const avgProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
    return {
      ...e,
      tasksCount: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      avgProgress,
      affectedObjects: db.cityObjects.filter(o => o.location && Math.abs(o.location.lat - e.location.lat) < 0.01 && Math.abs(o.location.lng - e.location.lng) < 0.01).length
    };
  });

  const recentTasks = [...db.tasks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 15);

  const resourceUtil = db.statistics.resourcesUtilization;

  return success(res, {
    activeEvents: eventSummaries,
    recentTasks,
    resourceUtilization: resourceUtil,
    onDutyPersonnel: db.departments.map(d => ({ id: d.id, name: d.name, dutyLeader: d.dutyLeader, onDuty: d.onDutyStaff, contact: d.contact }))
  });
};

module.exports = { overview, eventStatistics, disposalStatistics, commandDashboard };
