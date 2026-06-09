const express = require('express');
const ctrl = require('../controllers/locationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/heatmap', authenticate, ctrl.getHeatmap);
router.get('/heatmap/event/:eventId', authenticate, ctrl.getHeatmapAroundEvent);
router.get('/aggregate', authenticate, ctrl.aggregateLocations);

module.exports = router;
