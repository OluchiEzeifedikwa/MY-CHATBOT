import xlsx from 'xlsx';

export function parseCSV(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_csv(sheet);
}
