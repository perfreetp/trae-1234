const express = require('express');
const ctrl = require('../controllers/statisticsController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', authenticate, ctrl.overview);
router.get('/events', authenticate, ctrl.eventStatistics);
router.get('/disposal', authenticate, ctrl.disposalStatistics);
router.get('/command-dashboard', authenticate, ctrl.commandDashboard);

module.exports = router;
