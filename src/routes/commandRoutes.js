const express = require('express');
const ctrl = require('../controllers/commandController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/context/:eventId', authenticate, authorize('command:context'), ctrl.getCommandContext);
router.get('/deep-package/:eventId', authenticate, authorize('event:view'), ctrl.getDeepPackage);
router.post('/action', authenticate, ctrl.executeAction);
router.post('/progress', authenticate, authorize('command:progress'), ctrl.reportProgress);

module.exports = router;
