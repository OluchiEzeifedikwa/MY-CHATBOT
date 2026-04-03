import express from 'express';
import chatController from '../controllers/chat.controller.js';

const router = express.Router();

router.post('/session', chatController.createSession);
router.post('/message', chatController.postMessage);
router.get('/history/:sessionId', chatController.getSessionHistory);

export default router;
