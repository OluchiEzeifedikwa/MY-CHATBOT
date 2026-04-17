import express from 'express';
import reportController from '../controllers/report.controller.js';
import { upload, uploadTemplate, uploadPptx } from '../middleware/upload.js';

const router = express.Router();

router.post('/upload', upload.single('file'), reportController.generateFromFile);
router.post('/upload/stream', upload.single('file'), reportController.streamFromFile);
router.post('/fill-template', uploadTemplate, reportController.generateFromTemplate);
router.post('/fill-template-from-report', uploadPptx.single('template'), reportController.generateFromReportId);
router.post('/google-sheet', reportController.generateFromGoogleSheet);
router.post('/google-sheet/stream', reportController.streamFromGoogleSheet);
router.get('/', reportController.listReports);
router.get('/:id/export/pptx', reportController.exportPptx);
router.get('/:id', reportController.getReport);

export default router;
