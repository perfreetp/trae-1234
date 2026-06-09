const { db } = require('../data/database');
const { success, notFound, calculateDistance, isWithinRadius } = require('../utils/response');

const listRoutes = (req, res) => {
  const { status } = req.query;
  let list = [...db.evacuationRoutes];
  if (status) list = list.filter(r => r.status === status);
  return success(res, { routes: list, total: list.length });
};

const getRoute = (req, res) => {
  const route = db.evacuationRoutes.find(r => r.id === req.params.id);
  if (!route) return notFound(res, '疏散路线不存在');
  return success(res, { route });
};

const getSuggestions = (req, res) => {
  const { eventId, lat, lng, maxCount = 5 } = req.query;
  let start = null;

  if (eventId) {
    const event = db.emergencyEvents.find(e => e.id === eventId);
    if (event) start = event.location;
  } else if (lat && lng) {
    start = { lat: parseFloat(lat), lng: parseFloat(lng) };
  }
  if (!start) return success(res, { suggestions: [], shelters: [] });

  const suggestions = db.evacuationRoutes
    .map(r => ({
      ...r,
      distanceFromStart: calculateDistance(r.startPoint, start),
      routeDistance: r.distance,
      efficiency: r.capacity / Math.max(r.walkTime, 1)
    }))
    .sort((a, b) => a.distanceFromStart - b.distanceFromStart || b.efficiency - a.efficiency)
    .slice(0, parseInt(maxCount));

  const shelters = db.resources
    .filter(r => r.category === 'shelter')
    .map(r => ({
      ...r,
      distance: calculateDistance(r.location, start)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  const assemblyPoints = suggestions.map(r => {
    const sp = r.endPoint;
    const shelter = shelters.find(s => calculateDistance(s.location, sp) < 800);
    return {
      routeId: r.id,
      routeName: r.name,
      startPoint: r.startPoint,
      endPoint: sp,
      shelter: shelter ? { id: shelter.id, name: shelter.name, capacity: shelter.capacity } : null,
      distance: r.distance,
      walkTime: r.walkTime,
      capacity: r.capacity,
      waypoints: r.waypoints
    };
  });

  const totalCapacity = assemblyPoints.reduce((s, a) => s + a.capacity, 0);

  return success(res, {
    startPoint: start,
    totalRoutes: suggestions.length,
    totalCapacity,
    suggestions: assemblyPoints,
    shelters
  });
};

const getRoutesForEvent = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.eventId);
  if (!event) return notFound(res, '事件不存在');
  const center = event.location;
  const r = (event.impactRadius || 500) * 1.5;

  const routes = db.evacuationRoutes
    .map(route => ({
      ...route,
      startDistance: calculateDistance(route.startPoint, center),
      passesImpactArea: isWithinRadius(route.startPoint, center, r) || (route.waypoints || []).some(wp => isWithinRadius(wp, center, r))
    }))
    .filter(route => route.startDistance < r * 3)
    .sort((a, b) => a.startDistance - b.startDistance);

  const zones = [
    { name: '核心危险区', radius: event.impactRadius, color: '#ff4d4f' },
    { name: '缓冲区', radius: event.impactRadius * 1.5, color: '#faad14' },
    { name: '影响观察区', radius: event.impactRadius * 2.5, color: '#52c41a' }
  ];

  return success(res, { eventId: event.id, center, zones, routes });
};

const simulateTraffic = (req, res) => {
  const route = db.evacuationRoutes.find(r => r.id === req.params.id);
  if (!route) return notFound(res, '疏散路线不存在');
  const { peopleCount = 1000 } = req.body || {};
  const peoplePerMinute = Math.min(route.capacity / route.walkTime * 2, 200);
  const totalMinutes = Math.ceil(peopleCount / peoplePerMinute);
  const bottleneck = peopleCount > route.capacity * 0.8;
  return success(res, {
    routeId: route.id,
    routeCapacity: route.capacity,
    inputPeople: peopleCount,
    peoplePerMinute,
    estimatedMinutes: totalMinutes,
    estimatedHours: (totalMinutes / 60).toFixed(1),
    hasBottleneck: bottleneck,
    suggestions: bottleneck ? ['建议启用备用疏散路线', '增派引导人员', '启用邻近避难所'] : ['路线运力充足', '按计划进行疏散']
  });
};

module.exports = { listRoutes, getRoute, getSuggestions, getRoutesForEvent, simulateTraffic };
