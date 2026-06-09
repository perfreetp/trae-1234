const express = require('express');
const ctrl = require('../controllers/cityObjectController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.queryObjects);
router.get('/types', authenticate, ctrl.getObjectTypes);
router.get('/:id', authenticate, ctrl.getObject);
router.post('/', authenticate, authorize('city-object:create'), ctrl.createObject);
router.put('/:id', authenticate, authorize('city-object:update'), ctrl.updateObject);
router.delete('/:id', authenticate, authorize('city-object:delete'), ctrl.deleteObject);

module.exports = router;
