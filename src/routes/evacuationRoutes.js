const express = require('express');
const ctrl = require('../controllers/evacuationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('evacuation:view'), ctrl.listRoutes);
router.get('/suggestions', authenticate, authorize('evacuation:view'), ctrl.getSuggestions);
router.get('/event/:eventId', authenticate, authorize('evacuation:view'), ctrl.getRoutesForEvent);
router.get('/:id', authenticate, authorize('evacuation:view'), ctrl.getRoute);
router.post('/:id/simulate', authenticate, authorize('evacuation:view'), ctrl.simulateTraffic);

module.exports = router;
