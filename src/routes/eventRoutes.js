const express = require('express');
const ctrl = require('../controllers/eventController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('event:view'), ctrl.listEvents);
router.get('/types', authenticate, authorize('event:view'), ctrl.eventTypes);
router.get('/:id', authenticate, authorize('event:view'), ctrl.getEvent);
router.get('/:id/timeline', authenticate, authorize('event:view'), ctrl.getTimeline);
router.get('/:id/impact', authenticate, authorize('event:view'), ctrl.assessImpact);
router.get('/:id/playback', authenticate, authorize('event:view'), ctrl.playback);
router.post('/', authenticate, authorize('event:create'), ctrl.reportEvent);
router.post('/:id/timeline', authenticate, authorize('event:timeline'), ctrl.addTimeline);
router.put('/:id', authenticate, authorize('event:update'), ctrl.updateEvent);

module.exports = router;
