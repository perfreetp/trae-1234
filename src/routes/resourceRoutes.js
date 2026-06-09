const express = require('express');
const ctrl = require('../controllers/resourceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('resource:view'), ctrl.listResources);
router.get('/directory', authenticate, authorize('resource:view'), ctrl.getDirectory);
router.get('/nearby', authenticate, authorize('resource:view'), ctrl.getNearbyResources);
router.get('/:id', authenticate, authorize('resource:view'), ctrl.getResource);

module.exports = router;
