import multer from 'multer';

const storage = multer.memoryStorage();

const dataFilter = (_req, file, cb) => {
  const allowed = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Upload a CSV, Excel, or PDF file.'));
  }
};

const anyFilter = (_req, file, cb) => {
  const all = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];
  cb(null, all.includes(file.mimetype));
};

export const upload = multer({ storage, fileFilter: dataFilter });

// For the template-fill endpoint: accepts two files (template PPTX + data file)
export const uploadTemplate = multer({ storage, fileFilter: anyFilter }).fields([
  { name: 'template', maxCount: 1 },
  { name: 'data',     maxCount: 1 },
]);

// For fill-template-from-report: accepts PPTX template only
const pptxFilter = (_req, file, cb) => {
  const allowed = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Upload a PPTX file.'));
  }
};
export const uploadPptx = multer({ storage, fileFilter: pptxFilter });
