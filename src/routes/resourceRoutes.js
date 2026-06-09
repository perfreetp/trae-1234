const express = require('express');
const ctrl = require('../controllers/resourceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listResources);
router.get('/directory', authenticate, ctrl.getDirectory);
router.get('/nearby', authenticate, ctrl.getNearbyResources);
router.get('/:id', authenticate, ctrl.getResource);

module.exports = router;
