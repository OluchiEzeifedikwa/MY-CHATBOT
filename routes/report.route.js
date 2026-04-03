import express from 'express';
import reportController from '../controllers/report.controller.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.post('/upload', upload.single('file'), reportController.generateFromFile);
router.post('/google-sheet', reportController.generateFromGoogleSheet);
router.get('/:id', reportController.getReport);

export default router;
