const { db, generateId, createTaskId } = require('../data/database');
const { success, fail, notFound, generateCirclePoints, isWithinRadius, calculateDistance } = require('../utils/response');
const { hasPermission, COMMAND_ACTION_PERMISSIONS } = require('../middleware/auth');
const { markDirty } = require('../utils/persist');

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
  const { eventId, action } = req.body;
  if (!eventId || !action) return fail(res, 400, 'eventId和action为必填项');

  const requiredPerm = COMMAND_ACTION_PERMISSIONS[action];
  if (requiredPerm && !hasPermission(req.user, requiredPerm)) {
    return res.status(403).json({
      code: 403,
      message: '权限不足，无法执行该指挥动作',
      action,
      requiredPermission: requiredPerm,
      userRole: req.user?.role,
      user: req.user?.name
    });
  }

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
  markDirty();
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
  markDirty();
  return success(res, { event, updates });
};

const getDeepPackage = (req, res) => {
  const eventId = req.params.eventId;
  const event = db.emergencyEvents.find(e => e.id === eventId);
  if (!event) return notFound(res, '事件不存在');

  const center = event.location;
  const radius = event.impactRadius || 500;

  const timeline = (db.eventTimelines[eventId] || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const tasks = db.tasks.filter(t => t.eventId === eventId);
  const notifications = db.notifications.filter(n => n.eventId === eventId);

  const relatedObject = event.objectId
    ? (db.cityObjects.find(o => o.id === event.objectId) || db.keyPlaces.find(p => p.id === event.objectId))
    : null;
  const relatedSensors = event.objectId ? db.sensors.filter(s => s.objectId === event.objectId) : [];

  const affectedObjects = db.cityObjects.filter(o => o.location && isWithinRadius(o.location, center, radius));
  const affectedPlaces = db.keyPlaces.filter(p => p.location && isWithinRadius(p.location, center, radius));
  const affectedSensors = db.sensors.filter(s => s.location && isWithinRadius({ lat: s.location.lat, lng: s.location.lng }, center, radius));
  const affectedHeat = db.heatmapData.grids.filter(g => isWithinRadius({ lat: g.lat, lng: g.lng }, center, radius * 2));
  const estimatedAffectedPeople = affectedHeat.reduce((s, g) => s + g.peopleCount, 0);

  const impactAssessment = {
    center,
    radius,
    perimeter: generateCirclePoints(center, radius),
    affectedObjects,
    affectedPlaces,
    affectedSensors,
    affectedPeople: estimatedAffectedPeople,
    affectedHeatSnapshot: affectedHeat,
    zones: [
      { name: '核心危险区', radius: radius, color: '#ff4d4f', opacity: 0.35 },
      { name: '缓冲警戒区', radius: Math.round(radius * 1.5), color: '#faad14', opacity: 0.2 },
      { name: '影响观察区', radius: Math.round(radius * 2.5), color: '#52c41a', opacity: 0.12 }
    ]
  };

  const nearbyResources = db.resources
    .filter(r => r.location)
    .map(r => ({ ...r, distance: calculateDistance(r.location, center) }))
    .filter(r => r.distance < 10000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);

  const matchingPlans = db.plans.map(plan => {
    let score = 0;
    const reasons = [];
    if (plan.type === event.type) { score += 40; reasons.push('类型匹配'); }
    if (plan.applicableLevels.includes(event.level)) { score += 25; reasons.push('等级匹配'); }
    if (relatedObject) {
      const hit = (plan.applicableScenarios || []).some(sc => {
        const s = sc.toLowerCase();
        const d = (relatedObject.description || relatedObject.name || '').toLowerCase();
        if (d.includes(s)) return true;
        if (relatedObject.floors > 20 && s.includes('高层')) return true;
        if (relatedObject.type === 'mall' && s.includes('商业')) return true;
        return false;
      });
      if (hit) { score += 20; reasons.push('场景特征匹配'); }
    }
    if (score >= 50) score += 15;
    return {
      plan,
      score: Math.min(score, 100),
      matchLevel: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
      reasons,
      matchedResources: (plan.requiredResources || []).map(rid => db.resources.find(r => r.id === rid)).filter(Boolean)
    };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

  const recommendedPlan = matchingPlans[0] || null;

  const evacuationSuggestion = (() => {
    const routes = db.evacuationRoutes
      .map(r => ({ ...r, distanceFromEvent: calculateDistance(r.startPoint, center) }))
      .filter(r => r.distanceFromEvent < 8000)
      .sort((a, b) => a.distanceFromEvent - b.distanceFromEvent)
      .slice(0, 6);
    const shelters = db.resources
      .filter(r => r.category === 'shelter' && r.location)
      .map(r => ({ ...r, distance: calculateDistance(r.location, center) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    const totalCapacity = routes.reduce((s, r) => s + r.capacity, 0);
    return { routes, shelters, totalCapacity, peopleNeedEvacuation: Math.max(0, estimatedAffectedPeople - Math.floor(totalCapacity * 0.8)) };
  })();

  const taskStats = {
    total: tasks.length,
    dispatched: tasks.filter(t => t.status === 'dispatched').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
    avgProgress: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0,
    overallStatus: tasks.length === 0 ? '待派发' : tasks.every(t => t.status === 'completed') ? '全部完成' : tasks.some(t => t.status === 'in_progress') ? '处置进行中' : '等待接收'
  };

  const involvedDepts = (event.departmentIds || []).map(did => {
    const dept = db.departments.find(d => d.id === did);
    const deptTasks = tasks.filter(t => t.department === did);
    return {
      id: did,
      name: dept?.name || did,
      contact: dept?.contact,
      leader: dept?.dutyLeader,
      leaderPhone: dept?.phone,
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

  const playbackFrames = (() => {
    if (timeline.length === 0) return [];
    const startTime = new Date(timeline[0].timestamp).getTime();
    const frames = [];
    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      const time = new Date(t.timestamp);
      const offset = Math.max(0, Math.floor((time.getTime() - startTime) / 1000));
      const tasksSnapshot = tasks.filter(ts => new Date(ts.createdAt) <= time);
      frames.push({
        index: i + 1,
        offsetSeconds: offset,
        timestamp: t.timestamp,
        timelineEvent: t,
        tasksSnapshot: tasksSnapshot.map(ts => ({
          id: ts.id, title: ts.title, type: ts.type, department: ts.department,
          status: new Date(ts.completedAt || ts.updatedAt || ts.createdAt) <= time ? (ts.status === 'completed' ? 'completed' : ts.acceptedAt && new Date(ts.acceptedAt) <= time ? 'in_progress' : 'dispatched') : 'pending'
        })),
        phase: i < 2 ? '接警响应' : i < 4 ? '联动处置' : i < timeline.length - 1 ? '攻坚处置' : '收尾清理'
      });
    }
    return frames;
  })();

  let durationMinutes = null;
  if (event.closedAt) durationMinutes = Math.round((new Date(event.closedAt) - new Date(event.createdAt)) / 60000);
  else durationMinutes = Math.max(1, Math.round((Date.now() - new Date(event.createdAt).getTime()) / 60000));

  const deptMap2 = { fire: 42, traffic: 68, gas: 8, medical: 21, structural: 5, chemical: 3, flood: 6, public_order: 17 };
  const byLevelCount = { I: 0, II: 0, III: 0, IV: 0 };
  const byTypeCount = {};
  db.emergencyEvents.forEach(e => {
    if (byLevelCount[e.level] !== undefined) byLevelCount[e.level]++;
    byTypeCount[e.type] = (byTypeCount[e.type] || 0) + 1;
  });

  const pkg = {
    _meta: {
      generatedAt: new Date().toISOString(),
      eventId,
      packageVersion: '1.0.0',
      forClient: ['指挥大屏', '街道值班端', '巡查App'],
      renderSections: ['事件卡片', '地图图层', '影响评估', '预案匹配', '疏散导航', '任务看板', '部门联动', '时间线', '复盘回放', '统计快照']
    },
    event,
    eventSummary: {
      id: event.id,
      title: event.title,
      type: event.type,
      level: event.level,
      status: event.status,
      phase: event.currentPhase,
      address: event.address,
      durationMinutes,
      location: event.location,
      tags: event.tags || [],
      reporter: event.reporter,
      commander: event.commanderId ? db.users.find(u => u.id === event.commanderId)?.name || null : null,
      createdAt: event.createdAt,
      closedAt: event.closedAt
    },
    impact: impactAssessment,
    relatedContext: { relatedObject, relatedSensors },
    planMatching: {
      totalMatches: matchingPlans.length,
      recommended: recommendedPlan,
      alternatives: matchingPlans.slice(1, 3)
    },
    evacuation: evacuationSuggestion,
    resourceSnapshot: {
      nearbyCount: nearbyResources.length,
      nearby: nearbyResources.slice(0, 10),
      allAvailable: nearbyResources
    },
    tasks: {
      summary: taskStats,
      list: tasks,
      byDepartment: Object.fromEntries(
        Array.from(new Set(tasks.map(t => t.department))).map(dept => [
          dept,
          {
            list: tasks.filter(t => t.department === dept),
            avgProgress: tasks.filter(t => t.department === dept).length
              ? Math.round(tasks.filter(t => t.department === dept).reduce((s, t) => s + t.progress, 0) / tasks.filter(t => t.department === dept).length)
              : 0
          }
        ])
      )
    },
    departmentCoordination: {
      involved: involvedDepts,
      suggested: suggestedDepts.filter(d => !event.departmentIds?.includes(d)).map(did => {
        const dept = db.departments.find(d => d.id === did);
        return { id: did, name: dept?.name || did, contact: dept?.contact, onDuty: dept?.onDutyStaff || 0, notified: false };
      }),
      allNotified: suggestedDepts.every(d => event.departmentIds?.includes(d))
    },
    notifications: {
      totalSent: notifications.length,
      byChannel: {
        sms: notifications.filter(n => n.channels?.includes('sms')).length,
        app: notifications.filter(n => n.channels?.includes('app')).length,
        email: notifications.filter(n => n.channels?.includes('email')).length,
        broadcast: notifications.filter(n => n.channels?.includes('broadcast')).length
      },
      list: notifications.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)),
      readProgress: {
        total: notifications.reduce((s, n) => s + (n.totalCount || 0), 0),
        read: notifications.reduce((s, n) => s + (n.readCount || 0), 0)
      }
    },
    timeline: {
      count: timeline.length,
      events: timeline,
      phaseBreakdown: (() => {
        const phases = {};
        timeline.forEach(t => {
          const act = t.action;
          let phase = '其他';
          if (act === 'event_created' || act === 'event_verified') phase = '接警响应';
          else if (act === 'plan_matched' || act === 'plan_activated' || act === 'departments_notified') phase = '联动启动';
          else if (act.startsWith('task_')) phase = '任务处置';
          else if (act === 'field_report' || act.includes('progress')) phase = '现场处置';
          else if (act === 'event_closed' || act.includes('closed')) phase = '处置结束';
          phases[phase] = (phases[phase] || 0) + 1;
        });
        return phases;
      })()
    },
    playback: {
      totalFrames: playbackFrames.length,
      totalSeconds: playbackFrames.length > 0 ? playbackFrames[playbackFrames.length - 1].offsetSeconds + 60 : 300,
      startTime: timeline[0]?.timestamp,
      endTime: event.closedAt || timeline[timeline.length - 1]?.timestamp,
      frames: playbackFrames
    },
    suggestedActions: _generateSuggestedActions(event, tasks, recommendedPlan?.plan, involvedDepts),
    statisticsSnapshot: {
      eventsToday: db.emergencyEvents.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length,
      eventsOpen: db.emergencyEvents.filter(e => e.status !== 'closed' && e.status !== 'resolved').length,
      tasksCompletedToday: db.tasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length,
      eventsByType: byTypeCount,
      eventsByLevel: byLevelCount
    }
  };

  return success(res, pkg, `事件 ${eventId} 深度协同包已生成，共 ${pkg._meta.renderSections.length} 个渲染分区`);
};

const LEVEL_SCORE = { I: 4, II: 3, III: 2, IV: 1 };

const getDutyDashboard = (req, res) => {
  const { level, street, type } = req.query;
  const now = new Date();

  const STREET_DEPT_MAP = {
    '街道办': ['中关村街道办', '海淀街道办', '朝阳街道办', '西城街道办', '东城街道办'],
    '巡逻组': ['中关村街道办', '海淀街道办']
  };

  let openEvents = db.emergencyEvents.filter(e => e.status !== 'closed' && e.status !== 'resolved');

  if (level) openEvents = openEvents.filter(e => e.level === level);
  if (type) openEvents = openEvents.filter(e => e.type === type);
  if (street) {
    openEvents = openEvents.filter(e => {
      const deptIds = e.departmentIds || [];
      return deptIds.some(d => {
        const mapped = STREET_DEPT_MAP[d] || [];
        return d === street || mapped.includes(street);
      }) || (e.address && e.address.includes(street.replace('街道办', '')));
    });
  }

  const highLevelEvents = openEvents
    .filter(e => e.level === 'I' || e.level === 'II')
    .sort((a, b) => (LEVEL_SCORE[b.level] || 0) - (LEVEL_SCORE[a.level] || 0) || new Date(a.createdAt) - new Date(b.createdAt))
    .map(e => {
      const tasks = db.tasks.filter(t => t.eventId === e.id);
      const durationMin = Math.round((now - new Date(e.createdAt)) / 60000);
      return {
        id: e.id, title: e.title, type: e.type, level: e.level,
        status: e.status, address: e.address, location: e.location,
        createdAt: e.createdAt, currentPhase: e.currentPhase,
        durationMinutes: durationMin,
        tasksCount: tasks.length,
        tasksCompleted: tasks.filter(t => t.status === 'completed').length,
        departments: e.departmentIds || [],
        reporterDept: e.reporterDept
      };
    });

  const activeTasks = [];
  openEvents.forEach(e => {
    db.tasks.filter(t => t.eventId === e.id).forEach(t => activeTasks.push({ ...t, eventLevel: e.level }));
  });

  const timeoutTasks = activeTasks.filter(t => {
    if (t.status === 'completed') return false;
    const ageMin = Math.round((now - new Date(t.createdAt)) / 60000);
    if (t.status === 'dispatched' && ageMin > 20) return true;
    if (t.status === 'in_progress' && t.acceptedAt) {
      const workMin = Math.round((now - new Date(t.acceptedAt)) / 60000);
      if (workMin > 120) return true;
    }
    if (t.deadline) {
      const dead = new Date(t.deadline);
      if (dead < now) return true;
    }
    if (ageMin > 240) return true;
    return false;
  }).map(t => ({
    id: t.id, title: t.title, department: t.department, priority: t.priority,
    eventId: t.eventId, eventLevel: t.eventLevel, status: t.status, progress: t.progress,
    ageMinutes: Math.round((now - new Date(t.createdAt)) / 60000),
    acceptedAt: t.acceptedAt, deadline: t.deadline,
    reason: (() => {
      const age = Math.round((now - new Date(t.createdAt)) / 60000);
      if (t.deadline && new Date(t.deadline) < now) return '已超截止期限';
      if (t.status === 'dispatched') return '待接收超时(' + age + '分钟)';
      if (t.status === 'in_progress' && t.acceptedAt) {
        const w = Math.round((now - new Date(t.acceptedAt)) / 60000);
        return '处置耗时较长(' + w + '分钟)';
      }
      return '任务存在超过' + age + '分钟';
    })()
  })).sort((a, b) => b.ageMinutes - a.ageMinutes);

  const pendingNotifyDepts = [];
  openEvents.forEach(e => {
    const TYPE_DEPT_MAP = {
      fire: ['消防支队', '急救中心'], gas: ['消防支队', '燃气公司'], traffic: ['交警支队', '急救中心'],
      structural: ['消防支队', '住建局'], chemical: ['消防支队', '环保局'],
      medical: ['卫健委', '疾控中心'], flood: ['水务局', '消防支队'], public_order: ['公安局']
    };
    const required = TYPE_DEPT_MAP[e.type] || ['消防支队', '急救中心'];
    const linked = e.departmentIds || [];
    const missing = required.filter(d => !linked.includes(d));
    if (missing.length) {
      pendingNotifyDepts.push({
        eventId: e.id, eventLevel: e.level, eventTitle: e.title,
        eventType: e.type, notified: linked, missing,
        createdAt: e.createdAt,
        hoursSince: Math.round((now - new Date(e.createdAt)) / 3600000 * 10) / 10
      });
    }
  });

  const resourceUtilList = db.resources.map(r => {
    const used = db.tasks.filter(t => (t.resourceIds || []).includes(r.id) && t.status !== 'completed').length;
    const total = r.totalCount || 5;
    const util = Math.min(100, Math.round((used / total) * 100));
    return {
      id: r.id, name: r.name, category: r.category,
      used, total, utilization: util, status: util > 80 ? '紧张' : util > 50 ? '正常' : '充足',
      location: r.location, contact: r.contact
    };
  });

  const resourceTightPoints = resourceUtilList
    .filter(r => r.utilization >= 60)
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 10);

  const allTimelineEvents = [];
  openEvents.forEach(e => {
    (db.eventTimelines[e.id] || []).forEach(tl => {
      allTimelineEvents.push({ ...tl, eventId: e.id, eventLevel: e.level, eventTitle: e.title });
    });
  });
  const recentTimeline = allTimelineEvents
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 30);

  const highRisk = openEvents.filter(e => e.level === 'I').length;
  const mediumRisk = openEvents.filter(e => e.level === 'II').length;

  return success(res, {
    _meta: {
      generatedAt: new Date().toISOString(),
      filter: { level: level || '全部', street: street || '全部', type: type || '全部' },
      sections: ['态势总览', '高等级事件', '超时任务预警', '待通知部门', '资源紧张点', '关键时间线']
    },
    overview: {
      openEvents: openEvents.length,
      highLevelEvents: highLevelEvents.length,
      highRisk,
      mediumRisk,
      activeTasks: activeTasks.length,
      timeoutTasks: timeoutTasks.length,
      pendingNotify: pendingNotifyDepts.length,
      resourcesTight: resourceTightPoints.filter(r => r.status === '紧张').length,
      avgResponseMinutes: activeTasks.filter(t => t.acceptedAt).length
        ? Math.round(activeTasks.filter(t => t.acceptedAt).reduce((s, t) => {
            const m = Math.round((new Date(t.acceptedAt) - new Date(t.createdAt)) / 60000);
            return s + Math.max(0, m);
          }, 0) / activeTasks.filter(t => t.acceptedAt).length)
        : 0
    },
    highLevelEvents: highLevelEvents.slice(0, 20),
    timeoutTasks: timeoutTasks.slice(0, 30),
    pendingNotifyDepts,
    resourceTightPoints,
    recentTimeline,
    filterOptions: {
      levels: ['I', 'II', 'III', 'IV'],
      types: Array.from(new Set(openEvents.map(e => e.type))),
      streets: ['中关村街道办', '海淀街道办', '朝阳街道办', '西城街道办', '东城街道办']
    }
  }, '值班态势工作台已生成，' + openEvents.length + '个未关闭事件');
};

const classifyTask = (task) => {
  const now = new Date();
  const created = new Date(task.createdAt);
  const ageMin = (now - created) / 60000;
  const lastProgress = (task.progressUpdates && task.progressUpdates.length > 0)
    ? new Date(task.progressUpdates[task.progressUpdates.length - 1].time)
    : created;
  const stagnantMin = (now - lastProgress) / 60000;
  const deadline = task.deadline ? new Date(task.deadline) : null;
  const toDeadlineMin = deadline ? (deadline - now) / 60000 : Infinity;

  let reasons = [];
  let category = null;

  if (task.status === 'dispatched' && ageMin > 20) {
    reasons.push('派发' + ageMin.toFixed(0) + '分钟未接收');
    category = category || 'unaccepted';
  }
  if (deadline && deadline < now) {
    reasons.push('已超截止期限' + ((now - deadline) / 60000).toFixed(0) + '分钟');
    category = category || 'timeout';
  }
  if (ageMin > 240) {
    reasons.push('任务存在' + ageMin.toFixed(0) + '分钟未完成');
    category = category || 'timeout';
  }
  if (task.status === 'in_progress' && stagnantMin > 120) {
    reasons.push('进度停滞' + stagnantMin.toFixed(0) + '分钟，当前' + (task.progress || 0) + '%');
    category = category || 'stagnant';
  }
  if (deadline && toDeadlineMin > 0 && toDeadlineMin < 60) {
    reasons.push('临近截止，还剩' + toDeadlineMin.toFixed(0) + '分钟，当前' + (task.progress || 0) + '%');
    category = category || 'approaching';
  }

  return { category, reasons };
};

const getSupervisionGroups = (req, res) => {
  const { type, level, status, category } = req.query;
  let openEvents = db.emergencyEvents.filter(e => !e.closedAt);
  if (level) openEvents = openEvents.filter(e => e.level === level);
  if (type) openEvents = openEvents.filter(e => e.type === type);
  const openEventIds = new Set(openEvents.map(e => e.id));

  let grouped = { timeout: [], unaccepted: [], stagnant: [], approaching: [] };
  let meta = { timeout: 0, unaccepted: 0, stagnant: 0, approaching: 0, totalSupervisedToday: 0 };

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  meta.totalSupervisedToday = (db.supervisionRecords || []).filter(s => s.createdAt >= todayStart).length;

  db.tasks.forEach(task => {
    if (!openEventIds.has(task.eventId)) return;
    if (status && task.status !== status) return;

    const { category: cat, reasons } = classifyTask(task);
    if (!cat) return;
    if (category && category !== cat) return;

    const event = openEvents.find(e => e.id === task.eventId);
    grouped[cat].push({
      ...task,
      eventInfo: event ? { id: event.id, title: event.title, level: event.level, type: event.type, address: event.address } : null,
      supervisionReasons: reasons,
      supervisionCategory: cat
    });
    meta[cat]++;
  });

  ['timeout', 'unaccepted', 'stagnant', 'approaching'].forEach(c =>
    grouped[c].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  );

  return success(res, {
    _meta: {
      ...meta,
      totalNeedSupervision: meta.timeout + meta.unaccepted + meta.stagnant + meta.approaching,
      categories: [
        { key: 'timeout', label: '超时任务', desc: '超240分钟或超截止期限' },
        { key: 'unaccepted', label: '未接收任务', desc: '派发超20分钟未接收' },
        { key: 'stagnant', label: '进度停滞', desc: '处置中超120分钟无进展' },
        { key: 'approaching', label: '临近截止', desc: '距截止不足60分钟' }
      ]
    },
    groups: grouped,
    todaySupervisionRecords: (db.supervisionRecords || [])
      .filter(s => s.createdAt >= todayStart)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50)
  }, '任务督办分组加载成功');
};

const createSupervision = (req, res) => {
  const { taskIds, eventId, urgency = 'normal', content, channels } = req.body;
  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return fail(res, 400, '至少指定一个需要督办的任务ID');
  }

  const tasks = taskIds.map(id => db.tasks.find(t => t.id === id)).filter(Boolean);
  if (tasks.length === 0) return fail(res, 404, '指定的任务不存在');

  const now = new Date().toISOString();
  const operator = req.user?.id || 'system';
  const operatorName = req.user?.name || '指挥中心';
  const event = eventId
    ? db.emergencyEvents.find(e => e.id === eventId)
    : (tasks.length > 0 ? db.emergencyEvents.find(e => e.id === tasks[0].eventId) : null);

  const results = [];
  tasks.forEach(task => {
    const { category, reasons } = classifyTask(task);
    const reasonText = (reasons && reasons.length > 0) ? reasons.join('，') : (category || '需要督办');
    const supervisionContent = content || ('【' + operatorName + '督办】任务[' + task.title + '] ' + reasonText + '，请立即反馈进展');

    const supervision = {
      id: 'SUP-' + generateId(),
      taskId: task.id,
      eventId: task.eventId,
      eventTitle: event ? event.title : null,
      eventLevel: event ? event.level : null,
      category: category || 'manual',
      urgency,
      department: task.department,
      assignee: task.assignee,
      content: supervisionContent,
      reasons,
      channels: channels || ['app', 'sms'],
      createdBy: operator,
      createdByName: operatorName,
      createdAt: now
    };
    db.supervisionRecords.push(supervision);

    const notifChannels = channels || ['app', 'sms'];
    const recipients = [
      { type: 'department', id: task.department },
      { type: 'user', id: task.assignee }
    ].filter(r => r.id);
    const notification = {
      id: 'NTF-' + generateId(),
      eventId: task.eventId,
      taskId: task.id,
      supervisionId: supervision.id,
      type: 'supervision',
      recipients,
      title: '【' + (urgency === 'critical' ? '紧急' : urgency === 'high' ? '重要' : '') + '督办】' + task.title,
      content: supervisionContent,
      channels: notifChannels,
      sentAt: now,
      readCount: 0,
      totalCount: 10,
      status: 'sent',
      urgency
    };
    db.notifications.push(notification);

    const timelineItem = {
      id: generateId(),
      timestamp: now,
      actor: operator,
      action: 'task_supervised',
      description: '[' + operatorName + '] 向[' + (task.department || '') + ']督办：' + supervisionContent.slice(0, 40),
      data: { taskId: task.id, supervisionId: supervision.id, category, reasons, urgency }
    };
    db.eventTimelines[task.eventId] = db.eventTimelines[task.eventId] || [];
    db.eventTimelines[task.eventId].push(timelineItem);

    results.push({ taskId: task.id, supervisionId: supervision.id, notificationId: notification.id, category, reasons });
  });

  markDirty();
  return success(res, {
    supervisedCount: tasks.length,
    results,
    summary: '成功对' + tasks.length + '个任务发出督办，已同步生成通知并写入事件时间线'
  }, '督办指令已下发');
};

module.exports = { getCommandContext, executeAction, reportProgress, getDeepPackage, getDutyDashboard, getSupervisionGroups, createSupervision };
