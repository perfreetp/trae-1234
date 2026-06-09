const { db, createTaskId, generateId } = require('../data/database');
const { success, fail, notFound, paginate } = require('../utils/response');
const { markDirty } = require('../utils/persist');

const listTasks = (req, res) => {
  const { eventId, status, priority, department, assignee, page = 1, pageSize = 20 } = req.query;
  let list = [...db.tasks];
  if (eventId) list = list.filter(t => t.eventId === eventId);
  if (status) list = list.filter(t => t.status === status);
  if (priority) list = list.filter(t => t.priority === priority);
  if (department) list = list.filter(t => t.department === department);
  if (assignee) list = list.filter(t => t.assignee === assignee);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getTask = (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return notFound(res, '任务不存在');
  const event = db.emergencyEvents.find(e => e.id === task.eventId);
  const resources = (task.resourceIds || []).map(rid => db.resources.find(r => r.id === rid)).filter(Boolean);
  return success(res, { task, event, resources });
};

const dispatchTask = (req, res) => {
  const { eventId, title, type, department, assignee, priority, description, location, resourceIds, deadline } = req.body;
  if (!eventId || !title || !type || !department) {
    return fail(res, 400, '事件编号、任务标题、类型、执行部门为必填项');
  }
  const event = db.emergencyEvents.find(e => e.id === eventId);
  if (!event) return notFound(res, '关联事件不存在');

  const task = {
    id: createTaskId(),
    eventId,
    title,
    type,
    department,
    assignee: assignee || '',
    priority: priority || 'high',
    status: 'dispatched',
    location: location || event.location,
    description: description || '',
    resourceIds: resourceIds || [],
    deadline: deadline || null,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    completedAt: null,
    progress: 0,
    progressUpdates: []
  };
  db.tasks.push(task);

  db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
  db.eventTimelines[eventId].push({
    id: generateId(),
    timestamp: task.createdAt,
    actor: req.user?.id || 'system',
    action: 'task_dispatched',
    description: `派发任务: ${title} -> ${department}${assignee ? `(${assignee})` : ''}`,
    data: { taskId: task.id, priority: task.priority, type }
  });

  event.departmentIds = event.departmentIds || [];
  if (!event.departmentIds.includes(department)) event.departmentIds.push(department);
  event.updatedAt = new Date().toISOString();
  markDirty();
  return success(res, { task }, '任务派发成功');
};

const acceptTask = (req, res) => {
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return notFound(res, '任务不存在');
  task.status = 'in_progress';
  task.acceptedAt = new Date().toISOString();
  task.progressUpdates.push({
    time: task.acceptedAt,
    status: '已接收',
    description: `${req.user?.name || '执行人'}已接收任务，开始执行`
  });
  task.progress = Math.max(task.progress, 10);

  db.eventTimelines[task.eventId] = db.eventTimelines[task.eventId] || [];
  db.eventTimelines[task.eventId].push({
    id: generateId(),
    timestamp: task.acceptedAt,
    actor: req.user?.id || 'user',
    action: 'task_accepted',
    description: `任务 ${task.title} 已被 ${task.department} 接收`,
    data: { taskId: task.id }
  });
  markDirty();
  return success(res, { task }, '任务已接收');
};

const updateProgress = (req, res) => {
  const { progress, status, description, location, images } = req.body;
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return notFound(res, '任务不存在');

  if (typeof progress === 'number') task.progress = Math.max(0, Math.min(100, progress));
  if (status) task.status = status;

  const update = {
    time: new Date().toISOString(),
    status: status || '进展更新',
    description: description || '',
    location,
    images
  };
  task.progressUpdates.push(update);

  if (status === 'completed' || task.progress >= 100) {
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date().toISOString();
  }

  db.eventTimelines[task.eventId] = db.eventTimelines[task.eventId] || [];
  db.eventTimelines[task.eventId].push({
    id: generateId(),
    timestamp: update.time,
    actor: req.user?.id || 'user',
    action: status === 'completed' ? 'task_completed' : 'task_progress',
    description: `${task.department} [${task.title}] 进展: ${task.progress}%${description ? ' - ' + description : ''}`,
    data: { taskId: task.id, progress: task.progress, status: task.status }
  });
  markDirty();
  return success(res, { task }, '进展已更新');
};

const taskTypes = (req, res) => {
  const types = [
    { code: 'firefighting', name: '灭火救援', defaultPriority: 'urgent', departments: ['消防支队'] },
    { code: 'medical', name: '医疗救援', defaultPriority: 'urgent', departments: ['急救中心'] },
    { code: 'traffic_control', name: '交通管制', defaultPriority: 'high', departments: ['交警支队'] },
    { code: 'evacuation', name: '人员疏散', defaultPriority: 'high', departments: ['街道办', '消防支队'] },
    { code: 'rescue', name: '搜救被困', defaultPriority: 'urgent', departments: ['消防支队', '救援队'] },
    { code: 'patrol', name: '现场巡查', defaultPriority: 'medium', departments: ['巡逻组'] },
    { code: 'logistics', name: '物资调运', defaultPriority: 'medium', departments: ['物资保障'] },
    { code: 'repair', name: '设施抢修', defaultPriority: 'high', departments: ['燃气公司', '电力公司'] }
  ];
  const priorities = [
    { code: 'urgent', name: '紧急', color: '#ff4d4f' },
    { code: 'high', name: '高', color: '#fa8c16' },
    { code: 'medium', name: '中', color: '#1890ff' },
    { code: 'low', name: '低', color: '#52c41a' }
  ];
  const statuses = [
    { code: 'dispatched', name: '已派发', color: '#9254de' },
    { code: 'in_progress', name: '执行中', color: '#1890ff' },
    { code: 'paused', name: '暂停', color: '#faad14' },
    { code: 'completed', name: '已完成', color: '#52c41a' },
    { code: 'cancelled', name: '已取消', color: '#8c8c8c' }
  ];
  return success(res, { types, priorities, statuses });
};

module.exports = { listTasks, getTask, dispatchTask, acceptTask, updateProgress, taskTypes };
