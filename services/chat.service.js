import Groq from 'groq-sdk';
import chatRepository from '../repositories/chat.repository.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a helpful medical Q&A assistant for patients.
Your role is to answer health-related questions clearly and compassionately.
Always remind patients that your answers are for informational purposes only
and do not replace professional medical advice. Encourage them to consult
their doctor for diagnosis, treatment, or urgent concerns.`;

class ChatService {
  async startSession() {
    const session = await chatRepository.createSession();
    return session.id;
  }

  async sendMessage(sessionId, message) {
    if (!message) throw new Error('message is required');

    const resolvedSessionId = sessionId || await this.startSession();

    await chatRepository.createMessage(resolvedSessionId, 'user', message);

    const history = await chatRepository.getMessagesBySession(resolvedSessionId);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
    });

    const reply = completion.choices[0].message.content;

    await chatRepository.createMessage(resolvedSessionId, 'assistant', reply);

    return { reply, sessionId: resolvedSessionId };
  }

  async getHistory(sessionId) {
    return chatRepository.getMessagesBySession(sessionId);
  }
}

export default new ChatService();
