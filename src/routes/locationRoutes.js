const express = require('express');
const ctrl = require('../controllers/locationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/heatmap', authenticate, authorize('location:view'), ctrl.getHeatmap);
router.get('/heatmap/event/:eventId', authenticate, authorize('location:view'), ctrl.getHeatmapAroundEvent);
router.get('/aggregate', authenticate, authorize('location:view'), ctrl.aggregateLocations);

module.exports = router;
