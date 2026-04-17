import prisma from '../lib/prisma.js';
import { v4 as uuidv4 } from 'uuid';

class ReportRepository {
  async saveReport(prompt, content) {
    return prisma.report.create({
      data: { id: uuidv4(), prompt, content },
    });
  }

  async getReport(id) {
    return prisma.report.findUnique({ where: { id } });
  }

  async listReports(limit = 20) {
    return prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, prompt: true, createdAt: true },
    });
  }
}

export default new ReportRepository();
