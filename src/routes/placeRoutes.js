const express = require('express');
const ctrl = require('../controllers/placeController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('place:view'), ctrl.listPlaces);
router.get('/categories', authenticate, authorize('place:view'), ctrl.getCategories);
router.get('/:id', authenticate, authorize('place:view'), ctrl.getPlace);
router.post('/', authenticate, authorize('place:create'), ctrl.registerPlace);
router.put('/:id', authenticate, authorize('place:update'), ctrl.updatePlace);

module.exports = router;
