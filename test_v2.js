const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3001;

const ACCOUNTS = {
  admin: { username: 'admin', password: 'admin123' },
  commander: { username: 'commander', password: 'cmd123' },
  street: { username: 'street', password: 'street123' },
  patrol: { username: 'patrol', password: 'patrol123' }
};
const tokens = {};
let testEventId = null;
let testTaskId = null;
let results = [];
let reportBefore = null;

function logResult(test, ok, detail = '') {
  const status = ok ? '✅ PASS' : '❌ FAIL';
  results.push({ test, ok, detail });
  console.log('  ' + status + '  ' + test + (detail ? ' - ' + detail : ''));
}

function request(method, path, data = null, token = null) {
  return new Promise((resolve) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      host: HOST, port: PORT, method, path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body || '')
      }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

async function loginAll() {
  console.log('\n=== 0. 登录4种账号 ===');
  for (const [k, acc] of Object.entries(ACCOUNTS)) {
    const r = await request('POST', '/api/auth/login', acc);
    if (r.status === 200 && r.data?.data?.token) {
      tokens[k] = r.data.data.token;
      console.log('  ✅ ' + k + ' 登录成功');
    } else {
      console.log('  ❌ ' + k + ' 登录失败: ' + r.status);
    }
  }
}

// ========== 需求1：巡查端权限收紧 ==========
async function testPatrolPermissions() {
  console.log('\n=== 1. 巡查端(PATROL)权限边界收紧验证 ===');

  console.log('\n  -- 1.1 巡查端无权访问的接口 (应返回403) --');

  const forbiddenAPIs = [
    { name: '事件列表 GET /api/events', path: '/api/events', method: 'GET' },
    { name: '深度协同包 GET /api/command/deep-package/:id', path: '/api/command/deep-package/EVT-FAKE', method: 'GET' },
    { name: '账号列表 GET /api/auth/users', path: '/api/auth/users', method: 'GET' },
    { name: '派发任务 POST /api/tasks', path: '/api/tasks', method: 'POST',
      body: { eventId: 'EVT-FAKE', title: 'x', department: '消防', type: 'firefighting' } },
    { name: '关闭事件 POST /api/command/action (CLOSE_EVENT)', path: '/api/command/action', method: 'POST',
      body: { eventId: 'EVT-FAKE', action: 'CLOSE_EVENT' } },
    { name: '指挥上下文 GET /api/command/context/:id', path: '/api/command/context/EVT-FAKE', method: 'GET' },
    { name: '指挥大屏工作台 GET /api/command/dashboard', path: '/api/command/dashboard', method: 'GET' },
    { name: '街道台账 GET /api/command/street/ledger', path: '/api/command/street/ledger', method: 'GET' },
    { name: '统计总览 GET /api/statistics/overview', path: '/api/statistics/overview', method: 'GET' },
    { name: '重点场所 GET /api/places', path: '/api/places', method: 'GET' },
    { name: '预案列表 GET /api/plans (巡查端无plan:view)', path: '/api/plans', method: 'GET' },
  ];

  for (const api of forbiddenAPIs) {
    const r = await request(api.method, api.path, api.body || null, tokens.patrol);
    logResult('[patrol] ' + api.name + ' -> 403', r.status === 403, '实际' + r.status);
  }

  console.log('\n  -- 1.2 巡查端允许访问的接口 (应返回200) --');

  const beforeR = await request('POST', '/api/events', {
    title: '巡查权限测试-火灾', type: 'fire', level: 'III',
    address: '中关村大街1号', location: { lat: 31.235, lng: 121.489 }, reporter: 'tester'
  }, tokens.street);
  testEventId = beforeR.status === 200 ? beforeR.data.data.event.id : null;
  if (!testEventId) { console.log('  ⚠️  创建事件失败'); return; }

  const taskR = await request('POST', '/api/tasks', {
    eventId: testEventId, title: '巡查权限验证任务', type: 'patrol',
    department: '巡逻组', priority: 'medium'
  }, tokens.commander);
  testTaskId = taskR.status === 200 ? taskR.data.data.task.id : null;

  const allowedAPIs = [
    { name: '任务列表 GET /api/tasks', path: '/api/tasks', method: 'GET' },
    { name: '任务详情 GET /api/tasks/:id', path: '/api/tasks/' + testTaskId, method: 'GET' },
    { name: '接收任务 POST /api/tasks/:id/accept', path: '/api/tasks/' + testTaskId + '/accept', method: 'POST' },
    { name: '回传进展 POST /api/tasks/:id/progress',
      path: '/api/tasks/' + testTaskId + '/progress', method: 'POST',
      body: { progress: 20, description: '已出发赶赴现场', status: 'in_progress' } },
    { name: '巡查端回传 POST /api/command/progress',
      path: '/api/command/progress', method: 'POST',
      body: { eventId: testEventId, taskId: testTaskId, description: '现场无人员被困', progress: 30 } }
  ];

  for (const api of allowedAPIs) {
    const r = await request(api.method, api.path, api.body || null, tokens.patrol);
    logResult('[patrol] ' + api.name + ' -> 200', r.status === 200, '实际' + r.status);
  }
}

// ========== 需求2：指挥大屏值班态势工作台 ==========
async function testDutyDashboard() {
  console.log('\n=== 2. 指挥大屏值班态势工作台 ===');

  const r = await request('GET', '/api/command/dashboard', null, tokens.commander);
  if (r.status !== 200) {
    logResult('调用工作台接口', false, '状态' + r.status);
    return;
  }
  const data = r.data.data;
  logResult('接口调用成功', true);

  const metaOK = !!data._meta && Array.isArray(data._meta.sections);
  logResult('_meta 元数据 & 分区列表', metaOK, metaOK ? (data._meta.sections.length + '个分区: ' + data._meta.sections.join(',')) : '缺失');

  const overviewOK = !!data.overview && typeof data.overview.openEvents === 'number';
  logResult('overview 态势总览', overviewOK, overviewOK
    ? ('未关闭=' + data.overview.openEvents + ' 高等级=' + data.overview.highLevelEvents
      + ' 超时任务=' + data.overview.timeoutTasks + ' 待通知=' + data.overview.pendingNotify)
    : '缺失');

  const hleOK = Array.isArray(data.highLevelEvents);
  logResult('highLevelEvents 高等级事件', hleOK, hleOK ? (data.highLevelEvents.length + '条') : '缺失');

  const ttOK = Array.isArray(data.timeoutTasks);
  logResult('timeoutTasks 超时任务', ttOK, ttOK ? (data.timeoutTasks.length + '条') : '缺失');

  const pndOK = Array.isArray(data.pendingNotifyDepts);
  logResult('pendingNotifyDepts 待通知部门', pndOK, pndOK ? (data.pendingNotifyDepts.length + '条') : '缺失');

  const rtpOK = Array.isArray(data.resourceTightPoints);
  logResult('resourceTightPoints 资源紧张点', rtpOK, rtpOK ? (data.resourceTightPoints.length + '条') : '缺失');

  const rtOK = Array.isArray(data.recentTimeline);
  logResult('recentTimeline 关键时间线', rtOK, rtOK ? (data.recentTimeline.length + '条') : '缺失');

  const filterOK = !!data.filterOptions && Array.isArray(data.filterOptions.levels);
  logResult('filterOptions 过滤选项', filterOK, filterOK ? ('等级' + data.filterOptions.levels.join(',')) : '缺失');

  console.log('\n  -- 2.2 过滤功能验证 --');
  const r2 = await request('GET', '/api/command/dashboard?level=III', null, tokens.commander);
  const fltOK = r2.status === 200 && r2.data.data._meta.filter.level === 'III';
  logResult('按事件等级(III)过滤', fltOK, fltOK ? ('过滤后=' + r2.data.data.overview.openEvents + '条') : '失败');

  const r3 = await request('GET', '/api/command/dashboard?street=' + encodeURIComponent('中关村街道办'), null, tokens.commander);
  logResult('按街道过滤', r3.status === 200, '状态' + r3.status);
}

// ========== 需求3：街道台账 ==========
async function testStreetLedger() {
  console.log('\n=== 3. 街道值班端事件台账 ===');

  console.log('\n  -- 3.1 街道端无权访问的接口 --');
  const forbid1 = await request('GET', '/api/command/deep-package/' + testEventId, null, tokens.street);
  logResult('[street] 深度协同包 -> 403', forbid1.status === 403, '实际' + forbid1.status);

  const forbid2 = await request('GET', '/api/auth/users', null, tokens.street);
  logResult('[street] 账号列表 -> 403', forbid2.status === 403, '实际' + forbid2.status);

  console.log('\n  -- 3.2 街道台账接口 --');
  const r = await request('GET', '/api/command/street/ledger', null, tokens.street);
  if (r.status !== 200) {
    logResult('调用街道台账', false, '状态' + r.status);
  } else {
    const d = r.data.data;
    const summaryOK = !!d.summary;
    logResult('街道台账加载成功 & 汇总数据', summaryOK,
      summaryOK ? ('街道=' + d.street + ' 共' + d.total + '条(开=' + d.summary.open + ')') : '失败');

    const myEvents = Array.isArray(d.list) && d.list.every(e => e.relationType === '上报' || e.relationType === '参与');
    logResult('仅返回本街道上报/参与的事件', myEvents, d.list ? ('共' + d.list.length + '条，全部标注关系类型') : '失败');
  }

  console.log('\n  -- 3.3 本街道任务 --');
  const r2 = await request('GET', '/api/command/street/tasks', null, tokens.street);
  const tasksOK = r2.status === 200 && Array.isArray(r2.data.data.list);
  logResult('本街道任务列表加载', tasksOK, r2.status === 200 ? ('共' + (r2.data.data.total || 0) + '条') : '状态' + r2.status);

  console.log('\n  -- 3.4 补充现场情况 & 追加时间线 --');
  const r3 = await request('POST', '/api/command/street/events/' + testEventId + '/supplement', {
    sceneDescription: '现场有2辆小轿车追尾，无人员伤亡，轻微财产损失',
    casualties: { dead: 0, injured: 0, trapped: 0 },
    roadCondition: '最外侧车道受阻，已摆放警示标志',
    onSiteCommander: '张主任 13800138000',
    additionalNotes: '预计1小时内完成清理'
  }, tokens.street);
  const suppOK = r3.status === 200 && !!r3.data.data.supplement;
  logResult('补充现场情况成功', suppOK, suppOK
    ? ('已同步时间线，补充人=' + r3.data.data.supplement.street)
    : ('状态' + r3.status + ' ' + (r3.data?.message || '')));

  const tlR = await request('GET', '/api/events/' + testEventId + '/timeline', null, tokens.street);
  const hasSuppTl = tlR.status === 200 && Array.isArray(tlR.data.data.timeline)
    && tlR.data.data.timeline.some(t => t.action === 'scene_supplemented');
  logResult('时间线包含补充记录', hasSuppTl, hasSuppTl ? ('共' + tlR.data.data.timeline.length + '条时间线') : '未找到补充记录');
}

// ========== 需求4：处置日报 ==========
async function testDailyReport() {
  console.log('\n=== 4. 处置日报接口 (与真实处置联动) ===');

  const r1 = await request('GET', '/api/statistics/daily-report', null, tokens.commander);
  if (r1.status !== 200) {
    logResult('调用日报接口', false, '状态' + r1.status);
    return;
  }
  reportBefore = r1.data.data;
  logResult('日报加载成功', true,
    ('日期=' + reportBefore.date
      + ' 新增=' + reportBefore.events.newCount
      + ' 关闭=' + reportBefore.events.closedCount
      + ' 完成任务=' + reportBefore.tasks.completedCount
      + ' 处置率=' + reportBefore.performance.resolutionRate + '%'));

  const rngR = await request('GET', '/api/statistics/report-range?startDate='
    + require('moment')().subtract(3, 'days').format('YYYY-MM-DD'), null, tokens.commander);
  const rangeOK = rngR.status === 200 && Array.isArray(rngR.data.data.daily) && !!rngR.data.data.summary;
  logResult('区间统计 report-range 加载', rangeOK, rangeOK
    ? ('共' + rngR.data.data.days + '天，累计新增' + rngR.data.data.summary.totalNewEvents + '件')
    : '失败');

  console.log('\n  -- 4.2 日报联动：新增事件后日报变化 --');
  const evBefore = reportBefore.events.newCount;

  const addR = await request('POST', '/api/events', {
    title: '日报联动测试-交通事故', type: 'traffic', level: 'IV',
    address: '海淀大街200号', location: { lat: 31.23, lng: 121.48 }, reporter: '街道值班'
  }, tokens.street);
  if (addR.status !== 200) { logResult('街道端新增事件', false); return; }
  const newEventId = addR.data.data.event.id;

  await new Promise(x => setTimeout(x, 500));
  const r2 = await request('GET', '/api/statistics/daily-report', null, tokens.commander);
  const newCountUp = r2.data.data.events.newCount > evBefore;
  logResult('新增事件 -> 日报新增数+1', newCountUp,
    (evBefore + '→' + r2.data.data.events.newCount));

  console.log('\n  -- 4.3 日报联动：派发+完成任务后任务统计变化 --');
  const tskBefore = r2.data.data.tasks.completedCount;
  const tskR = await request('POST', '/api/tasks', {
    eventId: newEventId, title: '日报联动-事故处理', type: 'traffic_control',
    department: '交警支队', priority: 'medium'
  }, tokens.commander);
  if (tskR.status === 200) {
    const tid = tskR.data.data.task.id;
    await request('POST', '/api/tasks/' + tid + '/accept', null, tokens.street);
    await request('POST', '/api/tasks/' + tid + '/progress',
      { progress: 100, status: 'completed', description: '事故现场清理完毕，交通已恢复' }, tokens.street);
  }

  await new Promise(x => setTimeout(x, 500));
  const r3 = await request('GET', '/api/statistics/daily-report', null, tokens.commander);
  const tskUp = r3.data.data.tasks.completedCount > tskBefore;
  logResult('完成任务 -> 日报任务完成数+1', tskUp,
    (tskBefore + '→' + r3.data.data.tasks.completedCount));

  console.log('\n  -- 4.4 日报联动：关闭事件后处置率变化 --');
  const rateBefore = r3.data.data.performance.resolutionRate;
  const closeR = await request('POST', '/api/command/action', { eventId: newEventId, action: 'CLOSE_EVENT' }, tokens.commander);
  if (closeR.status !== 200) { logResult('指挥端关闭事件', false); return; }

  await new Promise(x => setTimeout(x, 500));
  const r4 = await request('GET', '/api/statistics/daily-report', null, tokens.commander);
  const closeUp = r4.data.data.events.closedCount > reportBefore.events.closedCount;
  const rateUp = r4.data.data.performance.resolutionRate >= rateBefore;
  logResult('关闭事件 -> 关闭数+1 & 处置率上升', closeUp && rateUp,
    ('关闭数=' + reportBefore.events.closedCount + '→' + r4.data.data.events.closedCount
      + ' 处置率=' + rateBefore + '%→' + r4.data.data.performance.resolutionRate + '%'));

  console.log('\n  最终日报快照:');
  console.log('    ↳ 日期: ' + r4.data.data.date + '  生成时间: ' + r4.data.data.generatedAt);
  console.log('    ↳ 事件: 新增=' + r4.data.data.events.newCount + ' 关闭=' + r4.data.data.events.closedCount + ' 处理中=' + r4.data.data.events.handlingOpen);
  console.log('    ↳ 任务: 新建=' + r4.data.data.tasks.createdCount + ' 完成=' + r4.data.data.tasks.completedCount + ' 完成率=' + r4.data.data.tasks.completionRate + '%');
  console.log('    ↳ 性能: 平均处置耗时=' + r4.data.data.performance.avgResolutionMinutes + '分钟  处置率=' + r4.data.data.performance.resolutionRate + '%');
  console.log('    ↳ 亮点: ' + r4.data.data.highlights.join(' | '));
}

function summary() {
  const pass = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n' + '='.repeat(70));
  console.log('  🎯 第二阶段4项能力验证总览: ' + pass + '/' + total + ' 通过');
  console.log('='.repeat(70));
  if (pass < total) {
    console.log('  失败项:');
    results.filter(r => !r.ok).forEach(r => console.log('    ❌ ' + r.test + (r.detail ? ' - ' + r.detail : '')));
  } else {
    console.log('  全部通过 ✨ 三端工作台能力 + 巡查权限收紧 + 日报联动 全部生效！');
  }
  console.log();
}

async function main() {
  await loginAll();
  if (Object.keys(tokens).length < 4) { console.log('登录失败，退出'); process.exit(1); }

  await testPatrolPermissions();
  await testDutyDashboard();
  await testStreetLedger();
  await testDailyReport();

  summary();
}

main().catch(e => console.error('运行错误:', e));
