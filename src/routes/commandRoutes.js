const express = require('express');
const ctrl = require('../controllers/commandController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/context/:eventId', authenticate, ctrl.getCommandContext);
router.post('/action', authenticate, ctrl.executeAction);
router.post('/progress', authenticate, ctrl.reportProgress);

module.exports = router;
