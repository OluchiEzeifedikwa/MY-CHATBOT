import { google } from 'googleapis';

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Sheets URL');
  return match[1];
}

export async function parseGoogleSheet(url) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = extractSheetId(url);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1',
  });

  const rows = response.data.values || [];
  return rows.map((row) => row.join(',')).join('\n');
}
