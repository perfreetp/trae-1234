const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const generateId = () => uuidv4().replace(/-/g, '').substring(0, 16);

const createEventId = () => {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `EVT-${dateStr}-${rand}`;
};

const createTaskId = () => `TASK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const db = {
  users: [
    {
      id: 'admin001',
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      name: '系统管理员',
      role: 'ADMIN',
      department: '应急管理局',
      phone: '13800000001',
      createdAt: new Date().toISOString(),
      permissions: ['*']
    },
    {
      id: 'commander001',
      username: 'commander',
      password: bcrypt.hashSync('cmd123', 10),
      name: '张指挥',
      role: 'COMMANDER',
      department: '指挥中心',
      phone: '13800000002',
      createdAt: new Date().toISOString(),
      permissions: ['event:*', 'task:*', 'resource:*', 'plan:*', 'notification:*', 'statistics:view']
    },
    {
      id: 'street001',
      username: 'street',
      password: bcrypt.hashSync('street123', 10),
      name: '李值班',
      role: 'STREET',
      department: '和平街道办',
      phone: '13800000003',
      createdAt: new Date().toISOString(),
      permissions: ['event:view', 'event:create', 'task:view', 'notification:view', 'place:view']
    },
    {
      id: 'patrol001',
      username: 'patrol',
      password: bcrypt.hashSync('patrol123', 10),
      name: '王巡查',
      role: 'PATROL',
      department: '巡查一组',
      phone: '13800000004',
      createdAt: new Date().toISOString(),
      permissions: ['event:create', 'task:view', 'task:update', 'place:view', 'sensor:view']
    }
  ],

  cityObjects: [
    { id: 'BLD001', name: '国贸大厦', type: 'building', address: '中心路1号', location: { lat: 39.9042, lng: 116.4074 }, floors: 58, area: 120000, capacity: 8000, status: 'normal', description: '甲级写字楼', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'BLD002', name: '人民医院', type: 'hospital', address: '健康路88号', location: { lat: 39.9142, lng: 116.4174 }, floors: 22, area: 85000, beds: 1500, status: 'normal', description: '三级甲等综合医院', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'BLD003', name: '中心地铁站', type: 'station', address: '地铁1号线中心站', location: { lat: 39.9002, lng: 116.4024 }, area: 25000, dailyFlow: 150000, status: 'normal', description: '换乘枢纽站', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'BLD004', name: '和平小学', type: 'school', address: '育才路15号', location: { lat: 39.9242, lng: 116.4274 }, floors: 5, area: 18000, students: 2500, status: 'normal', description: '公立小学', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'BLD005', name: '万达广场', type: 'mall', address: '商业大道66号', location: { lat: 39.9082, lng: 116.4124 }, floors: 6, area: 220000, dailyFlow: 80000, status: 'normal', description: '大型商业综合体', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'ROD001', name: '中心路', type: 'road', length: 5.2, lanes: 8, speedLimit: 60, status: 'normal', description: '城市主干道', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'ROD002', name: '环城高架', type: 'road', length: 32.5, lanes: 6, speedLimit: 80, status: 'normal', description: '城市快速路', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'BRD001', name: '人民桥', type: 'bridge', length: 820, lanes: 4, status: 'normal', description: '跨江大桥', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'TUN001', name: '中心隧道', type: 'tunnel', length: 2100, lanes: 4, status: 'normal', description: '过江隧道', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'PRK001', name: '市民公园', type: 'park', area: 150000, status: 'normal', description: '开放式公园', createdAt: '2024-01-01T00:00:00.000Z' }
  ],

  keyPlaces: [
    { id: 'KP001', name: '市政府', category: 'government', address: '市府路1号', location: { lat: 39.9142, lng: 116.4074 }, level: 'A', manager: '张主任', contact: '13900000001', description: '市政府办公区', staffCount: 1200, createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'KP002', name: '第一加油库', category: 'hazard', address: '工业路200号', location: { lat: 39.8942, lng: 116.4374 }, level: 'A', manager: '刘主管', contact: '13900000002', description: '成品油仓储', storageTons: 5000, createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'KP003', name: '天然气门站', category: 'energy', address: '能源路50号', location: { lat: 39.9242, lng: 116.3874 }, level: 'A', manager: '陈站长', contact: '13900000003', description: '城市天然气输入站', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'KP004', name: '中心变电站', category: 'energy', address: '电力路30号', location: { lat: 39.9002, lng: 116.4224 }, level: 'B', manager: '赵工', contact: '13900000004', description: '220kV变电站', createdAt: '2024-01-01T00:00:00.000Z' },
    { id: 'KP005', name: '大型会展中心', category: 'assembly', address: '会展路1号', location: { lat: 39.8902, lng: 116.4124 }, level: 'B', manager: '孙经理', contact: '13900000005', description: '可容纳3万人', capacity: 30000, createdAt: '2024-01-01T00:00:00.000Z' }
  ],

  sensors: [
    { id: 'S001', name: '国贸大厦烟雾传感器-1F', type: 'smoke', objectId: 'BLD001', location: { lat: 39.9042, lng: 116.4074, floor: 1 }, status: 'online', value: 0.02, threshold: 0.5, unit: '%obs/m', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S002', name: '国贸大厦温度传感器-20F', type: 'temperature', objectId: 'BLD001', location: { lat: 39.9042, lng: 116.4074, floor: 20 }, status: 'online', value: 24.5, threshold: 60, unit: '°C', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S003', name: '人民医院摄像头-大厅', type: 'camera', objectId: 'BLD002', location: { lat: 39.9142, lng: 116.4174, floor: 1 }, status: 'online', value: 'recording', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S004', name: '加油库可燃气体传感器', type: 'gas', objectId: 'KP002', location: { lat: 39.8942, lng: 116.4374 }, status: 'online', value: 0.08, threshold: 0.25, unit: '%LEL', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S005', name: '中心路交通流量传感器-东', type: 'traffic', objectId: 'ROD001', location: { lat: 39.9042, lng: 116.4024 }, status: 'online', value: 1250, unit: '辆/小时', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S006', name: '人民桥应力传感器', type: 'structure', objectId: 'BRD001', location: { lat: 39.9082, lng: 116.4074 }, status: 'online', value: 45, threshold: 80, unit: 'MPa', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S007', name: '变电站电流传感器-A相', type: 'power', objectId: 'KP004', location: { lat: 39.9002, lng: 116.4224 }, status: 'warning', value: 1850, threshold: 2000, unit: 'A', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S008', name: '天然气门站压力传感器', type: 'pressure', objectId: 'KP003', location: { lat: 39.9242, lng: 116.3874 }, status: 'online', value: 1.8, threshold: 3.0, unit: 'MPa', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S009', name: '万达广场人流计数器', type: 'crowd', objectId: 'BLD005', location: { lat: 39.9082, lng: 116.4124 }, status: 'online', value: 12500, threshold: 30000, unit: '人', lastUpdate: '2024-06-10T08:30:00.000Z' },
    { id: 'S010', name: '中心隧道水位传感器', type: 'water', objectId: 'TUN001', location: { lat: 39.9022, lng: 116.4054 }, status: 'online', value: 5, threshold: 50, unit: 'cm', lastUpdate: '2024-06-10T08:30:00.000Z' }
  ],

  emergencyEvents: [
    {
      id: 'EVT-20240610-000001',
      type: 'fire',
      level: 'II',
      title: '国贸大厦12层火灾报警',
      description: '国贸大厦12层西侧办公室触发烟雾报警器，疑似电器火灾',
      location: { lat: 39.9042, lng: 116.4074 },
      address: '中心路1号国贸大厦12层',
      objectId: 'BLD001',
      reporter: { type: 'sensor', id: 'S001', name: '烟雾传感器' },
      status: 'handling',
      currentPhase: '处置中',
      impactRadius: 500,
      affectedPeople: 1500,
      createdAt: '2024-06-10T08:25:00.000Z',
      updatedAt: '2024-06-10T08:30:00.000Z',
      closedAt: null,
      createdBy: 'system',
      commanderId: 'commander001',
      departmentIds: ['消防支队', '急救中心', '交警支队', '和平街道办'],
      tags: ['火灾', '高层建筑', '人员密集']
    }
  ],

  eventTimelines: {
    'EVT-20240610-000001': [
      { id: 'TL001', timestamp: '2024-06-10T08:25:00.000Z', actor: 'system', action: 'event_created', description: '系统收到烟雾传感器报警，自动创建事件', data: { sensorId: 'S001', value: 0.68 } },
      { id: 'TL002', timestamp: '2024-06-10T08:26:30.000Z', actor: 'commander001', action: 'event_verified', description: '指挥中心确认火情属实，升级为II级事件', data: { originalLevel: 'III', newLevel: 'II' } },
      { id: 'TL003', timestamp: '2024-06-10T08:27:00.000Z', actor: 'system', action: 'plan_matched', description: '系统自动匹配《高层建筑火灾应急预案》', data: { planId: 'PLN-FIRE-001', matchScore: 0.95 } },
      { id: 'TL004', timestamp: '2024-06-10T08:28:00.000Z', actor: 'commander001', action: 'task_dispatched', description: '向消防支队派发灭火任务', data: { taskId: 'TASK-1', department: '消防支队' } },
      { id: 'TL005', timestamp: '2024-06-10T08:28:30.000Z', actor: 'commander001', action: 'task_dispatched', description: '向急救中心派发医疗救援任务', data: { taskId: 'TASK-2', department: '急救中心' } },
      { id: 'TL006', timestamp: '2024-06-10T08:29:00.000Z', actor: 'commander001', action: 'task_dispatched', description: '向交警支队派发交通管制任务', data: { taskId: 'TASK-3', department: '交警支队' } },
      { id: 'TL007', timestamp: '2024-06-10T08:30:00.000Z', actor: '消防支队', action: 'task_accepted', description: '消防支队已接收任务，派出5车25人', data: { taskId: 'TASK-1', resources: { vehicles: 5, personnel: 25 } } }
    ]
  },

  heatmapData: {
    lastUpdate: '2024-06-10T08:30:00.000Z',
    grids: [
      { gridId: 'G0101', lat: 39.9042, lng: 116.4074, peopleCount: 8500, vehicleCount: 1250, level: 'high' },
      { gridId: 'G0102', lat: 39.9082, lng: 116.4124, peopleCount: 12500, vehicleCount: 890, level: 'high' },
      { gridId: 'G0103', lat: 39.9142, lng: 116.4174, peopleCount: 4200, vehicleCount: 650, level: 'medium' },
      { gridId: 'G0201', lat: 39.8942, lng: 116.4374, peopleCount: 850, vehicleCount: 320, level: 'low' },
      { gridId: 'G0202', lat: 39.9242, lng: 116.3874, peopleCount: 1500, vehicleCount: 410, level: 'medium' },
      { gridId: 'G0203', lat: 39.9242, lng: 116.4274, peopleCount: 3200, vehicleCount: 180, level: 'medium' },
      { gridId: 'G0301', lat: 39.9002, lng: 116.4024, peopleCount: 15000, vehicleCount: 2400, level: 'high' },
      { gridId: 'G0302', lat: 39.9002, lng: 116.4224, peopleCount: 2200, vehicleCount: 580, level: 'medium' },
      { gridId: 'G0303', lat: 39.8902, lng: 116.4124, peopleCount: 5800, vehicleCount: 720, level: 'high' }
    ]
  },

  resources: [
    { id: 'RES-FIRE-001', name: '重型水罐消防车', category: 'fire', subCategory: 'vehicle', location: { lat: 39.9062, lng: 116.4094 }, department: '消防支队', status: 'available', quantity: 8, availableQty: 5, capacity: '15吨', responseTime: 5 },
    { id: 'RES-FIRE-002', name: '举高喷射车', category: 'fire', subCategory: 'vehicle', location: { lat: 39.9062, lng: 116.4094 }, department: '消防支队', status: 'available', quantity: 3, availableQty: 2, capacity: '55米', responseTime: 8 },
    { id: 'RES-FIRE-003', name: '消防员战斗员', category: 'fire', subCategory: 'personnel', department: '消防支队', status: 'available', quantity: 180, availableQty: 120, responseTime: 3 },
    { id: 'RES-MED-001', name: '急救救护车', category: 'medical', subCategory: 'vehicle', location: { lat: 39.9142, lng: 116.4174 }, department: '急救中心', status: 'available', quantity: 15, availableQty: 9, responseTime: 6 },
    { id: 'RES-MED-002', name: '急诊医生', category: 'medical', subCategory: 'personnel', department: '急救中心', status: 'available', quantity: 60, availableQty: 35, responseTime: 3 },
    { id: 'RES-POLICE-001', name: '巡逻警车', category: 'police', subCategory: 'vehicle', location: { lat: 39.9052, lng: 116.4064 }, department: '交警支队', status: 'available', quantity: 30, availableQty: 18, responseTime: 4 },
    { id: 'RES-POLICE-002', name: '交通警察', category: 'police', subCategory: 'personnel', department: '交警支队', status: 'available', quantity: 250, availableQty: 160, responseTime: 2 },
    { id: 'RES-SHELTER-001', name: '市民公园避难所', category: 'shelter', subCategory: 'facility', location: { lat: 39.9102, lng: 116.4154 }, status: 'available', capacity: 20000, area: 150000 },
    { id: 'RES-SHELTER-002', name: '和平小学避难所', category: 'shelter', subCategory: 'facility', location: { lat: 39.9242, lng: 116.4274 }, status: 'available', capacity: 5000, area: 18000 },
    { id: 'RES-SUPPLY-001', name: '应急物资储备库', category: 'supply', subCategory: 'warehouse', location: { lat: 39.8892, lng: 116.4054 }, status: 'available', items: ['帐篷:5000', '食品:100000份', '饮用水:200000瓶', '毛毯:8000条'], responseTime: 45 }
  ],

  plans: [
    {
      id: 'PLN-FIRE-001',
      name: '高层建筑火灾应急预案',
      type: 'fire',
      applicableLevels: ['I', 'II', 'III'],
      applicableScenarios: ['高层建筑', '商业楼宇', '写字楼'],
      triggerConditions: { buildingType: '高层建筑', minLevel: 'III' },
      steps: [
        { order: 1, action: '确认火情与人员被困情况', department: '指挥中心', duration: 3 },
        { order: 2, action: '派遣消防力量赶赴现场', department: '消防支队', duration: 5 },
        { order: 3, action: '通知120急救中心待命', department: '急救中心', duration: 2 },
        { order: 4, action: '实施周边交通管制', department: '交警支队', duration: 3 },
        { order: 5, action: '组织楼内人员疏散', department: '消防支队/街道办', duration: 10 },
        { order: 6, action: '启动邻近避难场所', department: '街道办', duration: 5 },
        { order: 7, action: '火灾扑灭后清理现场', department: '消防支队', duration: 30 }
      ],
      requiredResources: ['RES-FIRE-001', 'RES-FIRE-002', 'RES-FIRE-003', 'RES-MED-001'],
      evacuationRoutes: ['R001', 'R002', 'R003'],
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'PLN-GAS-001',
      name: '燃气泄漏应急预案',
      type: 'gas',
      applicableLevels: ['I', 'II', 'III'],
      applicableScenarios: ['燃气管道', '储气设施'],
      steps: [
        { order: 1, action: '立即关闭上游阀门切断气源', department: '燃气公司', duration: 5 },
        { order: 2, action: '疏散周边500米范围内人员', department: '街道办/派出所', duration: 15 },
        { order: 3, action: '设置警戒线禁止明火', department: '消防支队', duration: 10 },
        { order: 4, action: '检测空气中可燃气体浓度', department: '消防支队', duration: 3 },
        { order: 5, action: '组织抢修队进行管道维修', department: '燃气公司', duration: 60 }
      ],
      requiredResources: ['RES-FIRE-001', 'RES-POLICE-001', 'RES-POLICE-002'],
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'PLN-TRAFFIC-001',
      name: '重大交通事故应急预案',
      type: 'traffic',
      applicableLevels: ['II', 'III', 'IV'],
      applicableScenarios: ['主干道', '高架路', '桥梁隧道'],
      steps: [
        { order: 1, action: '现场救援救治伤员', department: '急救中心', duration: 5 },
        { order: 2, action: '保护事故现场固定证据', department: '交警支队', duration: 10 },
        { order: 3, action: '疏导交通实施分流', department: '交警支队', duration: 8 },
        { order: 4, action: '清障车辆拖移事故车', department: '交警支队', duration: 20 }
      ],
      requiredResources: ['RES-MED-001', 'RES-MED-002', 'RES-POLICE-001', 'RES-POLICE-002'],
      createdAt: '2024-01-01T00:00:00.000Z'
    }
  ],

  evacuationRoutes: [
    { id: 'R001', name: '国贸大厦-市民公园疏散路线', startPoint: { lat: 39.9042, lng: 116.4074 }, endPoint: { lat: 39.9102, lng: 116.4154 }, distance: 1200, walkTime: 15, capacity: 8000, waypoints: [{ lat: 39.9052, lng: 116.4094 }, { lat: 39.9072, lng: 116.4124 }], status: 'open' },
    { id: 'R002', name: '国贸大厦-和平小学疏散路线', startPoint: { lat: 39.9042, lng: 116.4074 }, endPoint: { lat: 39.9242, lng: 116.4274 }, distance: 2800, walkTime: 35, capacity: 3000, waypoints: [{ lat: 39.9102, lng: 116.4124 }, { lat: 39.9182, lng: 116.4204 }], status: 'open' },
    { id: 'R003', name: '国贸大厦-中心广场疏散路线', startPoint: { lat: 39.9042, lng: 116.4074 }, endPoint: { lat: 39.9002, lng: 116.4024 }, distance: 650, walkTime: 8, capacity: 12000, waypoints: [], status: 'open' },
    { id: 'R004', name: '加油库-东北工业区疏散路线', startPoint: { lat: 39.8942, lng: 116.4374 }, endPoint: { lat: 39.9102, lng: 116.4624 }, distance: 3500, walkTime: 45, capacity: 2000, waypoints: [], status: 'open' }
  ],

  tasks: [
    { id: 'TASK-1', eventId: 'EVT-20240610-000001', title: '国贸大厦火灾灭火救援', type: 'firefighting', department: '消防支队', assignee: '陈队长', priority: 'urgent', status: 'in_progress', location: { lat: 39.9042, lng: 116.4074 }, description: '调派5辆消防车、25名消防员赶赴现场，扑灭明火并搜救被困人员', resourceIds: ['RES-FIRE-001', 'RES-FIRE-002', 'RES-FIRE-003'], deadline: '2024-06-10T10:00:00.000Z', createdAt: '2024-06-10T08:28:00.000Z', acceptedAt: '2024-06-10T08:30:00.000Z', progress: 25, progressUpdates: [{ time: '2024-06-10T08:30:00.000Z', status: '已出动', description: '5车25人出发，预计8分钟到达' }, { time: '2024-06-10T08:38:00.000Z', status: '到达现场', description: '抵达国贸大厦，正在展开救援，已疏散100余人' }] },
    { id: 'TASK-2', eventId: 'EVT-20240610-000001', title: '火灾伤员医疗救援', type: 'medical', department: '急救中心', assignee: '李医生', priority: 'urgent', status: 'dispatched', location: { lat: 39.9042, lng: 116.4074 }, description: '调派3辆救护车、6名医护人员现场待命，及时转运伤员', resourceIds: ['RES-MED-001', 'RES-MED-002'], deadline: '2024-06-10T10:00:00.000Z', createdAt: '2024-06-10T08:28:30.000Z', progress: 0, progressUpdates: [] },
    { id: 'TASK-3', eventId: 'EVT-20240610-000001', title: '中心路交通管制', type: 'traffic_control', department: '交警支队', assignee: '刘警官', priority: 'high', status: 'in_progress', location: { lat: 39.9042, lng: 116.4074 }, description: '对中心路东起西三段实施临时交通管制，确保救援通道畅通', resourceIds: ['RES-POLICE-001', 'RES-POLICE-002'], deadline: '2024-06-10T12:00:00.000Z', createdAt: '2024-06-10T08:29:00.000Z', acceptedAt: '2024-06-10T08:31:00.000Z', progress: 60, progressUpdates: [{ time: '2024-06-10T08:31:00.000Z', status: '管制中', description: '已设置8个交通管制点，车辆正在分流绕行' }] }
  ],

  notifications: [
    { id: 'NTF001', eventId: 'EVT-20240610-000001', type: 'event_alert', recipients: [{ type: 'department', id: '消防支队' }, { type: 'department', id: '急救中心' }, { type: 'department', id: '交警支队' }, { type: 'user', id: 'commander001' }], title: '【紧急】国贸大厦发生火灾', content: '国贸大厦12层发生火灾，等级II级，请相关部门立即响应。', channels: ['sms', 'app', 'email'], sentAt: '2024-06-10T08:26:00.000Z', readCount: 15, totalCount: 50, status: 'sent' },
    { id: 'NTF002', eventId: 'EVT-20240610-000001', type: 'task_assignment', recipients: [{ type: 'department', id: '消防支队' }], title: '【任务】灭火救援任务派发', content: '已向您派发TASK-1灭火救援任务，请立即接收执行。', channels: ['app', 'sms'], sentAt: '2024-06-10T08:28:00.000Z', readCount: 8, totalCount: 12, status: 'sent' },
    { id: 'NTF003', eventId: 'EVT-20240610-000001', type: 'evacuation_notice', recipients: [{ type: 'area', name: '国贸大厦及周边500米范围' }], title: '【疏散通知】请立即疏散', content: '附近发生火灾，请相关区域人员按照指引有序疏散至安全区域。', channels: ['sms', 'broadcast'], sentAt: '2024-06-10T08:32:00.000Z', readCount: 2000, totalCount: 5000, status: 'sending' }
  ],

  departments: [
    { id: '消防支队', name: '市消防救援支队', type: 'emergency', contact: '119', dutyLeader: '张支队长', phone: '13700000001', email: 'fire@city.gov.cn', onDutyStaff: 45 },
    { id: '急救中心', name: '市急救中心', type: 'medical', contact: '120', dutyLeader: '李主任', phone: '13700000002', email: 'ems@city.gov.cn', onDutyStaff: 30 },
    { id: '交警支队', name: '市交通警察支队', type: 'police', contact: '122', dutyLeader: '王支队长', phone: '13700000003', email: 'traffic@city.gov.cn', onDutyStaff: 80 },
    { id: '和平街道办', name: '和平街道办事处', type: 'street', contact: '010-12345678', dutyLeader: '赵主任', phone: '13700000004', email: 'heping@city.gov.cn', onDutyStaff: 12 },
    { id: '燃气公司', name: '市燃气集团', type: 'utility', contact: '96777', dutyLeader: '孙总', phone: '13700000005', email: 'gas@city.com', onDutyStaff: 20 },
    { id: '应急管理局', name: '市应急管理局', type: 'gov', contact: '010-87654321', dutyLeader: '周局长', phone: '13700000006', email: 'yjgl@city.gov.cn', onDutyStaff: 15 }
  ],

  statistics: {
    totalEvents: 156,
    eventsThisMonth: 23,
    eventsToday: 1,
    openEvents: 3,
    eventsByType: { fire: 42, traffic: 68, gas: 8, medical: 21, other: 17 },
    eventsByLevel: { I: 2, II: 12, III: 58, IV: 84 },
    averageResponseTime: 4.2,
    averageResolutionTime: 42.5,
    resolutionRate: 0.96,
    resourcesUtilization: { fire: 0.52, medical: 0.45, police: 0.48 }
  }
};

module.exports = {
  db,
  generateId,
  createEventId,
  createTaskId
};
