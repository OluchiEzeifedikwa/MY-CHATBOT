import prisma from '../lib/prisma.js';
import { v4 as uuidv4 } from 'uuid';

class ChatRepository {
  async createSession() {
    return prisma.session.create({
      data: { id: uuidv4() },
    });
  }

  async createMessage(sessionId, role, content) {
    return prisma.message.create({
      data: { sessionId, role, content },
    });
  }

  async getMessagesBySession(sessionId) {
    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export default new ChatRepository();
