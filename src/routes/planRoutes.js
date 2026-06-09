const express = require('express');
const ctrl = require('../controllers/planController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listPlans);
router.get('/types', authenticate, ctrl.planTypes);
router.get('/match/:eventId', authenticate, ctrl.matchPlansForEvent);
router.get('/:id', authenticate, ctrl.getPlan);
router.post('/', authenticate, authorize('plan:create'), ctrl.createPlan);

module.exports = router;
