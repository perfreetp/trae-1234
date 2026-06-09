const express = require('express');
const ctrl = require('../controllers/evacuationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listRoutes);
router.get('/suggestions', authenticate, ctrl.getSuggestions);
router.get('/event/:eventId', authenticate, ctrl.getRoutesForEvent);
router.get('/:id', authenticate, ctrl.getRoute);
router.post('/:id/simulate', authenticate, ctrl.simulateTraffic);

module.exports = router;
