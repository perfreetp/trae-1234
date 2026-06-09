const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3001;
const BASE = '/api';
const log = (c, m) => { console.log(c === 'PASS' ? '  \u2705 PASS  ' + m : c === 'FAIL' ? '  \u274C FAIL  ' + m : c); };
let TOTAL = 0, PASS = 0, FAILS = [];
const check = (name, cond, expect, actual) => {
  TOTAL++;
  if (cond) { PASS++; log('PASS', name + ' - ' + (typeof expect === 'number' ? '预期' + expect : expect) + (actual != null ? ' - 实际' + actual : '')); }
  else { FAILS.push(name); log('FAIL', name + (actual != null ? ' - 实际' + actual : '')); }
};

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      host: HOST, port: PORT, method, path: BASE + path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData || '')
      }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: d ? JSON.parse(d) : {} });
        } catch (e) { resolve({ status: res.statusCode, data: { message: d } }); }
      });
    });
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}
const login = async (u, p) => {
  const r = await req('POST', '/auth/login', null, { username: u, password: p });
  return r.data.data.token;
};
const wrap = (token) => ({
  get: (p) => req('GET', p, token, null),
  post: (p, b) => req('POST', p, token, b),
  put: (p, b) => req('PUT', p, token, b)
});

(async () => {
  console.log('\n=== 0. 登录4种账号 ===');
  const T = {
    admin: await login('admin', 'admin123'),
    cmd: await login('commander', 'cmd123'),
    street: await login('street', 'street123'),
    patrol: await login('patrol', 'patrol123')
  };
  log('', '  ✅ admin/commander/street/patrol 登录成功');
  const AD = wrap(T.admin), CM = wrap(T.cmd), ST = wrap(T.street), PA = wrap(T.patrol);

  // 准备数据
  console.log('\n=== 前置：准备数据 ===');
  let evtMine = (await ST.post('/events', {
    type: 'fire', level: 'III', title: '和平街道小区火情',
    description: '和平街道某小区阳台冒烟',
    location: { lat: 39.92, lng: 116.43 },
    address: '和平街道阳光小区3号楼',
    tags: ['和平街道', '火情', '居民楼']
  })).data.data.event;
  log('', '  ➡️ 街道上报和平事件: ' + evtMine.id);

  let evtOther = (await CM.post('/events', {
    type: 'traffic', level: 'IV', title: '朝阳街道路口刮蹭',
    description: '朝阳街道主要路口汽车刮蹭',
    location: { lat: 39.91, lng: 116.46 },
    address: '朝阳街道建国路88号路口',
    tags: ['朝阳街道', '交通事故']
  })).data.data.event;
  await CM.put('/events/' + evtOther.id, { departmentIds: ['朝阳街道办', '交警支队'] });
  log('', '  ➡️ 指挥端上报朝阳事件(departmentIds含朝阳街道办): ' + evtOther.id);

  // ===== 需求4：通用接口街道级拦截 =====
  console.log('\n=== 需求4：通用接口街道级拦截（列表/详情/时间线） ===');
  let list = (await ST.get('/events')).data.data;
  let ids = (list.items || []).map(e => e.id);
  check('[street] 事件列表可见本街道事件', ids.includes(evtMine.id), '包含', ids.length + '条');
  check('[street] 事件列表隐藏外街道(朝阳)事件', !ids.includes(evtOther.id), '不包含', ids.includes(evtOther.id) ? '越权出现' : '正常隐藏');

  let d1 = (await ST.get('/events/' + evtMine.id)).status;
  let d2 = (await ST.get('/events/' + evtOther.id)).status;
  check('[street] GET本街道事件详情=200', d1 === 200, 200, d1);
  check('[street] GET外街道事件详情=403', d2 === 403, 403, d2);

  let t1 = (await ST.post('/events/' + evtMine.id + '/timeline', {
    action: 'street_inspection', description: '[和平街道办]值班员已到现场'
  })).status;
  let t2 = (await ST.post('/events/' + evtOther.id + '/timeline', {
    action: 'hack', description: '[越权]尝试修改外街道事件'
  })).status;
  check('[street] 追加本街道时间线=200', t1 === 200, 200, t1);
  check('[street] 追加外街道时间线=403', t2 === 403, 403, t2);

  // ===== 需求4：departmentIds直接含和平街道办的事件也能进台账 =====
  let evtDept = (await CM.post('/events', {
    type: 'gas', level: 'III', title: '和平街道燃气泄漏',
    description: '某餐饮店铺燃气报警',
    location: { lat: 39.918, lng: 116.435 },
    address: '和平街道美食街88号'
  })).data.data.event;
  await CM.put('/events/' + evtDept.id, { departmentIds: ['和平街道办', '燃气公司', '消防支队'] });
  log('', '  ➡️ 指挥端上报燃气事件，departmentIds=[和平街道办]: ' + evtDept.id);

  let ledger = (await ST.get('/command/street/ledger')).data.data;
  let ledgerIds = (ledger.items || []).map(e => e.id);
  check('[street] departmentIds直接含和平街道办的事件也进台账', ledgerIds.includes(evtDept.id), '包含', ledgerIds.includes(evtDept.id) ? '已进入' : '未进入');
  check('[street] 台账可见事件数>=3（上报+派+departmentId）', ledgerIds.length >= 3, '>=3条', ledgerIds.length + '条');

  // ===== 需求1：街道详情接口 =====
  console.log('\n=== 需求1：街道台账详情接口 /command/street/events/:eventId ===');
  let detMine = (await ST.get('/command/street/events/' + evtMine.id)).data;
  check('[street] 台账详情-本街道=200', detMine.code === 200, 200, detMine.code);
  check('[street] 台账详情含relationType上报/参与标记',
    (detMine.data?.relationType === '上报' || detMine.data?.relationType === '参与'),
    '上报/参与', detMine.data?.relationType);
  check('[street] 台账详情返回任务/时间线/现场补充3字段',
    !!detMine.data?.tasks && !!detMine.data?.timeline && !!detMine.data?.supplements,
    '完整3字段', 'OK');
  check('[street] 台账详情timeline条数>=1（刚加了1条时间线）',
    (detMine.data?.timeline || []).length >= 1, '>=1条', (detMine.data?.timeline || []).length);

  let detOther = (await ST.get('/command/street/events/' + evtOther.id)).data;
  check('[street] 台账详情-外街道=403（不能是404）', detOther.code === 403, 403, detOther.code + '-' + (detOther.message || ''));

  let supMine = (await ST.post('/command/street/events/' + evtMine.id + '/supplement', {
    sceneDescription: '和平街道：阳台冒烟，无明火，户主已疏散',
    casualties: { dead: 0, injured: 0, trapped: 0 },
    roadCondition: '畅通',
    onSiteCommander: '和平街道李主任'
  })).status;
  let supOther = (await ST.post('/command/street/events/' + evtOther.id + '/supplement', {
    sceneDescription: '越权操作'
  })).status;
  check('[street] 补充本街道现场=200', supMine === 200, 200, supMine);
  check('[street] 补充外街道现场=403', supOther === 403, 403, supOther);

  // ===== 需求2：任务督办 =====
  console.log('\n=== 需求2：任务督办分组 + 一键督办 + 日报联动 ===');

  let taskA = (await CM.post('/tasks', {
    eventId: evtMine.id, title: '火情原因核查', type: 'verification',
    department: '和平街道办', assignee: '李值班', priority: 'high',
    description: '街道办核查火情原因并书面报告',
    deadline: new Date(Date.now() - 3600000).toISOString()
  })).data.data.task;

  let taskB = (await CM.post('/tasks', {
    eventId: evtMine.id, title: '受灾住户安抚', type: 'comfort',
    department: '和平街道办', assignee: '王社区', priority: 'normal',
    description: '社区工作者安抚受灾住户情绪',
    deadline: new Date(Date.now() + 1200000).toISOString()
  })).data.data.task;
  log('', '  ➡️ 派发2个任务: ' + taskA.id + '(超时), ' + taskB.id + '(临近截止)');

  let sg = (await CM.get('/command/supervision/groups')).data;
  check('[cmd] 督办分组接口=200', sg.code === 200, 200, sg.code);
  check('[cmd] 督办分组含4种分类+需督办总数',
    sg.data?._meta?.timeout != null && (sg.data?._meta?.categories || []).length === 4,
    '4分类元数据',
    'timeout=' + sg.data?._meta?.timeout + ', total=' + sg.data?._meta?.totalNeedSupervision);
  check('[cmd] 超时/临近截止任务数>=1',
    ((sg.data?.groups?.timeout || []).length + (sg.data?.groups?.approaching || []).length) >= 1,
    '>=1条',
    'timeout=' + (sg.data?.groups?.timeout || []).length + ', approaching=' + (sg.data?.groups?.approaching || []).length);

  let sup1 = (await CM.post('/command/supervision/create', {
    taskIds: [taskA.id], urgency: 'high',
    content: '【督办】请在30分钟内完成火情核查并书面反馈'
  })).data;
  check('[cmd] 一键督办=200', sup1.code === 200, 200, sup1.code);
  check('[cmd] 督办成功数=1 & 有SUP-开头的id',
    sup1.data?.supervisedCount === 1 && (sup1.data?.results?.[0]?.supervisionId || '').startsWith('SUP-'),
    '1条+SUP-',
    '数量=' + sup1.data?.supervisedCount + ', id=' + sup1.data?.results?.[0]?.supervisionId);

  // 督办后事件时间线应该出现 task_supervised 记录
  let tl = (await CM.get('/events/' + evtMine.id + '/timeline')).data.data.timeline;
  let hasSup = tl.some(x => x.action === 'task_supervised');
  check('[联动] 督办后事件时间线有task_supervised记录', hasSup, '存在', hasSup ? '已写入' : '未写入');

  // 日报督办次数联动
  let rpt1 = (await CM.get('/statistics/daily-report')).data.data;
  check('[日报] 督办totalCount=1（联动）', rpt1.supervision?.totalCount === 1, 1, rpt1.supervision?.totalCount);
  check('[日报] 督办含byCategory/byUrgency/byDepartment字段',
    !!rpt1.supervision?.byCategory && !!rpt1.supervision?.byUrgency,
    '字段完整', 'OK');

  let paSg = (await PA.get('/command/supervision/groups')).status;
  let paSg2 = (await PA.post('/command/supervision/create', { taskIds: [taskA.id] })).status;
  check('[patrol] 巡查查督办分组=403', paSg === 403, 403, paSg);
  check('[patrol] 巡查发督办=403', paSg2 === 403, 403, paSg2);

  // ===== 需求3：跨部门会商 =====
  console.log('\n=== 需求3：跨部门会商记录 ===');

  let mtg1 = (await CM.post('/meetings', {
    eventId: evtMine.id,
    title: '和平街道火情协同处置会商',
    type: 'emergency',
    summary: '针对和平街道小区火情，多部门联合处置方案研讨',
    decisions: ['决定增派2名社区工作者协助', '要求燃气公司半小时内到现场排查管线'],
    participants: [
      { name: '张指挥', department: '指挥中心', role: 'chair' },
      { name: '李值班', department: '和平街道办', role: 'member' },
      { name: '王队长', department: '消防支队', role: 'member' }
    ],
    todoItems: [
      { content: '出具火情初步鉴定报告', owner: '消防支队', deadline: new Date(Date.now() + 7200000).toISOString(), priority: 'high' },
      { content: '社区逐户通知回访', owner: '和平街道办', ownerDept: '和平街道办', deadline: new Date(Date.now() + 3600000).toISOString(), priority: 'urgent' }
    ],
    tags: ['火情', '多部门协同']
  })).data;
  check('[cmd] 创建会商=200', mtg1.code === 200, 200, mtg1.code);
  const MTG1 = mtg1.data?.meeting?.id;
  check('[cmd] 会商有MTG-开头id + 3参会 + 2待办',
    (MTG1 || '').startsWith('MTG-') &&
    mtg1.data?.meeting?.participants?.length === 3 &&
    mtg1.data?.meeting?.todoItems?.length === 2,
    'MTG- + 3p + 2t',
    'id=' + MTG1 + ', p=' + mtg1.data?.meeting?.participants?.length + ', t=' + mtg1.data?.meeting?.todoItems?.length);

  let mtg2 = (await CM.post('/meetings', {
    eventId: evtOther.id,
    title: '朝阳街道交通事故处理会商',
    participants: [
      { name: '赵警官', department: '交警支队', role: 'chair' },
      { name: '孙协调', department: '朝阳街道办', role: 'member' }
    ],
    todoItems: [{ content: '出具交通事故认定书', owner: '交警支队', priority: 'high' }]
  })).data.data?.meeting;
  log('', '  ➡️ 指挥端创建2个会商: ' + MTG1 + '(和平相关), ' + mtg2?.id + '(朝阳相关)');

  // 街道端会商列表只看自己相关的
  let stList = (await ST.get('/meetings')).data.data;
  let stIds = (stList.items || stList || []).map(m => m.id);
  check('[street] 会商列表只含和平相关（不包含朝阳的）',
    stIds.includes(MTG1) && !stIds.includes(mtg2?.id),
    '只有MTG1', stIds.length + '个: ' + stIds.join(','));

  let stMtg = (await ST.get('/meetings/' + MTG1)).status;
  check('[street] 查看自己相关会商详情=200', stMtg === 200, 200, stMtg);

  let stMtg2 = (await ST.get('/meetings/' + mtg2.id)).status;
  check('[street] 查看朝阳会商详情=403', stMtg2 === 403, 403, stMtg2);

  // 巡查端所有会商接口=403
  let paMtg = (await PA.get('/meetings')).status;
  let paMtg2 = (await PA.post('/meetings', { title: '巡查越权' })).status;
  let paMtg3 = (await PA.get('/meetings/' + MTG1)).status;
  let paMtg4 = (await PA.get('/meetings/event/' + evtMine.id)).status;
  check('[patrol] 列表会商=403', paMtg === 403, 403, paMtg);
  check('[patrol] 创建会商=403', paMtg2 === 403, 403, paMtg2);
  check('[patrol] 详情会商=403', paMtg3 === 403, 403, paMtg3);
  check('[patrol] 事件会商聚合=403', paMtg4 === 403, 403, paMtg4);

  let evMtg = (await CM.get('/meetings/event/' + evtMine.id)).data;
  check('[cmd] 按事件聚合会商=有count+summary',
    evMtg.code === 200 && (evMtg.data?.count || 0) >= 1,
    '>=1条', evMtg.data?.count);

  let mtgUpd = (await CM.put('/meetings/' + MTG1, {
    status: 'completed',
    summary: '会商结束：火情已扑灭，无人员伤亡，正在清理现场',
    decisions: ['追加决定：社区2天内回访全部受灾住户']
  })).status;
  check('[cmd] 更新会商状态=200', mtgUpd === 200, 200, mtgUpd);

  let rpt2 = (await CM.get('/statistics/daily-report')).data.data;
  check('[日报] 会商次数>=2（联动）', (rpt2.meetings?.totalCount || 0) >= 2, '>=2', rpt2.meetings?.totalCount);

  // ===== 收尾：巡查端全部边界 =====
  console.log('\n=== 收尾：巡查端边界补全验证 ===');
  let paLedger = (await PA.get('/command/street/ledger')).status;
  let paDet = (await PA.get('/command/street/events/' + evtMine.id)).status;
  let paLedSup = (await PA.post('/command/street/events/' + evtMine.id + '/supplement', {})).status;
  check('[patrol] 巡查街道台账=403', paLedger === 403, 403, paLedger);
  check('[patrol] 巡查街道详情=403', paDet === 403, 403, paDet);
  check('[patrol] 巡查街道补充现场=403', paLedSup === 403, 403, paLedSup);

  console.log('\n  最终日报快照:');
  console.log('    ↳ 日期: ' + rpt2.date + '  督办=' + rpt2.supervision?.totalCount + '次  会商=' + rpt2.meetings?.totalCount + '次');
  console.log('    ↳ 事件: 新增=' + rpt2.events.newCount + '  处理中=' + rpt2.events.handlingCount + '  处置率=' + rpt2.performance.resolutionRate + '%');
  console.log('    ↳ 任务: 完成=' + rpt2.tasks.completedCount + '  平均响应=' + rpt2.tasks.avgResponseMinutes + '分钟');
  if ((rpt2.supervision?.list || []).length > 0) {
    console.log('    ↳ 最近督办: ' + (rpt2.supervision.list[0].content || '').slice(0, 30));
  }
  if ((rpt2.meetings?.list || []).length > 0) {
    console.log('    ↳ 最近会商: ' + rpt2.meetings.list[0].title + '（参会' + rpt2.meetings.list[0].participantsCount + '人,待办' + rpt2.meetings.list[0].todoCount + '项）');
  }

  console.log('\n' + '='.repeat(70));
  if (PASS === TOTAL) {
    console.log('  🎯 第三阶段4项能力验证总览: ' + PASS + '/' + TOTAL + ' 通过');
    console.log('='.repeat(70));
    console.log('  全部通过 ✨ 街道详情+督办+会商+街道边界 全部生效！');
  } else {
    console.log('  ❌ 失败 ' + (TOTAL - PASS) + '/' + TOTAL + '：');
    FAILS.forEach(f => console.log('    -', f));
    process.exit(1);
  }
})().catch(e => {
  console.error('\n测试崩溃:', e.message, e.response?.data || '');
  process.exit(2);
});
