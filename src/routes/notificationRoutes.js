const express = require('express');
const ctrl = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('notification:view'), ctrl.listNotifications);
router.get('/types', authenticate, authorize('notification:view'), ctrl.notificationTypes);
router.get('/:id', authenticate, authorize('notification:view'), ctrl.getNotification);
router.post('/', authenticate, authorize('notification:create'), ctrl.sendNotification);
router.post('/event/:eventId/notify-departments', authenticate, authorize('notification:send'), ctrl.notifyDepartmentsForEvent);
router.post('/:id/read', authenticate, authorize('notification:view'), ctrl.markRead);

module.exports = router;
