const { db } = require('../data/database');
const { success, fail, notFound, paginate } = require('../utils/response');

const listPlans = (req, res) => {
  const { type, applicableLevel, keyword, page = 1, pageSize = 20 } = req.query;
  let list = [...db.plans];
  if (type) list = list.filter(p => p.type === type);
  if (applicableLevel) list = list.filter(p => p.applicableLevels.includes(applicableLevel));
  if (keyword) {
    const kw = keyword.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw));
  }
  const result = paginate(list, page, pageSize);
  return success(res, result);
};

const getPlan = (req, res) => {
  const plan = db.plans.find(p => p.id === req.params.id);
  if (!plan) return notFound(res, '预案不存在');
  const resources = (plan.requiredResources || []).map(rid => db.resources.find(r => r.id === rid)).filter(Boolean);
  const routes = (plan.evacuationRoutes || []).map(rid => db.evacuationRoutes.find(r => r.id === rid)).filter(Boolean);
  return success(res, { plan, resources, routes });
};

const matchPlansForEvent = (req, res) => {
  const event = db.emergencyEvents.find(e => e.id === req.params.eventId);
  if (!event) return notFound(res, '事件不存在');

  const results = db.plans.map(plan => {
    let score = 0;
    const reasons = [];
    if (plan.type === event.type) { score += 40; reasons.push(`事件类型匹配: ${event.type}`); }
    if (plan.applicableLevels.includes(event.level)) { score += 25; reasons.push(`等级匹配: ${event.level}`); }
    if (event.objectId) {
      const obj = db.cityObjects.find(o => o.id === event.objectId);
      if (obj) {
        const matched = (plan.applicableScenarios || []).some(s => {
          const sLow = s.toLowerCase();
          if (obj.description && obj.description.toLowerCase().includes(sLow)) return true;
          if (obj.type === 'building' && obj.floors > 20 && sLow.includes('高层')) return true;
          if (obj.type === 'mall' && sLow.includes('商业')) return true;
          return false;
        });
        if (matched) { score += 20; reasons.push('场景特征匹配'); }
      }
    }
    if (score >= 50) score += 15;
    return { plan, score: Math.min(score, 100), matchLevel: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low', reasons };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

  const recommended = results.length > 0 ? results[0] : null;
  return success(res, {
    eventId: event.id,
    eventType: event.type,
    eventLevel: event.level,
    matchCount: results.length,
    recommended,
    alternatives: results.slice(1)
  });
};

const createPlan = (req, res) => {
  const { name, type, applicableLevels, steps, ...rest } = req.body;
  if (!name || !type || !Array.isArray(applicableLevels) || !Array.isArray(steps)) {
    return fail(res, 400, '预案名称、类型、适用等级、步骤为必填项');
  }
  const plan = { id: `PLN-${type.toUpperCase()}-${Date.now().toString().slice(-4)}`, name, type, applicableLevels, steps, ...rest, createdAt: new Date().toISOString() };
  db.plans.push(plan);
  return success(res, { plan }, '预案创建成功');
};

const planTypes = (req, res) => {
  const types = [
    { code: 'fire', name: '火灾爆炸类', levels: ['I', 'II', 'III', 'IV'] },
    { code: 'gas', name: '燃气泄漏类', levels: ['I', 'II', 'III'] },
    { code: 'traffic', name: '交通事故类', levels: ['II', 'III', 'IV'] },
    { code: 'chemical', name: '危化品类', levels: ['I', 'II', 'III'] },
    { code: 'flood', name: '洪涝灾害类', levels: ['I', 'II', 'III', 'IV'] },
    { code: 'medical', name: '公共卫生类', levels: ['I', 'II', 'III', 'IV'] },
    { code: 'structural', name: '建筑坍塌类', levels: ['I', 'II', 'III'] },
    { code: 'public_order', name: '治安事件类', levels: ['II', 'III', 'IV'] }
  ];
  return success(res, { types });
};

module.exports = { listPlans, getPlan, matchPlansForEvent, createPlan, planTypes };
