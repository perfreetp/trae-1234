const { db } = require('../data/database');
const { success, fail, isWithinRadius, calculateDistance } = require('../utils/response');

const getHeatmap = (req, res) => {
  const { lat, lng, radius, zoom = 'city' } = req.query;
  let grids = [...db.heatmapData.grids];
  if (lat && lng && radius) {
    const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
    grids = grids.filter(g => isWithinRadius({ lat: g.lat, lng: g.lng }, center, parseFloat(radius)));
  }
  return success(res, { lastUpdate: db.heatmapData.lastUpdate, zoom, grids });
};

const getHeatmapAroundEvent = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.eventId);
  if (!event) return success(res, { grids: [] });
  const center = event.location;
  const r = (event.impactRadius || 500) * 2;
  const grids = db.heatmapData.grids.filter(g => isWithinRadius({ lat: g.lat, lng: g.lng }, center, r));
  return success(res, { eventId: event.id, center, radius: r, grids });
};

const aggregateLocations = (req, res) => {
  const { types, lat, lng, radius = 3000, groupBy = 'type' } = req.query;
  if (!lat || !lng) return fail(res, 400, '请指定中心点经纬度');
  const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
  const r = parseFloat(radius);
  const filterTypes = types ? types.split(',') : null;

  const result = { center, radius: r, total: 0, byCategory: {}, items: [] };

  db.cityObjects.forEach(o => {
    if (!o.location) return;
    if (filterTypes && !filterTypes.includes(o.type)) return;
    const d = calculateDistance(o.location, center);
    if (d <= r) {
      result.items.push({ type: 'cityObject', id: o.id, name: o.name, category: o.type, location: o.location, distance: d });
      result.byCategory[o.type] = (result.byCategory[o.type] || 0) + 1;
      result.total++;
    }
  });

  db.keyPlaces.forEach(p => {
    if (!p.location) return;
    const d = calculateDistance(p.location, center);
    if (d <= r) {
      result.items.push({ type: 'keyPlace', id: p.id, name: p.name, category: `kp_${p.category}`, level: p.level, location: p.location, distance: d });
      result.byCategory[`kp_${p.category}`] = (result.byCategory[`kp_${p.category}`] || 0) + 1;
      result.total++;
    }
  });

  db.resources.filter(r_ => r_.location).forEach(r_ => {
    const d = calculateDistance(r_.location, center);
    if (d <= r) {
      result.items.push({ type: 'resource', id: r_.id, name: r_.name, category: `res_${r_.category}`, location: r_.location, distance: d });
      result.byCategory[`res_${r_.category}`] = (result.byCategory[`res_${r_.category}`] || 0) + 1;
      result.total++;
    }
  });

  result.items.sort((a, b) => a.distance - b.distance);
  return success(res, result);
};

module.exports = { getHeatmap, getHeatmapAroundEvent, aggregateLocations };
