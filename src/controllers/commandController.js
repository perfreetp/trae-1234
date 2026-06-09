const { db, generateId, createTaskId } = require('../data/database');
const { success, fail, notFound } = require('../utils/response');

const getCommandContext = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.eventId);
  if (!event) return notFound(res, '事件不存在');

  const timeline = (db.eventTimelines[event.id] || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const tasks = db.tasks.filter(t => t.eventId === event.id);
  const notifications = db.notifications.filter(n => n.eventId === event.id);

  const relatedObject = event.objectId ? (db.cityObjects.find(o => o.id === event.objectId) || db.keyPlaces.find(p => p.id === event.objectId)) : null;
  const relatedSensors = event.objectId ? db.sensors.filter(s => s.objectId === event.objectId) : [];

  const matchingPlans = db.plans.map(plan => {
    let score = 0;
    if (plan.type === event.type) score += 40;
    if (plan.applicableLevels.includes(event.level)) score += 25;
    if (score >= 50) score += 15;
    return { plan, score: Math.min(score, 100) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
  const matchedPlan = matchingPlans[0]?.plan || null;

  const matchedPlanResources = matchedPlan
    ? (matchedPlan.requiredResources || []).map(rid => db.resources.find(r => r.id === rid)).filter(Boolean)
    : [];

  const nearbyResources = db.resources
    .filter(r => r.location)
    .map(r => {
      const dx = r.location.lat - event.location.lat;
      const dy = r.location.lng - event.location.lng;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy) * 111320);
      return { ...r, distance };
    })
    .filter(r => r.distance < 8000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 15);

  const evacuationRoutes = db.evacuationRoutes
    .map(r => {
      const dx = r.startPoint.lat - event.location.lat;
      const dy = r.startPoint.lng - event.location.lng;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy) * 111320);
      return { ...r, distanceFromEvent: distance };
    })
    .filter(r => r.distanceFromEvent < 5000)
    .sort((a, b) => a.distanceFromEvent - b.distanceFromEvent)
    .slice(0, 5);

  const shelters = db.resources.filter(r => r.category === 'shelter');

  const heatAround = db.heatmapData.grids.filter(g => {
    const dx = g.lat - event.location.lat;
    const dy = g.lng - event.location.lng;
    return Math.sqrt(dx * dx + dy * dy) * 111320 < (event.impactRadius || 500) * 2;
  });

  const alarms = db.sensors.filter(s => s.threshold && s.value >= s.threshold);

  const involvedDepts = (event.departmentIds || []).map(did => {
    const dept = db.departments.find(d => d.id === did);
    const deptTasks = tasks.filter(t => t.department === did);
    return {
      id: did,
      name: dept?.name || did,
      contact: dept?.contact,
      leader: dept?.dutyLeader,
      onDuty: dept?.onDutyStaff || 0,
      tasksCount: deptTasks.length,
      completedTasks: deptTasks.filter(t => t.status === 'completed').length,
      avgProgress: deptTasks.length ? Math.round(deptTasks.reduce((s, t) => s + t.progress, 0) / deptTasks.length) : 0
    };
  });

  const deptMap = {
    fire: ['消防支队', '急救中心', '交警支队'],
    gas: ['消防支队', '燃气公司', '交警支队', '街道办'],
    traffic: ['交警支队', '急救中心'],
    structural: ['消防支队', '急救中心', '交警支队', '住建局'],
    chemical: ['消防支队', '急救中心', '环保局', '交警支队'],
    medical: ['卫健委', '急救中心', '疾控中心', '街道办'],
    flood: ['水务局', '消防支队', '街道办', '交警支队'],
    public_order: ['公安局', '街道办', '交警支队']
  };
  const suggestedDepts = deptMap[event.type] || deptMap.fire;

  const taskStats = {
    total: tasks.length,
    dispatched: tasks.filter(t => t.status === 'dispatched').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    avgProgress: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0
  };

  let duration = null;
  if (event.closedAt) duration = Math.round((new Date(event.closedAt) - new Date(event.createdAt)) / 60000);
  else duration = Math.round((Date.now() - new Date(event.createdAt).getTime()) / 60000);

  return success(res, {
    eventId: event.id,
    event,
    durationMinutes: duration,
    relatedObject,
    relatedSensors,
    timeline,
    tasks,
    taskStats,
    notifications,
    matchedPlan,
    matchedPlanResources,
    nearbyResources,
    evacuationRoutes,
    shelters,
    heatAround,
    alarms,
    involvedDepts,
    suggestedDepts,
    nextSuggestedActions: _generateSuggestedActions(event, tasks, matchedPlan, involvedDepts)
  });
};

const _generateSuggestedActions = (event, tasks, plan, depts) => {
  const actions = [];
  if (!plan) actions.push({ priority: 'high', action: 'MATCH_PLAN', label: '匹配并启动应急预案' });
  if (tasks.filter(t => t.type === 'firefighting').length === 0 && (event.type === 'fire' || event.type === 'gas' || event.type === 'chemical')) {
    actions.push({ priority: 'urgent', action: 'DISPATCH_FIRE', label: '立即派发消防灭火任务' });
  }
  if (tasks.filter(t => t.type === 'medical').length === 0) {
    actions.push({ priority: 'high', action: 'DISPATCH_MEDICAL', label: '派遣医疗急救力量' });
  }
  if (tasks.filter(t => t.type === 'traffic_control').length === 0 && ['fire', 'gas', 'chemical', 'traffic', 'structural'].includes(event.type)) {
    actions.push({ priority: 'high', action: 'DISPATCH_TRAFFIC', label: '实施周边交通管制' });
  }
  if (depts.length < 3) actions.push({ priority: 'high', action: 'NOTIFY_DEPTS', label: '通知所有相关联动部门' });
  if (!event.commanderId) actions.push({ priority: 'urgent', action: 'ASSIGN_COMMANDER', label: '指派事件指挥官' });
  if (actions.length === 0) actions.push({ priority: 'low', action: 'MONITOR', label: '持续监控事件进展' });
  return actions;
};

const executeAction = (req, res) => {
  const { eventId, action, params } = req.body;
  const event = db.emergencyEvents.find(e => e.id === eventId);
  if (!event) return notFound(res, '事件不存在');

  const actor = req.user?.id || 'system';
  const actorName = req.user?.name || '系统';
  const results = [];
  const now = new Date().toISOString();

  const addTimeline = (action_type, description, data = {}) => {
    db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
    db.eventTimelines[eventId].push({ id: generateId(), timestamp: now, actor, action: action_type, description, data });
  };

  switch (action) {
    case 'MATCH_PLAN': {
      const matches = db.plans.map(p => {
        let s = 0;
        if (p.type === event.type) s += 40;
        if (p.applicableLevels.includes(event.level)) s += 25;
        return { p, s };
      }).sort((a, b) => b.s - a.s);
      if (matches.length > 0 && matches[0].s > 0) {
        const plan = matches[0].p;
        event.currentPhase = '预案启动';
        event.updatedAt = now;
        addTimeline('plan_activated', `${actorName} 启动预案: ${plan.name}`, { planId: plan.id, score: matches[0].s });
        results.push({ type: 'plan', plan, message: `已匹配预案: ${plan.name}` });
      }
      break;
    }
    case 'DISPATCH_FIRE': {
      const task = {
        id: createTaskId(),
        eventId,
        title: `【${event.level}级】${event.title} - 灭火救援`,
        type: 'firefighting',
        department: '消防支队',
        assignee: '陈队长',
        priority: 'urgent',
        status: 'dispatched',
        location: event.location,
        description: `赶赴现场处置: ${event.description || event.title}`,
        resourceIds: ['RES-FIRE-001', 'RES-FIRE-002', 'RES-FIRE-003'],
        createdAt: now,
        progress: 0,
        progressUpdates: []
      };
      db.tasks.push(task);
      event.departmentIds = Array.from(new Set([...(event.departmentIds || []), '消防支队']));
      addTimeline('task_dispatched', `派发灭火任务: ${task.title}`, { taskId: task.id });
      results.push({ type: 'task', task, message: '已派发消防任务' });
      break;
    }
    case 'DISPATCH_MEDICAL': {
      const task = {
        id: createTaskId(),
        eventId,
        title: `【${event.level}级】${event.title} - 医疗救援`,
        type: 'medical',
        department: '急救中心',
        assignee: '李医生',
        priority: 'urgent',
        status: 'dispatched',
        location: event.location,
        description: '携带急救设备赶赴现场，随时转运伤员',
        resourceIds: ['RES-MED-001', 'RES-MED-002'],
        createdAt: now,
        progress: 0,
        progressUpdates: []
      };
      db.tasks.push(task);
      event.departmentIds = Array.from(new Set([...(event.departmentIds || []), '急救中心']));
      addTimeline('task_dispatched', `派发医疗任务: ${task.title}`, { taskId: task.id });
      results.push({ type: 'task', task, message: '已派发给急救中心' });
      break;
    }
    case 'DISPATCH_TRAFFIC': {
      const task = {
        id: createTaskId(),
        eventId,
        title: `【${event.level}级】${event.title} - 交通管制`,
        type: 'traffic_control',
        department: '交警支队',
        assignee: '刘警官',
        priority: 'high',
        status: 'dispatched',
        location: event.location,
        description: '对事件地点周边道路实施临时交通管制，开辟救援通道',
        resourceIds: ['RES-POLICE-001', 'RES-POLICE-002'],
        createdAt: now,
        progress: 0,
        progressUpdates: []
      };
      db.tasks.push(task);
      event.departmentIds = Array.from(new Set([...(event.departmentIds || []), '交警支队']));
      addTimeline('task_dispatched', `派发交通管制任务: ${task.title}`, { taskId: task.id });
      results.push({ type: 'task', task, message: '已派发交警任务' });
      break;
    }
    case 'NOTIFY_DEPTS': {
      const deptMap = { fire: ['消防支队', '急救中心', '交警支队'], gas: ['消防支队', '急救中心', '交警支队', '燃气公司'], traffic: ['交警支队', '急救中心'], structural: ['消防支队', '急救中心', '交警支队'], chemical: ['消防支队', '急救中心', '交警支队', '环保局'], medical: ['卫健委', '急救中心', '疾控中心'], flood: ['水务局', '消防支队', '交警支队'], public_order: ['公安局', '交警支队'] };
      const departments = deptMap[event.type] || deptMap.fire;
      departments.forEach(did => {
        const notif = {
          id: generateId(),
          eventId,
          type: 'event_alert',
          recipients: [{ type: 'department', id: did }],
          title: `【${event.level}级应急】${event.title}`,
          content: `事件编号: ${eventId}\n地点: ${event.address || '待补充'}\n请${did}立即响应。`,
          channels: ['sms', 'app', 'email'],
          sentAt: now,
          readCount: 0,
          totalCount: 10,
          status: 'sent'
        };
        db.notifications.push(notif);
      });
      event.departmentIds = Array.from(new Set([...(event.departmentIds || []), ...departments]));
      addTimeline('departments_notified', `已通知: ${departments.join('、')}`, { departments });
      results.push({ type: 'notification', departments, message: `已通知 ${departments.length} 个部门` });
      break;
    }
    case 'ASSIGN_COMMANDER': {
      const commander = params?.commanderId || 'commander001';
      event.commanderId = commander;
      event.currentPhase = '指挥中';
      event.updatedAt = now;
      const user = db.users.find(u => u.id === commander);
      addTimeline('commander_assigned', `${actorName} 指派 ${user?.name || commander} 为指挥官`, { commanderId: commander });
      results.push({ type: 'command', commander, message: `已指派指挥官: ${user?.name || commander}` });
      break;
    }
    case 'UPGRADE_LEVEL': {
      const levels = ['IV', 'III', 'II', 'I'];
      const currIdx = levels.indexOf(event.level);
      if (currIdx < levels.length - 1) {
        const newLevel = levels[currIdx + 1];
        addTimeline('event_upgraded', `${actorName} 将事件从 ${event.level}级 升级为 ${newLevel}级`, { from: event.level, to: newLevel });
        event.level = newLevel;
        event.updatedAt = now;
        const radii = { I: 2000, II: 1000, III: 500, IV: 200 };
        event.impactRadius = radii[newLevel];
        results.push({ type: 'level', level: newLevel, message: `事件等级已升级为 ${newLevel}级` });
      }
      break;
    }
    case 'CLOSE_EVENT': {
      event.status = 'resolved';
      event.currentPhase = '处置完成';
      event.closedAt = now;
      event.updatedAt = now;
      db.tasks.filter(t => t.eventId === eventId && t.status !== 'completed').forEach(t => { t.status = 'completed'; t.progress = 100; });
      addTimeline('event_closed', `${actorName} 关闭事件，状态: 处置完成`);
      results.push({ type: 'close', message: '事件已关闭' });
      break;
    }
    default:
      return fail(res, 400, `未知操作: ${action}`);
  }

  event.updatedAt = now;
  const tasks = db.tasks.filter(t => t.eventId === eventId);
  return success(res, { event, results, action, tasks });
};

const reportProgress = (req, res) => {
  const { eventId, taskId, progress, status, description, images } = req.body;
  if (!eventId) return fail(res, 400, 'eventId为必填项');

  const event = db.emergencyEvents.find(e => e.id === eventId);
  if (!event) return notFound(res, '事件不存在');

  const now = new Date().toISOString();
  const updates = [];

  if (taskId) {
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return notFound(res, '任务不存在');
    if (typeof progress === 'number') task.progress = Math.max(0, Math.min(100, progress));
    if (status) task.status = status;
    task.progressUpdates.push({ time: now, status: status || '进展', description: description || '', images });
    if (task.progress >= 100 || status === 'completed') {
      task.status = 'completed';
      task.completedAt = now;
      task.progress = 100;
    }
    updates.push({ type: 'task', taskId, message: '任务进展已更新' });
  }

  db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
  db.eventTimelines[eventId].push({
    id: generateId(),
    timestamp: now,
    actor: req.user?.id || 'patrol',
    action: 'field_report',
    description: `${req.user?.name || '巡查人员'} 回传现场进展${description ? ': ' + description : ''}`,
    data: { taskId, progress, status, images }
  });
  event.updatedAt = now;
  updates.push({ type: 'timeline', message: '现场进展已记录' });

  return success(res, { event, updates });
};

module.exports = { getCommandContext, executeAction, reportProgress };
