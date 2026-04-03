import reportService from '../services/report.service.js';

class ReportController {
  generateFromFile = async (req, res, next) => {
    const { prompt } = req.body;
    const file = req.file;

    try {
      const report = await reportService.generateFromFile(file, prompt);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  generateFromGoogleSheet = async (req, res, next) => {
    const { url, prompt } = req.body;

    try {
      const report = await reportService.generateFromGoogleSheet(url, prompt);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  getReport = async (req, res, next) => {
    const { id } = req.params;

    try {
      const report = await reportService.getReport(id);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
}

export default new ReportController();
