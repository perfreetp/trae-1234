const { db, generateId } = require('../data/database');
const { success, fail, notFound, paginate } = require('../utils/response');
const { markDirty } = require('../utils/persist');
const { getUserStreet, isStreetRelatedToEvent, getRelatedStreetsForEvent } = require('./streetLedgerController');

const userVisibleMeetings = (user) => {
  const role = user?.role;
  const all = db.meetingRecords || [];

  if (role === 'ADMIN' || role === 'COMMANDER') {
    return all;
  }

  if (role === 'STREET') {
    const userStreet = getUserStreet(user);
    return all.filter(m => {
      if (!m) return false;
      const pList = m.participants || [];
      if (pList.some(p => (p.department || p.id || p) === userStreet)) return true;
      if (m.createdByDept === userStreet) return true;
      if (m.eventId) {
        const event = db.emergencyEvents.find(e => e.id === m.eventId);
        if (event && isStreetRelatedToEvent(event, userStreet)) return true;
      }
      const deptIds = m.departmentIds || [];
      return deptIds.includes(userStreet);
    });
  }

  return [];
};

const listMeetings = (req, res) => {
  const { eventId, type, status, keyword, page = 1, pageSize = 20 } = req.query;
  let list = userVisibleMeetings(req.user);

  if (eventId) list = list.filter(m => m.eventId === eventId);
  if (type) list = list.filter(m => m.type === type);
  if (status) list = list.filter(m => m.status === status);
  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(kw) ||
      (m.summary || '').toLowerCase().includes(kw) ||
      (m.id || '').toLowerCase().includes(kw)
    );
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const user = req.user;
  const decorated = list.map(m => {
    const isMine = req.user?.role !== 'STREET'
      || (m.createdBy === user.id)
      || (m.participants || []).some(p => (p.department || p.id || p) === getUserStreet(user));
    return {
      ...m,
      canEdit: user?.role === 'ADMIN' || user?.role === 'COMMANDER',
      visibilityScope: isMine ? 'visible' : 'hidden'
    };
  });

  const result = paginate(decorated, page, pageSize);
  return success(res, result, `会商记录加载成功（${decorated.length}条）`);
};

const getMeeting = (req, res) => {
  const { id } = req.params;
  const meeting = (db.meetingRecords || []).find(m => m.id === id);
  if (!meeting) return notFound(res, '会商记录不存在');

  const visible = userVisibleMeetings(req.user).some(m => m.id === id);
  if (!visible) {
    return fail(res, 403, '您无权查看此会商记录');
  }

  const eventDetails = meeting.eventId
    ? db.emergencyEvents.find(e => e.id === meeting.eventId)
    : null;

  return success(res, {
    meeting,
    event: eventDetails
      ? { id: eventDetails.id, title: eventDetails.title, level: eventDetails.level, status: eventDetails.status, type: eventDetails.type }
      : null,
    relatedStreets: meeting.eventId && eventDetails
      ? getRelatedStreetsForEvent(eventDetails)
      : []
  }, '会商详情加载成功');
};

const createMeeting = (req, res) => {
  const {
    eventId, title, type = 'standard', status = 'scheduled',
    scheduledAt, location, meetingLink,
    summary, decisions,
    participants, departmentIds,
    todoItems,
    attachments, tags
  } = req.body;

  if (!title) return fail(res, 400, '会商标题为必填项');
  if (eventId && !db.emergencyEvents.find(e => e.id === eventId)) {
    return fail(res, 404, '关联的事件不存在');
  }

  const event = eventId ? db.emergencyEvents.find(e => e.id === eventId) : null;
  const now = new Date().toISOString();
  const operator = req.user?.id || 'system';
  const operatorName = req.user?.name || '指挥中心';
  const operatorDept = req.user?.department || '指挥中心';

  const normalizedParticipants = (participants || []).map(p => ({
    id: p.id || generateId(),
    name: p.name,
    department: p.department || p.dept,
    role: p.role || 'attendee',
    joinedAt: p.joinedAt || now
  }));

  const normalizedTodos = (todoItems || []).map(t => ({
    id: t.id || generateId(),
    content: t.content,
    owner: t.owner,
    ownerDept: t.ownerDept,
    deadline: t.deadline || null,
    priority: t.priority || 'normal',
    status: t.status || 'pending',
    createdAt: now,
    updatedAt: now,
    createdBy: operator
  }));

  const meeting = {
    id: 'MTG-' + generateId(),
    eventId: eventId || null,
    eventTitle: event ? event.title : null,
    eventLevel: event ? event.level : null,
    title,
    type,
    status,
    scheduledAt: scheduledAt || null,
    actualStartAt: null,
    actualEndAt: null,
    location: location || null,
    meetingLink: meetingLink || null,
    summary: summary || '',
    decisions: decisions || [],
    participants: normalizedParticipants,
    departmentIds: departmentIds || (event ? (event.departmentIds || []) : []),
    todoItems: normalizedTodos,
    attachments: attachments || [],
    tags: tags || [],
    createdBy: operator,
    createdByName: operatorName,
    createdByDept: operatorDept,
    createdAt: now,
    updatedAt: now,
    closedAt: null
  };

  db.meetingRecords.push(meeting);

  if (eventId) {
    const timelineItem = {
      id: generateId(),
      timestamp: now,
      actor: operator,
      action: 'meeting_created',
      description: '[' + operatorName + '] 创建了跨部门会商：《' + title + '》，参会部门' + (normalizedParticipants.length || 0) + '个',
      data: {
        meetingId: meeting.id,
        type,
        participants: normalizedParticipants.map(p => ({ name: p.name, department: p.department, role: p.role })),
        todoCount: normalizedTodos.length
      }
    };
    db.eventTimelines[eventId] = db.eventTimelines[eventId] || [];
    db.eventTimelines[eventId].push(timelineItem);
  }

  markDirty();
  return success(res, { meeting, message: '会商创建成功，已同步写入事件时间线' }, '会商记录已创建');
};

const updateMeeting = (req, res) => {
  const { id } = req.params;
  const idx = (db.meetingRecords || []).findIndex(m => m.id === id);
  if (idx === -1) return notFound(res, '会商记录不存在');

  const old = db.meetingRecords[idx];

  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'COMMANDER') {
    return fail(res, 403, '只有指挥端可以修改会商记录');
  }

  const {
    title, type, status, scheduledAt, actualStartAt, actualEndAt,
    location, meetingLink, summary, decisions,
    participants, departmentIds, todoItems, attachments, tags
  } = req.body;

  const now = new Date().toISOString();
  const updated = { ...old, updatedAt: now };

  if (title !== undefined) updated.title = title;
  if (type !== undefined) updated.type = type;
  if (status !== undefined) {
    updated.status = status;
    if ((status === 'completed' || status === 'closed') && !updated.closedAt) {
      updated.closedAt = now;
    }
  }
  if (scheduledAt !== undefined) updated.scheduledAt = scheduledAt;
  if (actualStartAt !== undefined) updated.actualStartAt = actualStartAt;
  if (actualEndAt !== undefined) updated.actualEndAt = actualEndAt;
  if (location !== undefined) updated.location = location;
  if (meetingLink !== undefined) updated.meetingLink = meetingLink;
  if (summary !== undefined) updated.summary = summary;
  if (decisions !== undefined) updated.decisions = decisions;
  if (attachments !== undefined) updated.attachments = attachments;
  if (tags !== undefined) updated.tags = tags;
  if (departmentIds !== undefined) updated.departmentIds = departmentIds;

  if (participants !== undefined && Array.isArray(participants)) {
    const existingMap = {};
    (old.participants || []).forEach(p => { existingMap[p.id] = p; });
    updated.participants = participants.map(p => {
      if (p.id && existingMap[p.id]) {
        return { ...existingMap[p.id], ...p, updatedAt: now };
      }
      return {
        id: p.id || generateId(),
        name: p.name,
        department: p.department || p.dept,
        role: p.role || 'attendee',
        joinedAt: p.joinedAt || now,
        updatedAt: now
      };
    });
  }

  if (todoItems !== undefined && Array.isArray(todoItems)) {
    const todoMap = {};
    (old.todoItems || []).forEach(t => { todoMap[t.id] = t; });
    updated.todoItems = todoItems.map(t => {
      if (t.id && todoMap[t.id]) {
        return { ...todoMap[t.id], ...t, updatedAt: now };
      }
      return {
        id: t.id || generateId(),
        content: t.content,
        owner: t.owner,
        ownerDept: t.ownerDept,
        deadline: t.deadline || null,
        priority: t.priority || 'normal',
        status: t.status || 'pending',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user?.id || 'system'
      };
    });
  }

  db.meetingRecords[idx] = updated;

  if (old.eventId) {
    const timelineItem = {
      id: generateId(),
      timestamp: now,
      actor: req.user?.id || 'system',
      action: 'meeting_updated',
      description: '[' + (req.user?.name || '指挥中心') + '] 更新了会商《' + (updated.title || old.title) + '》',
      data: { meetingId: id, changes: Object.keys(req.body) }
    };
    db.eventTimelines[old.eventId] = db.eventTimelines[old.eventId] || [];
    db.eventTimelines[old.eventId].push(timelineItem);
  }

  markDirty();
  return success(res, { meeting: updated }, '会商记录更新成功');
};

const getMeetingForEvent = (req, res) => {
  const { eventId } = req.params;
  const event = db.emergencyEvents.find(e => e.id === eventId);
  if (!event) return notFound(res, '事件不存在');

  if (req.user?.role === 'STREET') {
    const userStreet = getUserStreet(req.user);
    if (!isStreetRelatedToEvent(event, userStreet)) {
      return fail(res, 403, '您所在的街道无权查看此事件的会商记录');
    }
  }

  const all = userVisibleMeetings(req.user);
  const meetings = all.filter(m => m.eventId === eventId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const todoSummary = {};
  meetings.forEach(m => {
    (m.todoItems || []).forEach(t => {
      const s = t.status || 'pending';
      todoSummary[s] = (todoSummary[s] || 0) + 1;
    });
  });

  return success(res, {
    eventId,
    count: meetings.length,
    todoSummary,
    meetings
  }, `事件会商记录加载成功（${meetings.length}条）`);
};

module.exports = { listMeetings, getMeeting, createMeeting, updateMeeting, getMeetingForEvent };
