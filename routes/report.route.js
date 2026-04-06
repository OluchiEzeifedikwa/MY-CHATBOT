import express from 'express';
import reportController from '../controllers/report.controller.js';
import { upload, uploadTemplate } from '../middleware/upload.js';

const router = express.Router();

router.post('/upload', upload.single('file'), reportController.generateFromFile);
router.post('/fill-template', uploadTemplate, reportController.generateFromTemplate);
router.post('/google-sheet', reportController.generateFromGoogleSheet);
router.get('/:id/export/pptx', reportController.exportPptx);
router.get('/:id', reportController.getReport);

export default router;
