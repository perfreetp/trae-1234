const { db } = require('../data/database');
const { success } = require('../utils/response');
const moment = require('moment');

const minutesBetween = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null;

const sameDay = (isoStr, dayMoment) => {
  if (!isoStr) return false;
  return moment(isoStr).format('YYYY-MM-DD') === dayMoment.format('YYYY-MM-DD');
};

const buildDailyReport = (dateStr) => {
  const target = dateStr ? moment(dateStr, 'YYYY-MM-DD') : moment();
  const targetStr = target.format('YYYY-MM-DD');

  const events = db.emergencyEvents;
  const tasks = db.tasks;
  const notifications = db.notifications;

  const newEvents = events.filter(e => sameDay(e.createdAt, target));
  const closedEvents = events.filter(e => sameDay(e.closedAt, target));
  const eventsHandling = events.filter(e => {
    const created = moment(e.createdAt);
    const closed = e.closedAt ? moment(e.closedAt) : null;
    return created.isSameOrBefore(target.endOf('day')) && (!closed || closed.isAfter(target.startOf('day')));
  });

  const tasksCreated = tasks.filter(t => sameDay(t.createdAt, target));
  const tasksCompleted = tasks.filter(t => sameDay(t.completedAt, target));
  const tasksAccepted = tasks.filter(t => sameDay(t.acceptedAt, target));

  const responseTimes = tasksAccepted
    .map(t => minutesBetween(t.createdAt, t.acceptedAt))
    .filter(v => v != null && v >= 0);

  const resolutionTimes = closedEvents
    .map(e => minutesBetween(e.createdAt, e.closedAt))
    .filter(v => v != null && v > 0);

  const deptParticipation = {};
  [...newEvents, ...closedEvents].forEach(e => {
    (e.departmentIds || []).forEach(did => {
      deptParticipation[did] = deptParticipation[did] || {
        id: did,
        name: db.departments.find(d => d.id === did)?.name || did,
        eventsInvolved: 0,
        tasksDispatched: 0,
        tasksCompleted: 0
      };
      deptParticipation[did].eventsInvolved++;
    });
  });

  tasks.filter(t => sameDay(t.createdAt, target) || sameDay(t.completedAt, target)).forEach(t => {
    const did = t.department;
    deptParticipation[did] = deptParticipation[did] || {
      id: did,
      name: db.departments.find(d => d.id === did)?.name || did,
      eventsInvolved: 0,
      tasksDispatched: 0,
      tasksCompleted: 0
    };
    if (sameDay(t.createdAt, target)) deptParticipation[did].tasksDispatched++;
    if (sameDay(t.completedAt, target)) deptParticipation[did].tasksCompleted++;
  });

  const typeBreakdown = {};
  newEvents.forEach(e => {
    typeBreakdown[e.type] = typeBreakdown[e.type] || 0;
    typeBreakdown[e.type]++;
  });

  const levelBreakdown = {};
  newEvents.forEach(e => {
    levelBreakdown[e.level] = levelBreakdown[e.level] || 0;
    levelBreakdown[e.level]++;
  });

  const notificationsSent = notifications.filter(n => sameDay(n.sentAt, target));

  const supervisions = (db.supervisionRecords || []).filter(s => sameDay(s.createdAt, target));
  const supervisionByCategory = {};
  supervisions.forEach(s => {
    const c = s.category || 'manual';
    supervisionByCategory[c] = (supervisionByCategory[c] || 0) + 1;
  });
  const supervisionByUrgency = {};
  supervisions.forEach(s => {
    const u = s.urgency || 'normal';
    supervisionByUrgency[u] = (supervisionByUrgency[u] || 0) + 1;
  });
  const supervisedDepts = {};
  supervisions.forEach(s => {
    const d = s.department;
    if (!d) return;
    supervisedDepts[d] = (supervisedDepts[d] || 0) + 1;
  });

  const meetings = (db.meetingRecords || []).filter(m => sameDay(m.createdAt, target));
  const meetingByType = {};
  meetings.forEach(m => {
    meetingByType[m.type || 'standard'] = (meetingByType[m.type || 'standard'] || 0) + 1;
  });

  const totalEvents = Math.max(1, newEvents.length + eventsHandling.length);
  const totalTasks = Math.max(1, tasksCreated.length);

  return {
    date: targetStr,
    generatedAt: new Date().toISOString(),
    events: {
      newCount: newEvents.length,
      closedCount: closedEvents.length,
      handlingCount: eventsHandling.length,
      handlingOpen: eventsHandling.filter(e => e.status !== 'closed' && e.status !== 'resolved').length,
      typeBreakdown,
      levelBreakdown,
      list: newEvents.map(e => ({
        id: e.id, title: e.title, type: e.type, level: e.level,
        status: e.status, createdAt: e.createdAt, closedAt: e.closedAt,
        durationMinutes: minutesBetween(e.createdAt, e.closedAt)
      }))
    },
    tasks: {
      createdCount: tasksCreated.length,
      acceptedCount: tasksAccepted.length,
      completedCount: tasksCompleted.length,
      avgResponseMinutes: responseTimes.length ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length) : 0,
      completionRate: Math.round((tasksCompleted.length / totalTasks) * 1000) / 10
    },
    performance: {
      avgResolutionMinutes: resolutionTimes.length ? Math.round(resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length) : 0,
      resolutionRate: Math.round((closedEvents.length / totalEvents) * 1000) / 10,
      avgTaskProgress: tasksCreated.length
        ? Math.round(tasksCreated.reduce((s, t) => s + (t.progress || 0), 0) / tasksCreated.length)
        : 0
    },
    departments: {
      involvedCount: Object.keys(deptParticipation).length,
      breakdown: Object.values(deptParticipation)
    },
    notifications: {
      sentCount: notificationsSent.length,
      byChannel: {
        sms: notificationsSent.filter(n => n.channels?.includes('sms')).length,
        app: notificationsSent.filter(n => n.channels?.includes('app')).length,
        email: notificationsSent.filter(n => n.channels?.includes('email')).length
      }
    },
    supervision: {
      totalCount: supervisions.length,
      byCategory: supervisionByCategory,
      byUrgency: supervisionByUrgency,
      byDepartment: supervisedDepts,
      list: supervisions.map(s => ({
        id: s.id, taskId: s.taskId, eventId: s.eventId,
        eventTitle: s.eventTitle, category: s.category, urgency: s.urgency,
        department: s.department, content: s.content?.slice(0, 50),
        createdByName: s.createdByName, createdAt: s.createdAt
      }))
    },
    meetings: {
      totalCount: meetings.length,
      byType: meetingByType,
      list: meetings.map(m => ({
        id: m.id, eventId: m.eventId, title: m.title, type: m.type,
        participantsCount: (m.participants || []).length,
        todoCount: (m.todoItems || []).length,
        createdByName: m.createdByName, createdAt: m.createdAt
      }))
    },
    highlights: (() => {
      const items = [];
      if (newEvents.some(e => e.level === 'I' || e.level === 'II')) {
        items.push('今日发生高等级紧急事件，请关注后续处置进展');
      }
      const slow = responseTimes.filter(v => v > 15);
      if (slow.length > 0) {
        items.push(`${slow.length} 个任务响应时间超过 15 分钟，建议排查`);
      }
      if (tasksCompleted.length > 0 && resolutionTimes.length > 0 &&
          Math.round(resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length) > 120) {
        items.push('平均处置耗时超过 2 小时，建议优化协同流程');
      }
      if (items.length === 0) items.push('今日整体运行平稳，各项指标处于正常范围');
      return items;
    })()
  };
};

const getDailyReport = (req, res) => {
  const { date } = req.query;
  const report = buildDailyReport(date);
  return success(res, report, `${report.date} 处置日报已生成`);
};

const getReportRange = (req, res) => {
  const { startDate, endDate } = req.query;
  const start = moment(startDate || moment().subtract(6, 'days').format('YYYY-MM-DD'));
  const end = moment(endDate || moment().format('YYYY-MM-DD'));
  const days = Math.min(31, end.diff(start, 'days') + 1);

  const dailyReports = [];
  for (let i = 0; i < days; i++) {
    const d = start.clone().add(i, 'days');
    const r = buildDailyReport(d.format('YYYY-MM-DD'));
    dailyReports.push({
      date: r.date,
      newEvents: r.events.newCount,
      closedEvents: r.events.closedCount,
      handling: r.events.handlingCount,
      tasksCompleted: r.tasks.completedCount,
      avgResolutionMinutes: r.performance.avgResolutionMinutes,
      resolutionRate: r.performance.resolutionRate
    });
  }

  const summary = {
    totalNewEvents: dailyReports.reduce((s, d) => s + d.newEvents, 0),
    totalClosedEvents: dailyReports.reduce((s, d) => s + d.closedEvents, 0),
    totalTasksCompleted: dailyReports.reduce((s, d) => s + d.tasksCompleted, 0),
    avgResolutionMinutes: dailyReports.some(d => d.avgResolutionMinutes > 0)
      ? Math.round(dailyReports.filter(d => d.avgResolutionMinutes > 0).reduce((s, d) => s + d.avgResolutionMinutes, 0) /
        dailyReports.filter(d => d.avgResolutionMinutes > 0).length)
      : 0
  };

  return success(res, {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
    days,
    daily: dailyReports,
    summary
  }, `区间处置统计已生成 (${days}天)`);
};

module.exports = { getDailyReport, getReportRange, buildDailyReport };
