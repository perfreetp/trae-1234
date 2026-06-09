const express = require('express');
const ctrl = require('../controllers/taskController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('task:view'), ctrl.listTasks);
router.get('/types', authenticate, authorize('task:view'), ctrl.taskTypes);
router.get('/:id', authenticate, authorize('task:view'), ctrl.getTask);
router.post('/', authenticate, authorize('task:create'), ctrl.dispatchTask);
router.post('/:id/accept', authenticate, authorize('task:accept'), ctrl.acceptTask);
router.post('/:id/progress', authenticate, authorize('task:update'), ctrl.updateProgress);

module.exports = router;
