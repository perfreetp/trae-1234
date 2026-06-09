const express = require('express');
const ctrl = require('../controllers/commandController');
const streetCtrl = require('../controllers/streetLedgerController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authenticate, authorize('command:dashboard'), ctrl.getDutyDashboard);
router.get('/context/:eventId', authenticate, authorize('command:context'), ctrl.getCommandContext);
router.get('/deep-package/:eventId', authenticate, authorize('command:deep-package'), ctrl.getDeepPackage);
router.post('/action', authenticate, ctrl.executeAction);
router.post('/progress', authenticate, authorize('command:progress'), ctrl.reportProgress);

router.get('/supervision/groups', authenticate, authorize('supervision:view'), ctrl.getSupervisionGroups);
router.post('/supervision/create', authenticate, authorize('supervision:create'), ctrl.createSupervision);

router.get('/street/ledger', authenticate, authorize('street:ledger'), streetCtrl.getStreetLedger);
router.get('/street/events/:eventId', authenticate, authorize('street:ledger'), streetCtrl.getStreetEventDetail);
router.get('/street/tasks', authenticate, authorize('street:ledger'), streetCtrl.getStreetTasks);
router.post('/street/events/:eventId/supplement', authenticate, authorize('street:ledger'), streetCtrl.supplementEvent);

module.exports = router;
