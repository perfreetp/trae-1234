const express = require('express');
const ctrl = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listNotifications);
router.get('/types', authenticate, ctrl.notificationTypes);
router.get('/:id', authenticate, ctrl.getNotification);
router.post('/', authenticate, authorize('notification:create'), ctrl.sendNotification);
router.post('/event/:eventId/notify-departments', authenticate, ctrl.notifyDepartmentsForEvent);
router.post('/:id/read', authenticate, ctrl.markRead);

module.exports = router;
