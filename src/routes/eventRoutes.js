const express = require('express');
const ctrl = require('../controllers/eventController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listEvents);
router.get('/types', authenticate, ctrl.eventTypes);
router.get('/:id', authenticate, ctrl.getEvent);
router.get('/:id/timeline', authenticate, ctrl.getTimeline);
router.get('/:id/impact', authenticate, ctrl.assessImpact);
router.get('/:id/playback', authenticate, ctrl.playback);
router.post('/', authenticate, authorize('event:create'), ctrl.reportEvent);
router.post('/:id/timeline', authenticate, ctrl.addTimeline);
router.put('/:id', authenticate, authorize('event:update'), ctrl.updateEvent);

module.exports = router;
