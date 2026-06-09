const { db, generateId } = require('../data/database');
const { success, notFound, paginate } = require('../utils/response');

const listNotifications = (req, res) => {
  const { eventId, type, status, page = 1, pageSize = 20 } = req.query;
  let list = [...db.notifications];
  if (eventId) list = list.filter(n => n.eventId === eventId);
  if (type) list = list.filter(n => n.type === type);
  if (status) list = list.filter(n => n.status === status);
  list.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getNotification = (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id);
  if (!n) return notFound(res, '通知不存在');
  return success(res, { notification: n });
};

const sendNotification = (req, res) => {
  const { eventId, type, title, content, recipients, channels } = req.body;
  const notification = {
    id: generateId(),
    eventId: eventId || null,
    type: type || 'general',
    recipients: recipients || [],
    title,
    content,
    channels: channels || ['app', 'sms'],
    sentAt: new Date().toISOString(),
    readCount: 0,
    totalCount: (recipients || []).length * 10,
    status: 'sending'
  };
  db.notifications.push(notification);

  if (eventId) {
    db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
    db.eventTimelines[eventId].push({
      id: generateId(),
      timestamp: notification.sentAt,
      actor: req.user?.id || 'system',
      action: 'notification_sent',
      description: `发送通知: ${title}`,
      data: { notificationId: notification.id, type, channels: notification.channels }
    });
  }

  setTimeout(() => {
    notification.status = 'sent';
    notification.readCount = Math.floor(notification.totalCount * (0.3 + Math.random() * 0.5));
  }, 2000);

  return success(res, { notification }, '通知已发送');
};

const notifyDepartmentsForEvent = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.eventId);
  if (!event) return notFound(res, '事件不存在');

  const deptMap = {
    fire: ['消防支队', '急救中心'],
    gas: ['消防支队', '燃气公司', '街道办'],
    traffic: ['交警支队', '急救中心'],
    structural: ['消防支队', '急救中心', '住建局'],
    chemical: ['消防支队', '环保局', '急救中心'],
    medical: ['卫健委', '急救中心', '疾控中心'],
    flood: ['水务局', '消防支队', '街道办'],
    public_order: ['公安局', '街道办']
  };

  const departments = deptMap[event.type] || deptMap.fire;
  const recipients = departments.map(d => ({ type: 'department', id: d }));

  const results = departments.map(deptId => {
    const dept = db.departments.find(d => d.id === deptId);
    const n = {
      id: generateId(),
      eventId: event.id,
      type: 'event_alert',
      recipients: [{ type: 'department', id: deptId }],
      title: `【应急响应】${event.level}级事件通知 - ${event.title}`,
      content: `事件编号: ${event.id}\n类型: ${event.type}\n等级: ${event.level}\n地点: ${event.address || '待补充'}\n时间: ${event.createdAt}\n请${dept?.name || deptId}立即响应并做好处置准备。`,
      channels: ['app', 'sms', 'email'],
      sentAt: new Date().toISOString(),
      readCount: dept?.onDutyStaff ? Math.floor(dept.onDutyStaff * 0.5) : 3,
      totalCount: dept?.onDutyStaff || 10,
      status: 'sent'
    };
    db.notifications.push(n);
    return { department: deptId, notified: true, notificationId: n.id };
  });

  event.departmentIds = Array.from(new Set([...(event.departmentIds || []), ...departments]));
  event.updatedAt = new Date().toISOString();

  db.eventTimelines[event.id] = db.eventTimelines[event.id] || [];
  db.eventTimelines[event.id].push({
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor: 'system',
    action: 'departments_notified',
    description: `已通知 ${results.length} 个部门: ${departments.join('、')}`,
    data: { departments, results }
  });

  return success(res, { eventId: event.id, notifiedCount: results.length, results, recipients });
};

const markRead = (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id);
  if (!n) return notFound(res, '通知不存在');
  n.readCount = Math.min(n.readCount + 1, n.totalCount);
  return success(res, { notification: n });
};

const notificationTypes = (req, res) => {
  const types = [
    { code: 'event_alert', name: '事件告警', defaultChannels: ['sms', 'app', 'email'] },
    { code: 'task_assignment', name: '任务派发', defaultChannels: ['app', 'sms'] },
    { code: 'task_update', name: '任务进展', defaultChannels: ['app'] },
    { code: 'evacuation_notice', name: '疏散通知', defaultChannels: ['sms', 'broadcast', 'app'] },
    { code: 'resource_request', name: '资源调配', defaultChannels: ['app', 'email'] },
    { code: 'general', name: '一般通知', defaultChannels: ['app'] }
  ];
  const channels = [
    { code: 'app', name: 'App推送' },
    { code: 'sms', name: '短信' },
    { code: 'email', name: '邮件' },
    { code: 'voice', name: '语音呼叫' },
    { code: 'broadcast', name: '广播系统' },
    { code: 'wechat', name: '微信' }
  ];
  return success(res, { types, channels, departments: db.departments });
};

module.exports = { listNotifications, getNotification, sendNotification, notifyDepartmentsForEvent, markRead, notificationTypes };
