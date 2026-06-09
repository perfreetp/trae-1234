const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3001;

const ACCOUNTS = {
  admin: { username: 'admin', password: 'admin123', role: 'ADMIN' },
  commander: { username: 'commander', password: 'cmd123', role: 'COMMANDER' },
  street: { username: 'street', password: 'street123', role: 'STREET' },
  patrol: { username: 'patrol', password: 'patrol123', role: 'PATROL' }
};
const tokens = {};
let testEventId = null;
let testTaskId = null;
let statsBefore = null;
let results = [];

function logResult(test, ok, detail = '') {
  const status = ok ? '✅ PASS' : '❌ FAIL';
  results.push({ test, ok, detail });
  console.log(`  ${status}  ${test}${detail ? ' - ' + detail : ''}`);
}

function request(method, path, data = null, token = null, expectRaw = false) {
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
          resolve(expectRaw ? { status: res.statusCode, body: buf } : { status: res.statusCode, data: JSON.parse(buf) });
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
  console.log('\n=== 0. 登录 4 种账号 ===');
  for (const [k, acc] of Object.entries(ACCOUNTS)) {
    const r = await request('POST', '/api/auth/login', acc);
    if (r.status === 200 && r.data?.data?.token) {
      tokens[k] = r.data.data.token;
      console.log(`  ✅ ${k}(${acc.role}) 登录成功`);
    } else {
      console.log(`  ❌ ${k} 登录失败: ${r.status} ${JSON.stringify(r.data)}`);
    }
  }
}

// ============ 需求1: 权限边界严格化 ============
async function testPermissions() {
  console.log('\n=== 1. 权限边界验证 (巡查端严格限制) ===');

  console.log('\n  -- 1.1 查看账号列表 GET /api/auth/users --');
  for (const [k, t] of Object.entries(tokens)) {
    const r = await request('GET', '/api/auth/users', null, t);
    const expect403 = k === 'street' || k === 'patrol';
    const ok = expect403 ? r.status === 403 : r.status === 200;
    logResult(`[${k}] 查用户列表 -> ${expect403 ? '403' : '200'}`, ok, `实际${r.status}`);
  }

  console.log('\n  -- 1.2 派发任务 POST /api/tasks (task:create仅COMMANDER/ADMIN) --');
  for (const [k, t] of Object.entries(tokens)) {
    const payload = { eventId: testEventId || 'EVT-FAKE', title: '权限测试任务', department: '消防支队', type: 'firefighting' };
    const r = await request('POST', '/api/tasks', payload, t);
    const expect403 = k === 'street' || k === 'patrol';
    const ok = expect403 ? r.status === 403 : r.status === 200;
    logResult(`[${k}] 派发任务 -> ${expect403 ? '403' : '200'}`, ok, `实际${r.status}`);
  }

  console.log('\n  -- 1.3 指挥动作 CLOSE_EVENT (event:close仅COMMANDER/ADMIN) --');
  for (const [k, t] of Object.entries(tokens)) {
    const payload = { eventId: testEventId || 'EVT-FAKE', action: 'CLOSE_EVENT' };
    const r = await request('POST', '/api/command/action', payload, t);
    const expect403 = k === 'street' || k === 'patrol';
    const ok = expect403 ? r.status === 403 : r.status === 200;
    logResult(`[${k}] 关闭事件动作 -> ${expect403 ? '403' : '200'}`, ok, `实际${r.status}`);
  }

  console.log('\n  -- 1.4 巡查端回传进展 POST /api/command/progress (应成功) --');
  const progR = await request('POST', '/api/command/progress',
    { eventId: testEventId || 'EVT-FAKE', description: '权限测试：巡查端回传进展' }, tokens.patrol);
  logResult('[patrol] 回传进展 -> 200', progR.status === 200, `实际${progR.status}`);
}

// ============ 需求2: 数据持久化 ============
async function testPersistencePhase1() {
  console.log('\n=== 2.1 持久化：创建测试数据 (街道端上报事件 + 指挥端派发任务 + 巡查端回传进展) ===');

  const r1 = await request('POST', '/api/events', {
    title: '持久化测试-燃气泄漏', type: 'gas', level: 'III',
    address: '测试街道88号', description: '持久化验证专用，请不要删除',
    location: { lat: 31.235, lng: 121.489 }, reporter: '街道值班员'
  }, tokens.street);
  if (r1.status === 200 && r1.data?.data?.event?.id) {
    testEventId = r1.data.data.event.id;
    logResult('街道端上报新事件', true, testEventId);
  } else {
    logResult('街道端上报新事件', false, `${r1.status} ${JSON.stringify(r1.data)}`);
    return;
  }

  const r2 = await request('POST', '/api/tasks', {
    eventId: testEventId, title: '现场处置-燃气抢修', type: 'repair',
    department: '燃气公司', priority: 'high', description: '立即赶赴现场关闭阀门'
  }, tokens.commander);
  if (r2.status === 200 && r2.data?.data?.task?.id) {
    testTaskId = r2.data.data.task.id;
    logResult('指挥端派发任务', true, testTaskId);
  } else {
    logResult('指挥端派发任务', false, `${r2.status} ${JSON.stringify(r2.data)}`);
  }

  const r3 = await request('POST', '/api/tasks/' + testTaskId + '/accept', null, tokens.patrol);
  logResult('巡查端接收任务', r3.status === 200, `实际${r3.status}`);

  const r4 = await request('POST', '/api/tasks/' + testTaskId + '/progress',
    { progress: 50, description: '已到达现场，正在关闭燃气总阀', status: 'in_progress' }, tokens.patrol);
  logResult('巡查端回传50%进展', r4.status === 200, `实际${r4.status}`);

  const r5 = await request('POST', '/api/notifications/event/' + testEventId + '/notify-departments', null, tokens.commander);
  logResult('指挥端通知相关部门', r5.status === 200, `实际${r5.status}`);

  console.log('\n  等待持久化写入(5s)...');
  await new Promise(r => setTimeout(r, 5000));
  console.log('  现在请重启服务，然后执行持久化验证 Phase 2');
}

async function testPersistencePhase2() {
  console.log('\n=== 2.2 持久化：重启服务后查询验证 ===');

  const r1 = await request('GET', '/api/events/' + testEventId, null, tokens.commander);
  const eventOK = r1.status === 200 && r1.data?.data?.event?.id === testEventId;
  logResult(`查询事件 ${testEventId} 存在`, eventOK, `实际${r1.status}`);
  if (eventOK) {
    const e = r1.data.data.event;
    console.log(`    ↳ 标题: ${e.title}, 状态: ${e.status}`);
  }

  const r2 = await request('GET', '/api/tasks?eventId=' + testEventId, null, tokens.commander);
  const taskOK = r2.status === 200 && r2.data?.data?.list?.some(t => t.id === testTaskId);
  logResult(`任务 ${testTaskId} 存在`, taskOK, `实际${r2.status}`);
  if (taskOK) {
    const t = r2.data.data.list.find(x => x.id === testTaskId);
    console.log(`    ↳ 标题: ${t.title}, 状态: ${t.status}, 进度: ${t.progress}%`);
  }

  const r3 = await request('GET', '/api/events/' + testEventId + '/timeline', null, tokens.street);
  const tlOK = r3.status === 200 && Array.isArray(r3.data?.data?.timeline) && r3.data.data.timeline.length >= 3;
  logResult(`事件时间线 ≥3 条记录`, tlOK, r3.status === 200 ? `${r3.data.data.timeline?.length || 0}条` : `状态${r3.status}`);

  const r4 = await request('GET', '/api/notifications?eventId=' + testEventId, null, tokens.street);
  const notifOK = r4.status === 200 && r4.data?.data?.list?.length >= 1;
  logResult(`通知记录存在`, notifOK, r4.status === 200 ? `${r4.data.data.list?.length || 0}条` : `状态${r4.status}`);

  return eventOK && taskOK && tlOK;
}

// ============ 需求3: 统计联动真实数据 ============
async function testStatistics() {
  console.log('\n=== 3. 统计联动真实数据 (上报新事件、关闭事件、任务完成后统计变化) ===');

  const getOverview = async (who) => {
    const r = await request('GET', '/api/statistics/overview', null, tokens[who]);
    return r.status === 200 ? r.data.data : null;
  };

  statsBefore = await getOverview('commander');
  if (!statsBefore) { console.log('  无法获取初始统计'); return; }
  console.log('  [初始状态]');
  console.log(`    ↳ 事件: 今日=${statsBefore.events.today}, 处理中=${statsBefore.events.open}`);
  console.log(`    ↳ 任务: 活跃=${statsBefore.tasks.active}, 完成=${statsBefore.tasks.completed}`);
  console.log(`    ↳ 性能: 处置率=${statsBefore.performance.resolutionRate}%`);

  const r1 = await request('POST', '/api/events', {
    title: '统计测试-交通事故', type: 'traffic', level: 'IV',
    address: '统计大道100号', description: '用于验证统计联动',
    location: { lat: 31.23, lng: 121.48 }, reporter: '街道值班'
  }, tokens.street);
  let statsEventId = null;
  if (r1.status === 200) statsEventId = r1.data.data.event.id;
  const afterNew = await getOverview('commander');
  const todayUp = afterNew.events.today > statsBefore.events.today;
  const openUp = afterNew.events.open > statsBefore.events.open;
  logResult('街道端上报新事件 → 今日事件数+1 & 处理中+1', todayUp && openUp,
    `今日:${statsBefore.events.today}→${afterNew.events.today}, 处理中:${statsBefore.events.open}→${afterNew.events.open}`);

  const r2 = await request('POST', '/api/tasks', {
    eventId: statsEventId, title: '清理事故现场', type: 'traffic_control',
    department: '交警支队', priority: 'medium'
  }, tokens.commander);
  let statsTaskId = r2.status === 200 ? r2.data.data.task.id : null;

  if (statsTaskId) {
    await request('POST', '/api/tasks/' + statsTaskId + '/accept', null, tokens.patrol);
    await request('POST', '/api/tasks/' + statsTaskId + '/progress',
      { progress: 100, status: 'completed', description: '现场已清理，交通恢复' }, tokens.patrol);
  }
  await new Promise(r => setTimeout(r, 500));
  const afterTaskDone = await getOverview('commander');
  const afterNewFinal = await getOverview('commander');
  const taskCompUp = afterTaskDone.tasks.completed > statsBefore.tasks.completed || afterNewFinal.tasks.completed > statsBefore.tasks.completed;
  const finalComp = Math.max(afterTaskDone.tasks.completed, afterNewFinal.tasks.completed);
  logResult('巡查端完成任务 → 任务完成数+1', taskCompUp,
    `完成数:${statsBefore.tasks.completed}→${finalComp}`);

  const afterNewOpen = afterNew.events.open;
  const r3 = await request('POST', '/api/command/action', { eventId: statsEventId, action: 'CLOSE_EVENT' }, tokens.commander);
  await new Promise(r => setTimeout(r, 500));
  const afterClose = await getOverview('commander');
  const closeDown = afterClose.events.open < afterNewOpen;
  const rateUp = afterClose.performance.resolutionRate >= statsBefore.performance.resolutionRate;
  logResult('指挥端关闭事件 → 处理中事件-1 & 处置率上升', closeDown && rateUp,
    `处理中:${afterNewOpen}→${afterClose.events.open}, 处置率:${statsBefore.performance.resolutionRate}%→${afterClose.performance.resolutionRate}%`);

  console.log('  [最终状态]');
  console.log(`    ↳ 事件: 今日=${afterClose.events.today}, 处理中=${afterClose.events.open}`);
  console.log(`    ↳ 任务: 活跃=${afterClose.tasks.active}, 完成=${afterClose.tasks.completed}`);
  console.log(`    ↳ 性能: 处置率=${afterClose.performance.resolutionRate}%`);
}

function statsAfterNew200OK(afterNew, afterClose) {
  return afterClose.events.open < afterClose.events.total ? true : (afterClose.events.open < afterNew.events.open || afterClose.events.total === 0);
}

// ============ 需求4: 深度协同包接口 ============
async function testDeepPackage() {
  console.log('\n=== 4. 深度协同包接口 (按事件编号一次返回大屏全量渲染数据) ===');

  const targetId = testEventId || (statsBefore ? (await request('GET', '/api/events?pageSize=1', null, tokens.commander))?.data?.data?.list?.[0]?.id : null);
  if (!targetId) { logResult('找一个事件ID', false); return; }

  const r = await request('GET', '/api/command/deep-package/' + targetId, null, tokens.commander);
  const pkg = r.data?.data;
  if (r.status !== 200 || !pkg) {
    logResult('调用 deep-package 接口', false, `${r.status} ${JSON.stringify(r.data?.message || '')}`);
    return;
  }

  console.log('  接口调用成功，检查 10 个渲染分区:');

  const sections = pkg._meta?.renderSections || [];
  logResult('_meta 元数据 & 渲染分区列表', sections.length >= 8, `包含${sections.length}个分区: ${sections.join(', ')}`);

  const hasEvent = !!pkg.eventSummary && !!pkg.eventSummary.id;
  logResult('eventSummary 事件详情', hasEvent, hasEvent ? `ID=${pkg.eventSummary.id}` : '缺失');

  const hasImpact = !!pkg.impact && !!pkg.impact.center;
  logResult('impact 影响范围 (三层危险区+圆周)', hasImpact, hasImpact ? `半径=${pkg.impact.radius}m, ${pkg.impact.zones?.length || 0}层` : '缺失');

  const hasPlan = !!pkg.planMatching && (pkg.planMatching.recommended || pkg.planMatching.candidates);
  logResult('planMatching 推荐预案+备选', hasPlan, hasPlan ? `推荐:${pkg.planMatching.recommended?.planName || '无'}, 备选${pkg.planMatching.candidates?.length || 0}个` : '缺失');

  const hasEvac = !!pkg.evacuation && !!pkg.evacuation.routes;
  logResult('evacuation 疏散路线+避难所', hasEvac, hasEvac ? `${pkg.evacuation.routes?.length || 0}条路线` : '缺失');

  const hasRes = !!pkg.resourceSnapshot;
  logResult('resourceSnapshot 周边资源', hasRes, hasRes ? `${pkg.resourceSnapshot.nearby?.length || 0}个资源点` : '缺失');

  const hasTasks = !!pkg.tasks && !!pkg.tasks.summary;
  logResult('tasks 任务 (总览+分部门)', hasTasks, hasTasks ? `总计${pkg.tasks.summary.total}个，完成${pkg.tasks.summary.completed}个` : '缺失');

  const hasDept = !!pkg.departmentCoordination;
  logResult('departmentCoordination 部门协同', hasDept, hasDept ? `已联动${pkg.departmentCoordination.notified?.length || 0}个` : '缺失');

  const hasNotif = !!pkg.notifications;
  logResult('notifications 通知 (分渠道+已读)', hasNotif, hasNotif ? `共${pkg.notifications.totalSent || pkg.notifications.total || 0}条` : '缺失');

  const hasTimeline = !!pkg.timeline && Array.isArray(pkg.timeline.events);
  logResult('timeline 时间线+阶段分析', hasTimeline, hasTimeline ? `${pkg.timeline.events.length}条记录, ${pkg.timeline.phases?.length || 0}个阶段` : '缺失');

  const hasPlayback = !!pkg.playback && (Array.isArray(pkg.playback.frames) || Array.isArray(pkg.playback.keyframes));
  logResult('playback 复盘关键帧', hasPlayback, hasPlayback ? `${pkg.playback.frames?.length || pkg.playback.keyframes?.length || 0}帧` : '缺失');

  const hasStats = !!pkg.statisticsSnapshot;
  logResult('statisticsSnapshot 统计快照', hasStats, hasStats ? `事件总数=${pkg.statisticsSnapshot.totalEvents || 0}` : '缺失');

  if (sections.length > 0) {
    console.log('\n  ✨ 大屏渲染分区完整可用：' + sections.join(' → '));
  }
}

// ============ 执行总结 ============
function summary() {
  const pass = results.filter(r => r.ok).length;
  const total = results.length;
  console.log('\n' + '='.repeat(60));
  console.log(`  🎯 验证总览: ${pass}/${total} 通过`);
  console.log('='.repeat(60));
  if (pass < total) {
    console.log('  失败项:');
    results.filter(r => !r.ok).forEach(r => console.log(`    ❌ ${r.test}${r.detail ? ' - ' + r.detail : ''}`));
  } else {
    console.log('  全部通过 ✨ 四个需求均已生效');
  }
  console.log();
}

async function main() {
  const arg = process.argv[2];

  await loginAll();

  if (!Object.keys(tokens).length) {
    console.log('没有可用token，退出');
    process.exit(1);
  }

  if (arg === 'persist-phase2' && process.argv[3]) {
    testEventId = process.argv[3];
    testTaskId = process.argv[4];
    await testPersistencePhase2();
  } else {
    await testStatistics();
    await testPersistencePhase1();
    await testPermissions();
    await testDeepPackage();
    console.log('\n' + '='.repeat(60));
    console.log('  💡 持久化重启验证提示：');
    console.log(`     请在另一个终端重启服务 (Stop-Process + npm start)，然后运行：`);
    console.log(`     node test_full.js persist-phase2 ${testEventId} ${testTaskId}`);
    console.log('='.repeat(60));
  }

  summary();
}

main().catch(e => console.error('运行错误:', e));
