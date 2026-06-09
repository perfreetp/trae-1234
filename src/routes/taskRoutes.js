const express = require('express');
const ctrl = require('../controllers/taskController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.listTasks);
router.get('/types', authenticate, ctrl.taskTypes);
router.get('/:id', authenticate, ctrl.getTask);
router.post('/', authenticate, authorize('task:create'), ctrl.dispatchTask);
router.post('/:id/accept', authenticate, ctrl.acceptTask);
router.post('/:id/progress', authenticate, ctrl.updateProgress);

module.exports = router;
