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
}

export default new ReportRepository();
