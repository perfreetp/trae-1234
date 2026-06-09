const express = require('express');
const ctrl = require('../controllers/statisticsController');
const reportCtrl = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', authenticate, authorize('statistics:view'), ctrl.overview);
router.get('/events', authenticate, authorize('statistics:view'), ctrl.eventStatistics);
router.get('/disposal', authenticate, authorize('statistics:view'), ctrl.disposalStatistics);
router.get('/command-dashboard', authenticate, authorize('statistics:view'), ctrl.commandDashboard);
router.get('/daily-report', authenticate, authorize('report:view'), reportCtrl.getDailyReport);
router.get('/report-range', authenticate, authorize('report:view'), reportCtrl.getReportRange);

module.exports = router;
