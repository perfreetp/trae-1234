const express = require('express');
const ctrl = require('../controllers/meetingController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('meeting:view'), ctrl.listMeetings);
router.get('/:id', authenticate, authorize('meeting:view'), ctrl.getMeeting);
router.get('/event/:eventId', authenticate, authorize('meeting:view'), ctrl.getMeetingForEvent);
router.post('/', authenticate, authorize('meeting:create'), ctrl.createMeeting);
router.put('/:id', authenticate, authorize('meeting:update'), ctrl.updateMeeting);

module.exports = router;
