const express = require('express');
const ctrl = require('../controllers/sensorController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('sensor:view'), ctrl.listSensors);
router.get('/summary', authenticate, authorize('sensor:view'), ctrl.summary);
router.get('/types', authenticate, authorize('sensor:view'), ctrl.sensorTypes);
router.get('/:id', authenticate, authorize('sensor:view'), ctrl.getSensor);
router.get('/:id/history', authenticate, authorize('sensor:view'), ctrl.getSensorHistory);

module.exports = router;
