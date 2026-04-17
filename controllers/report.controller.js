import reportService from '../services/report.service.js';
import { exportToPptx } from '../lib/exportPptx.js';

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

  streamFromFile = async (req, res) => {
    const { prompt } = req.body;
    const file = req.file;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      await reportService.streamFromFile(file, prompt, send);
    } catch (err) {
      send('error', { message: err.message });
    } finally {
      res.end();
    }
  }

  streamFromGoogleSheet = async (req, res) => {
    const { url, prompt } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      await reportService.streamFromGoogleSheet(url, prompt, send);
    } catch (err) {
      send('error', { message: err.message });
    } finally {
      res.end();
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

  listReports = async (_req, res, next) => {
    try {
      const reports = await reportService.listReports();
      res.json(reports);
    } catch (err) {
      next(err);
    }
  }

  generateFromReportId = async (req, res, next) => {
    const { reportId, prompt } = req.body;
    const templateFile = req.file;

    if (!templateFile) return res.status(400).json({ error: 'No template PPTX uploaded' });
    if (!reportId)     return res.status(400).json({ error: 'No reportId provided' });

    try {
      const buffer = await reportService.generateFromReportId(templateFile, reportId, prompt);
      const filename = `slides-${Date.now()}.pptx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  generateFromTemplate = async (req, res, next) => {
    const { prompt } = req.body;
    const templateFile = req.files?.template?.[0];
    const dataFile     = req.files?.data?.[0];

    if (!templateFile) return res.status(400).json({ error: 'No template PPTX uploaded' });
    if (!dataFile)     return res.status(400).json({ error: 'No data file uploaded' });

    try {
      const buffer = await reportService.generateFromTemplate(templateFile, dataFile, prompt);
      const filename = `slides-${Date.now()}.pptx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  exportPptx = async (req, res, next) => {
    const { id } = req.params;

    try {
      const report = await reportService.getReport(id);
      if (!report) return res.status(404).json({ error: 'Report not found' });

      const buffer = await exportToPptx(report);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${id.slice(0,8)}.pptx"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
}

export default new ReportController();
