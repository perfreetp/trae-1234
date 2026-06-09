const express = require('express');
const ctrl = require('../controllers/sensorController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listSensors);
router.get('/summary', authenticate, ctrl.summary);
router.get('/types', authenticate, ctrl.sensorTypes);
router.get('/:id', authenticate, ctrl.getSensor);
router.get('/:id/history', authenticate, ctrl.getSensorHistory);

module.exports = router;
