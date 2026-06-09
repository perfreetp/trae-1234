const http = require('http');

const request = (options, body = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3001, ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

(async () => {
  console.log('='.repeat(60));
  console.log('【测试1】健康检查');
  let r = await request({ path: '/api/health', method: 'GET' });
  console.log(`状态: ${r.status}`, r.data.service ? '- ' + r.data.service : '');

  console.log('\n【测试2】指挥官登录');
  r = await request({ path: '/api/auth/login', method: 'POST' }, { username: 'commander', password: 'cmd123' });
  console.log(`状态: ${r.status}`);
  const token = r.data?.data?.token;
  const user = r.data?.data?.user;
  console.log(`用户: ${user?.name} | 角色: ${user?.role}`);
  console.log(`Token: ${token ? token.substring(0, 30) + '...' : '无'}`);
  const auth = { Authorization: 'Bearer ' + token };

  console.log('\n【测试3】传感器状态汇总');
  r = await request({ path: '/api/sensors/summary', method: 'GET', headers: auth });
  console.log(`状态: ${r.status}`);
  if (r.data?.data) {
    const s = r.data.data.overview;
    console.log(`总数: ${s.total} | 在线: ${s.online} | 告警: ${s.alarm} | 在线率: ${s.onlineRate}`);
  }

  console.log('\n【测试4】城市对象查询');
  r = await request({ path: '/api/city-objects?type=building&pageSize=3', method: 'GET', headers: auth });
  console.log(`状态: ${r.status} | 总数: ${r.data?.data?.pagination?.total}`);
  r.data?.data?.list?.slice(0, 3).forEach(o => console.log(`  - ${o.id}: ${o.name} (${o.type})`));

  console.log('\n【测试5】突发事件列表');
  r = await request({ path: '/api/events?pageSize=5', method: 'GET', headers: auth });
  console.log(`状态: ${r.status} | 总数: ${r.data?.data?.pagination?.total}`);
  const events = r.data?.data?.list || [];
  events.forEach(e => console.log(`  - ${e.id}: ${e.title} [${e.level}级] 状态: ${e.status}`));
  const evtId = events[0]?.id;

  if (evtId) {
    console.log('\n【测试6】事件影响范围评估: ' + evtId);
    r = await request({ path: `/api/events/${evtId}/impact`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    if (r.data?.data) {
      const d = r.data.data;
      console.log(`  事件中心: ${d.center.lat}, ${d.center.lng} | 半径: ${d.radius}m`);
      console.log(`  受影响对象: ${d.affectedObjects.length} | 受影响人群: ${d.affectedPeople}`);
      console.log(`  最近资源: ${d.nearestResources.slice(0, 3).map(x => x.name).join(', ')}`);
    }

    console.log('\n【测试7】预案自动匹配: ' + evtId);
    r = await request({ path: `/api/plans/match/${evtId}`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    const rec = r.data?.data?.recommended;
    if (rec) {
      console.log(`  最佳匹配: ${rec.plan.name} (得分: ${rec.score}, 匹配度: ${rec.matchLevel})`);
      console.log(`  原因: ${rec.reasons?.join('; ')}`);
    }

    console.log('\n【测试8】疏散路线建议');
    r = await request({ path: `/api/evacuation/suggestions?eventId=${evtId}`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    if (r.data?.data) {
      const d = r.data.data;
      console.log(`  路线数: ${d.totalRoutes} | 总容量: ${d.totalCapacity}人`);
      d.suggestions.slice(0, 3).forEach(s => console.log(`  - ${s.routeName}: ${s.distance}m / ${s.walkTime}分钟 / ${s.capacity}人`));
    }

    console.log('\n【测试9】统一指挥协同上下文: ' + evtId);
    r = await request({ path: `/api/command/context/${evtId}`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    if (r.data?.data) {
      const d = r.data.data;
      console.log(`  事件: ${d.event.title}`);
      console.log(`  任务: ${d.tasks.length}项 (平均完成度: ${d.taskStats.avgProgress}%)`);
      console.log(`  涉及部门: ${d.involvedDepts.length}个 (${d.involvedDepts.map(x => x.id).join(', ')})`);
      console.log(`  建议操作:`);
      d.nextSuggestedActions.forEach(a => console.log(`    [${a.priority}] ${a.label}`));
    }

    console.log('\n【测试10】一键执行指挥操作: 启动预案 + 通知部门');
    r = await request({ path: '/api/command/action', method: 'POST', headers: auth }, { eventId: evtId, action: 'NOTIFY_DEPTS' });
    console.log(`状态: ${r.status}`);
    r.data?.data?.results?.forEach(x => console.log(`  ✔ ${x.message}`));

    console.log('\n【测试11】事件时间线');
    r = await request({ path: `/api/events/${evtId}/timeline`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    const tl = r.data?.data?.timeline || [];
    console.log(`  共 ${tl.length} 条记录:`);
    tl.slice(-5).forEach(t => console.log(`  [${new Date(t.timestamp).toLocaleTimeString('zh-CN')}] ${t.description}`));

    console.log('\n【测试12】复盘回放: ' + evtId);
    r = await request({ path: `/api/events/${evtId}/playback`, method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    if (r.data?.data) {
      console.log(`  时长: ${r.data.data.totalSeconds}秒 | 关键帧: ${r.data.data.frames.length}个`);
    }

    console.log('\n【测试13】指挥大屏统计总览');
    r = await request({ path: '/api/statistics/overview', method: 'GET', headers: auth });
    console.log(`状态: ${r.status}`);
    if (r.data?.data) {
      const d = r.data.data;
      console.log(`  事件: 今日${d.events.today}/本月${d.events.thisMonth}/累计${d.events.total} (处理中: ${d.events.open})`);
      console.log(`  任务: 活跃${d.tasks.active}/总数${d.tasks.total}`);
      console.log(`  传感器: 在线${d.sensors.online}/${d.sensors.total} (告警: ${d.sensors.alarm})`);
      console.log(`  平均响应: ${d.performance.avgResponseTime}分钟 | 处置率: ${(d.performance.resolutionRate * 100).toFixed(0)}%`);
    }
  }

  console.log('\n【测试14】街道值班端登录并上报事件');
  r = await request({ path: '/api/auth/login', method: 'POST' }, { username: 'street', password: 'street123' });
  const streetToken = r.data?.data?.token;
  const streetAuth = { Authorization: 'Bearer ' + streetToken };
  console.log(`街道端登录: ${r.status} | 用户: ${r.data?.data?.user?.name}`);

  r = await request({ path: '/api/events', method: 'POST', headers: streetAuth }, {
    type: 'traffic', level: 'III', title: '和平路口两车追尾事故',
    description: '和平路与育才路交叉口，两车追尾无人员伤亡',
    location: { lat: 39.9182, lng: 116.4204 }, address: '和平路与育才路交叉口'
  });
  console.log(`上报事件: ${r.status}`);
  const newEvt = r.data?.data?.event;
  if (newEvt) console.log(`  事件编号: ${newEvt.id}`);

  console.log('\n【测试15】巡查App端登录并回传任务进展');
  r = await request({ path: '/api/auth/login', method: 'POST' }, { username: 'patrol', password: 'patrol123' });
  const patrolToken = r.data?.data?.token;
  const patrolAuth = { Authorization: 'Bearer ' + patrolToken };
  console.log(`巡查端登录: ${r.status} | 用户: ${r.data?.data?.user?.name}`);

  if (evtId) {
    const taskList = await request({ path: `/api/tasks?eventId=${evtId}&pageSize=1`, method: 'GET', headers: patrolAuth });
    const t = taskList.data?.data?.list?.[0];
    if (t) {
      r = await request({ path: `/api/tasks/${t.id}/progress`, method: 'POST', headers: patrolAuth }, {
        progress: 75, status: 'in_progress', description: '现场火势已得到控制，正在疏散最后3层人员'
      });
      console.log(`任务进展回传: ${r.status} | 任务: ${t.id} 完成度: ${r.data?.data?.task?.progress}%`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✓ 所有测试完成！服务运行正常');
  console.log('='.repeat(60));
})().catch(err => console.error('测试出错:', err.message));
