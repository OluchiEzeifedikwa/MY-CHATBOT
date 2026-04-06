import PptxGenJS from 'pptxgenjs';

const BRAND_DARK  = '0F172A';
const BRAND_BLUE  = '6366F1';
const BRAND_SKY   = '0EA5E9';
const WHITE       = 'FFFFFF';
const LIGHT_GRAY  = 'E2E8F0';
const MUTED       = '94A3B8';

function slideHeader(slide, title) {
  slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.7, fill: { color: BRAND_DARK } });
  slide.addText(title, {
    x: 0.3, y: 0.1, w: 9, h: 0.5,
    fontSize: 18, bold: true, color: WHITE, fontFace: 'Arial',
  });
}

function addTable(slide, headers, rows, y = 0.9) {
  const colW = 10 / headers.length;
  const tableData = [
    headers.map(h => ({
      text: h,
      options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE }, fontSize: 10, align: 'center' },
    })),
    ...rows.map((row, ri) =>
      row.map(cell => ({
        text: String(cell ?? ''),
        options: { fontSize: 9, color: BRAND_DARK, fill: { color: ri % 2 === 0 ? 'F8FAFF' : WHITE }, align: 'left' },
      }))
    ),
  ];

  slide.addTable(tableData, {
    x: 0, y, w: 10, colW: headers.map(() => colW),
    border: { type: 'solid', color: LIGHT_GRAY, pt: 0.5 },
    rowH: 0.28,
  });
}

function parseMd(content) {
  const result = { overview: [], departments: [], lab: { total: '', rows: [] }, doctors: [], analysis: '' };

  const lines = content.split('\n');
  let section = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## Overview'))           { section = 'overview'; continue; }
    if (trimmed.startsWith('## Breakdown'))          { section = 'dept'; continue; }
    if (trimmed.startsWith('## Laboratory'))         { section = 'lab'; continue; }
    if (trimmed.startsWith('## Referring'))          { section = 'doctors'; continue; }
    if (trimmed.startsWith('## Summary'))            { section = 'analysis'; continue; }

    if (section === 'overview' && trimmed.startsWith('-')) {
      result.overview.push(trimmed.replace(/^-\s*\*\*.*?\*\*:?\s*/, '').replace(/\*\*/g, '').trim());
    }

    if (section === 'dept' && trimmed.startsWith('|') && !trimmed.startsWith('|---')) {
      const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
      if (cols[0] !== 'Department') result.departments.push(cols);
    }

    if (section === 'lab') {
      if (trimmed.startsWith('**Total')) {
        result.lab.total = trimmed.replace(/\*\*/g, '');
      } else if (trimmed.startsWith('|') && !trimmed.startsWith('|---')) {
        const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
        if (cols[0] !== 'Test') result.lab.rows.push(cols);
      }
    }

    if (section === 'doctors' && trimmed.startsWith('|') && !trimmed.startsWith('|---')) {
      const cols = trimmed.split('|').map(c => c.trim()).filter(Boolean);
      if (cols[0] !== 'Doctor') result.doctors.push(cols);
    }

    if (section === 'analysis' && trimmed) {
      result.analysis += trimmed + ' ';
    }
  }

  return result;
}

export async function exportToPptx(report) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const data = parseMd(report.content);

  const MONTH_NAMES_LIST = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const monthMatch = (report.prompt || '').match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  const monthLabel = monthMatch
    ? monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase()
    : MONTH_NAMES_LIST[new Date().getMonth()];   // default to current calendar month
  const slideTitle = `${monthLabel} Sales Report`;

  // ── Slide 1: Title ──
  const s1 = pptx.addSlide();
  s1.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: BRAND_DARK } });
  s1.addShape('rect', { x: 0, y: 3.2, w: '100%', h: 0.06, fill: { color: BRAND_BLUE } });

  s1.addText(slideTitle, {
    x: 0.5, y: 1.2, w: 9, h: 1,
    fontSize: 40, bold: true, color: WHITE, fontFace: 'Arial', align: 'center',
  });

  s1.addText(data.overview.join('  ·  '), {
    x: 0.5, y: 2.5, w: 9, h: 0.5,
    fontSize: 13, color: MUTED, fontFace: 'Arial', align: 'center',
  });

  s1.addText(`Generated on ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`, {
    x: 0.5, y: 3.6, w: 9, h: 0.4,
    fontSize: 11, color: MUTED, fontFace: 'Arial', align: 'center',
  });

  // ── Slide 2: Key Metrics ──
  const s2 = pptx.addSlide();
  s2.background = { color: 'F0F4FF' };
  slideHeader(s2, 'Key Metrics');

  const metricLabels = ['Unique Patients', 'Total Revenue', 'Unique Doctors'];
  data.overview.forEach((val, i) => {
    const x = 0.3 + i * 3.3;
    s2.addShape('rect', { x, y: 1, w: 3, h: 1.6, fill: { color: WHITE }, line: { color: LIGHT_GRAY, pt: 1 }, rectRadius: 0.1 });
    s2.addText(metricLabels[i] || '', { x, y: 1.1, w: 3, h: 0.4, fontSize: 10, color: MUTED, align: 'center', fontFace: 'Arial' });
    s2.addText(val, { x, y: 1.5, w: 3, h: 0.8, fontSize: 18, bold: true, color: BRAND_BLUE, align: 'center', fontFace: 'Arial' });
  });

  // ── Slide 3: Department Breakdown ──
  const s3 = pptx.addSlide();
  s3.background = { color: WHITE };
  slideHeader(s3, 'Breakdown by Department');
  addTable(s3, ['Department', 'No. of Tests', 'Business Value (₦)'], data.departments);

  // ── Slide 4: Laboratory ──
  const s4 = pptx.addSlide();
  s4.background = { color: WHITE };
  slideHeader(s4, 'Laboratory Tests');
  s4.addText(data.lab.total, { x: 0.3, y: 0.75, w: 9, h: 0.3, fontSize: 12, bold: true, color: BRAND_DARK, fontFace: 'Arial' });

  // ── Slide 5+: Doctors (split every 20 rows) ──
  const chunkSize = 20;
  for (let i = 0; i < data.doctors.length; i += chunkSize) {
    const chunk = data.doctors.slice(i, i + chunkSize);
    const sD = pptx.addSlide();
    sD.background = { color: WHITE };
    const part = data.doctors.length > chunkSize ? ` (${i + 1}–${Math.min(i + chunkSize, data.doctors.length)})` : '';
    slideHeader(sD, `Referring Doctors${part}`);
    addTable(sD, ['Doctor', 'Patients', 'Services', 'Total Amount (₦)'], chunk);
  }

  // ── Last Slide: Analysis ──
  const sA = pptx.addSlide();
  sA.background = { color: BRAND_DARK };
  slideHeader(sA, 'Summary & Analysis');
  sA.addText(data.analysis.trim(), {
    x: 0.3, y: 0.9, w: 9.4, h: 5.5,
    fontSize: 12, color: LIGHT_GRAY, fontFace: 'Arial',
    valign: 'top', wrap: true,
  });

  return pptx.write({ outputType: 'nodebuffer' });
}
