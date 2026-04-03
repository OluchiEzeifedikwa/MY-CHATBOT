import chatService from '../services/chat.service.js';

class ChatController {
  createSession = async (_req, res, next) => {
    try {
      const sessionId = await chatService.startSession();
      res.json({ sessionId });
    } catch (err) {
      next(err);
    }
  }

  postMessage = async (req, res, next) => {
    const { sessionId, message } = req.body;
    try {
      const { reply, sessionId: resolvedSessionId } = await chatService.sendMessage(sessionId, message);
      res.json({ reply, sessionId: resolvedSessionId });
    } catch (err) {
      next(err);
    }
  }

  getSessionHistory = async (req, res, next) => {
    const { sessionId } = req.params;
    try {
      const messages = await chatService.getHistory(sessionId);
      res.json({ messages });
    } catch (err) {
      next(err);
    }
  }
}

export default new ChatController();
