const express = require('express');
const ctrl = require('../controllers/planController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('plan:view'), ctrl.listPlans);
router.get('/types', authenticate, authorize('plan:view'), ctrl.planTypes);
router.get('/match/:eventId', authenticate, authorize('plan:view'), ctrl.matchPlansForEvent);
router.get('/:id', authenticate, authorize('plan:view'), ctrl.getPlan);
router.post('/', authenticate, authorize('plan:create'), ctrl.createPlan);

module.exports = router;
