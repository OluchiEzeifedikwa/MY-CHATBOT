import JSZip from 'jszip';

const LABEL_MAP = {
  'NO OF DOCTORS VISITED':      'doctorsVisited',
  'NO. OF DOCTORS VISITED':     'doctorsVisited',
  'NUMBER OF DOCTORS VISITED':  'doctorsVisited',
  'DOCTORS VISITED':            'doctorsVisited',

  'NO OF HOSPITALS VISITED':    'hospitalsVisited',
  'NO. OF HOSPITALS VISITED':   'hospitalsVisited',
  'HOSPITALS VISITED':          'hospitalsVisited',

  'NO OF DOCTORS REFERRED':     'doctorsReferred',
  'NO. OF DOCTORS REFERRED':    'doctorsReferred',
  'DOCTORS REFERRED':           'doctorsReferred',

  'NO OF PATIENTS':             'patients',
  'NO. OF PATIENTS':            'patients',
  'NO OF PATIENTS REFERRED':    'patients',
  'PATIENTS REFERRED':          'patients',
  'PATIENTS':                   'patients',

  'BUSINESS FOR THE MONTH':     'business',
  'BUSINESS':                   'business',

  'TARGET FOR THE MONTH':       'target',
  'TARGET':                     'target',

  '% ACHIEVED':                 'achievement',
  '% ACHIEVEMENT':              'achievement',
  'ACHIEVEMENT':                'achievement',
};

const DEPT_MAP = {
  'CT SCAN':          'CT',
  'CT':               'CT',
  'MRI':              'MRI',
  'XRAY':                  'X RAY',
  'X RAY':                 'X RAY',
  'XRAY PROCEDURE':        'X RAY',
  'XRAY /XRAY PROCEDURE':  'X RAY',
  'XRAY/XRAY PROCEDURE':   'X RAY',
  'MAMMO':            'MAMMOGRAPHY',
  'MAMMOGRAPHY':      'MAMMOGRAPHY',
  'SONO':             'SONOGRAPHY',
  'SONOGRAPHY':       'SONOGRAPHY',
  'SONO/PCD':         'SONOGRAPHY',
  'PCD':              'PERIPHERAL COLOR DOPPLER',
  'PERIPHERAL COLOR DOPPLER': 'PERIPHERAL COLOR DOPPLER',
  'PATHOLOGY':        'LABORATORY',
  'LABORATORY':       'LABORATORY',
  'ECHO':             'CARDIOLOGY',
  'ECG':              'CARDIOLOGY',
  'EEG':              'NEUROLOGY',
  'NEUROLOGY':        'NEUROLOGY',
  'CARDIOLOGY':       'CARDIOLOGY',
  'ENDOSCOPY':        'ENDOSCOPY',
  'DIALYSIS':         'DIAYLYSIS',
  'DIAYLYSIS':        'DIAYLYSIS',
  'RESPIRATORY':      'RESPIRATORY',
  'CONSULTATION':     'CONSULTATION',
  'OPHTHALMOLOGY':    'OPHTHALMOLOGY',
};

// Maps template doctor names → exact data doctor names
const DOCTOR_ALIAS_MAP = {
  'ORILE AGEGE GH':       'Orile Agege General Hospital',
  'EFANGA ORILE':         'Effanga Orile Agege',
  'EFFANGA ORILE':        'Effanga Orile Agege',
  'ANIMASHAUN HAMFAR':    'Animashaun G O',
  'ANCILLA HOSPITAL':     'Dr Ancilla Catholic Hosp',
  'MOBONIKE HOSPITAL':    'Mobonike  Hospital',
  'PROMISE HOSPITAL':     'Promise  Hospital',
  'MOLAYO MEDICAL':       'Molayo Medical Centre',
  'OLOYEDE':              'Dr Oloyede Molayo Med Centre',
  'FESTUS NSOROMOTU':     'Dr Festus Nsoromotu',
  'EJALONIBU MOLAYO':     'Dr Ejalonibu  Molayo',
  'EJALONIBU':            'Dr Ejalonibu  Molayo',
  'ADEYEMO G A':          'Adeyemo  G A',
  'NNAMDI C O':           'Nnamdi C O Goodness Medical',
  'NNAMDI':               'Nnamdi C O Goodness Medical',
  'SELF REF AB FOUR':     'Self Ref Ab Four',
};

// For labels that share a department, filter by service keyword
const SERVICE_KEYWORD_MAP = {
  'ECHO': 'ECHOCARDIOGRAPH',
  'ECG':  'ECG',
  'EEG':  'EEG',
};

const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
];

// ── XML helpers ───────────────────────────────────────────────────────────────

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Concatenate all <a:t> text within any XML block */
function extractText(xml) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)]
    .map(m => m[1]).join('');
}

/** Set the first <a:t> run to newValue, clear the rest */
function setCellText(cellXml, newValue) {
  let first = true;
  return cellXml.replace(/<a:t(\s[^>]*)?>([^<]*)<\/a:t>/g, (_, attrs = '') => {
    if (first) { first = false; return `<a:t${attrs}>${escapeXml(newValue)}</a:t>`; }
    return `<a:t${attrs}><\/a:t>`;
  });
}

/** Extract all <a:tc>…</a:tc> blocks from a row string */
function extractCells(rowXml) {
  return [...rowXml.matchAll(/<a:tc>[\s\S]*?<\/a:tc>/g)].map(m => m[0]);
}

/** Swap all table-cell blocks in a row with a new ordered list */
function reconstructRow(rowXml, newCells) {
  const start = rowXml.indexOf('<a:tc>');
  const end   = rowXml.lastIndexOf('</a:tc>') + '</a:tc>'.length;
  return rowXml.slice(0, start) + newCells.join('') + rowXml.slice(end);
}

// ── Month replacement ─────────────────────────────────────────────────────────

function monthVariants(name) {
  const lo = name.toLowerCase();
  const up = name.toUpperCase();
  const ti = lo[0].toUpperCase() + lo.slice(1);
  // Only full month names — abbreviations like "oct" cause false matches in words like "doctors"
  return [up, ti, lo];
}

/**
 * Replace month name inside a SINGLE <a:p> paragraph.
 * Paragraphs often split one word across several <a:r> runs, so we:
 *   1. Concatenate all <a:t> text across all runs
 *   2. If the concatenated text contains the old month, replace it
 *   3. Put the whole new text into the FIRST run's <a:t>, clear the rest
 */
function replaceMonthInParagraph(paraXml, oldVariants, newVariants) {
  // 1. Try replacing within individual runs (safe — no merging)
  let changed = false;
  let result = paraXml.replace(/<a:t(\s[^>]*)?>([^<]*)<\/a:t>/g, (match, attrs = '', content) => {
    let newContent = content;
    for (let i = 0; i < oldVariants.length; i++) {
      if (newContent.includes(oldVariants[i])) {
        newContent = newContent.split(oldVariants[i]).join(newVariants[i]);
        changed = true;
      }
    }
    return changed ? `<a:t${attrs}>${escapeXml(newContent)}</a:t>` : match;
  });
  if (changed) return result;

  // 2. Fallback: month may be split across consecutive runs.
  //    Find the MINIMUM window of consecutive runs that contains the month.
  const runs = [...paraXml.matchAll(/<a:r\b[^>]*>[\s\S]*?<\/a:r>/g)];
  if (!runs.length) return paraXml;

  for (let start = 0; start < runs.length; start++) {
    for (let end = start; end < Math.min(start + 4, runs.length); end++) {
      const windowText = runs.slice(start, end + 1).map(r => extractText(r[0])).join('');
      let newText = windowText;
      let replaced = false;
      for (let i = 0; i < oldVariants.length; i++) {
        if (newText.includes(oldVariants[i])) {
          newText = newText.split(oldVariants[i]).join(newVariants[i]);
          replaced = true;
        }
      }
      if (!replaced) continue;

      // Only modify the runs in this window, leave everything else intact
      result = paraXml;
      for (let j = start; j <= end; j++) {
        const oldRun = runs[j][0];
        if (j === start) {
          const newRun = oldRun.replace(
            /<a:t(\s[^>]*)?>([^<]*)<\/a:t>/,
            (_, attrs = '') => `<a:t${attrs}>${escapeXml(newText)}</a:t>`
          );
          const idx = result.indexOf(oldRun);
          if (idx !== -1) result = result.slice(0, idx) + newRun + result.slice(idx + oldRun.length);
        } else {
          const newRun = oldRun.replace(
            /<a:t(\s[^>]*)?>([^<]*)<\/a:t>/g,
            (_, attrs = '') => `<a:t${attrs}><\/a:t>`
          );
          const idx = result.indexOf(oldRun);
          if (idx !== -1) result = result.slice(0, idx) + newRun + result.slice(idx + oldRun.length);
        }
      }
      return result;
    }
  }

  return paraXml;
}

/**
 * Replace any old month → newMonth in all <a:p> paragraphs that are NOT inside a <a:tbl>.
 * Tries every possible old month so detection errors don't block the replacement.
 */
function replaceMonthInTitles(xml, newMonth) {
  const newV = monthVariants(newMonth);

  // Protect table blocks so we don't touch column headers like "JANUARY '26"
  const tables = [];
  let protected_ = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, match => {
    const ph = `\x00TABLE${tables.length}\x00`;
    tables.push(match);
    return ph;
  });

  // Replace at the paragraph level — try every month as the old value
  protected_ = protected_.replace(
    /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g,
    para => {
      for (const oldM of MONTH_NAMES) {
        if (oldM === newMonth.toLowerCase()) continue;
        const replaced = replaceMonthInParagraph(para, monthVariants(oldM), newV);
        if (replaced !== para) return replaced;
      }
      return para;
    }
  );

  // Restore tables
  tables.forEach((t, i) => { protected_ = protected_.replace(`\x00TABLE${i}\x00`, t); });
  return protected_;
}

/**
 * Replace known metric values in bullet-point text boxes (not tables).
 * Matches lines like "Business for the month  : 33,374,325" and replaces the number.
 */
function replaceTextBoxMetrics(xml, metrics) {
  const business  = Number(metrics.business).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const patients  = String(metrics.patients);
  const doctors   = String(metrics.doctorsReferred);

  // Protect tables
  const tables = [];
  let protected_ = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, match => {
    const ph = `\x00TABLE${tables.length}\x00`;
    tables.push(match);
    return ph;
  });

  protected_ = protected_.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, para => {
    const text = extractText(para);
    const upper = text.toUpperCase();

    let newValue = null;
    if (upper.includes('BUSINESS FOR THE MONTH') || upper.includes('BUSINESS FOR THE MONTH')) {
      newValue = business;
    } else if (upper.includes('PATIENTS REFERRED') || upper.includes('NO OF PATIENTS')) {
      newValue = patients;
    } else if (upper.includes('DOCTORS REFERRED') || upper.includes('NO OF DOCTORS REFERRED')) {
      newValue = doctors;
    }

    if (!newValue) return para;

    // Replace the number after the colon
    return para.replace(/(<a:t(?:\s[^>]*)?>)([^<]*)(<\/a:t>)/g, (match, open, content, close) => {
      if (/:/.test(content)) {
        const newContent = content.replace(/:\s*[\d,]+/, `: ${newValue}`);
        return `${open}${newContent}${close}`;
      }
      // If number is in a separate run after ":"
      if (/^\s*[\d,]+\s*$/.test(content.trim())) {
        const colonPresent = extractText(para).includes(':');
        if (colonPresent) return `${open} ${newValue}${close}`;
      }
      return match;
    });
  });

  tables.forEach((t, i) => { protected_ = protected_.replace(`\x00TABLE${i}\x00`, t); });
  return protected_;
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function formatMetric(metric, value) {
  if (value === null || value === undefined) return '';
  if (metric === 'business' || metric === 'target') {
    return Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }
  return String(value);
}

/** True when the row contains a month name in any non-label cell */
function rowHasMonth(cells) {
  return cells.slice(1).some(c =>
    MONTH_NAMES.some(m => extractText(c).toLowerCase().includes(m))
  );
}

/**
 * True when the table is a rolling-month comparison table.
 * We require at least 2 month-named cells in the FIRST (header) row so that
 * doctor/test tables with a single month-named column are never misidentified.
 */
function isComparisonTable(tableXml) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return false;
  const headerCells = extractCells(rows[0][0]);
  const monthCount = headerCells.slice(1).filter(c =>
    MONTH_NAMES.some(m => extractText(c).toLowerCase().includes(m))
  ).length;
  return monthCount >= 2;
}

/**
 * Decide the value for a new March cell given:
 *  - the row label
 *  - the known metrics
 *  - the February cell (template) — used to guess if we want count or revenue
 */
function valueForRow(label, templateCell, metrics) {
  // 1. Known KPI labels (doctors visited, patients, business, etc.)
  const metric = LABEL_MAP[label];
  if (metric !== undefined && metrics[metric] !== undefined) {
    return formatMetric(metric, metrics[metric]);
  }

  const prevText   = extractText(templateCell).replace(/[,₦\s]/g, '');
  const prevNum    = parseFloat(prevText);
  const useRevenue = !isNaN(prevNum) && prevNum > 5000;

  // 2. Direct department name match (e.g. data has "ECHO" as its own dept)
  const directDept = metrics.departments?.[label];
  if (directDept) {
    return useRevenue
      ? Number(directDept.revenue).toLocaleString('en-NG', { maximumFractionDigits: 0 })
      : String(directDept.count);
  }

  // 3. DEPT_MAP lookup (e.g. "CT SCAN" → "CT", "PATHOLOGY" → "LABORATORY")
  const deptKey = DEPT_MAP[label];
  const dept = deptKey ? metrics.departments?.[deptKey] : null;
  if (dept) {
    return useRevenue
      ? Number(dept.revenue).toLocaleString('en-NG', { maximumFractionDigits: 0 })
      : String(dept.count);
  }

  // 4. Doctor name match (for top-doctors rolling tables)
  const doctorEntry = Object.entries(metrics.doctors || {}).find(
    ([name]) => name.toUpperCase().replace(/\s+/g, ' ').trim() === label
  );
  if (doctorEntry) {
    return Number(doctorEntry[1].revenue).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }

  // 5. Individual service/test name match
  const svc = metrics.services?.[label];
  if (svc) {
    return useRevenue
      ? Number(svc.revenue).toLocaleString('en-NG', { maximumFractionDigits: 0 })
      : String(svc.count);
  }

  // 6. Unknown — leave blank
  return '';
}

/**
 * True when the table is a Test Wise Analysis table (has PROJ + ACHIEVED columns).
 */
function isTestWiseTable(tableXml) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return false;
  const headerText = extractCells(rows[0][0])
    .map(c => extractText(c).toUpperCase()).join(' ');
  return headerText.includes('PROJ') && headerText.includes('ACHIEVED');
}

/**
 * Fill ACHIEVED TEST COUNT and ACHIEVED BUSINESS columns in the Test Wise table.
 * PROJ columns are already in the template and are left unchanged.
 */
function processTestWiseTable(tableXml, metrics) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return tableXml;

  const headerCells = extractCells(rows[0][0]);
  const headers = headerCells.map(c =>
    extractText(c).toUpperCase().replace(/\s+/g, ' ').trim()
  );

  const achievedCountCol = headers.findIndex(h =>
    h.includes('ACHIEVED') && (h.includes('TEST') || h.includes('COUNT')) && !h.includes('PROJ')
  );
  const achievedBizCol = headers.findIndex(h =>
    h.includes('ACHIEVED') && h.includes('BUSINESS')
  );
  const projBizCol = headers.findIndex(h =>
    h.includes('PROJ') && h.includes('BUSINESS')
  );
  const pctCol = headers.findIndex(h => h.includes('%') && h.includes('ACHIEVED'));


  let result = tableXml;

  for (let i = 1; i < rows.length; i++) {
    const rowXml = rows[i][0];
    const cells = extractCells(rowXml);
    if (!cells.length) continue;

    const label = extractText(cells[0]).toUpperCase().replace(/\s+/g, ' ').trim();
    if (!label) continue;

    // For labels like ECHO/ECG/EEG, aggregate from services instead of department
    const serviceKeyword = SERVICE_KEYWORD_MAP[label];
    let count, revenue;
    if (serviceKeyword && metrics.services) {
      const matched = Object.entries(metrics.services).filter(
        ([name]) => name.toUpperCase().includes(serviceKeyword)
      );
      count   = matched.reduce((s, [, v]) => s + v.count, 0);
      revenue = matched.reduce((s, [, v]) => s + v.revenue, 0);
      if (!count) continue;
    } else {
      const deptKey = DEPT_MAP[label] || label;
      const dept = metrics.departments?.[deptKey] || metrics.departments?.[label];
      if (!dept) continue;
      count   = dept.count;
      revenue = dept.revenue;
    }

    const newCells = [...cells];

    if (achievedCountCol >= 0 && achievedCountCol < newCells.length) {
      newCells[achievedCountCol] = setCellText(newCells[achievedCountCol], String(count));
    }

    if (achievedBizCol >= 0 && achievedBizCol < newCells.length) {
      newCells[achievedBizCol] = setCellText(
        newCells[achievedBizCol],
        Number(revenue).toLocaleString('en-NG', { maximumFractionDigits: 0 })
      );
    }

    // Calculate % achieved based on proj business
    if (pctCol >= 0 && projBizCol >= 0 && pctCol < newCells.length) {
      const projText = extractText(cells[projBizCol]).replace(/[,₦\s]/g, '');
      const projNum  = parseFloat(projText);
      if (!isNaN(projNum) && projNum > 0) {
        const pct = Math.round((revenue / projNum) * 100);
        newCells[pctCol] = setCellText(newCells[pctCol], String(pct));
      }
    }

    const newRowXml = reconstructRow(rowXml, newCells);
    const idx = result.indexOf(rowXml);
    if (idx !== -1) {
      result = result.slice(0, idx) + newRowXml + result.slice(idx + rowXml.length);
    }
  }

  return result;
}

/**
 * True when the table has rows where the first cell matches a known KPI label.
 * Used to identify simple Label | Value tables (no rolling months).
 */
function isKpiTable(tableXml) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  return rows.some(r => {
    const cells = extractCells(r[0]);
    if (cells.length < 2) return false;
    const label = extractText(cells[0]).toUpperCase().replace(/\s+/g, ' ').trim();
    return LABEL_MAP[label] !== undefined;
  });
}

/**
 * Fill a simple KPI table (Label | Value) with metrics data.
 * Only updates cells in the VALUE column when the label is recognised.
 */
function processKpiTable(tableXml, metrics) {
  return tableXml.replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, rowXml => {
    const cells = extractCells(rowXml);
    if (cells.length < 2) return rowXml;

    const label  = extractText(cells[0]).toUpperCase().replace(/\s+/g, ' ').trim();
    const metric = LABEL_MAP[label];
    if (metric === undefined || metrics[metric] === undefined) return rowXml;

    const value    = formatMetric(metric, metrics[metric]);
    // Update the LAST cell (value column) with the new data
    const newCells = [...cells];
    newCells[newCells.length - 1] = setCellText(newCells[newCells.length - 1], value);
    return reconstructRow(rowXml, newCells);
  });
}

/**
 * Fill or rotate the monthly comparison table.
 *
 * Cases:
 * A) Table has a PROJECTION column at the end (e.g. APRIL PROJECTION):
 *    - Find the slot just before PROJECTION — that's the "current month" slot
 *    - Fill it with new data, rename it to newMonthLabel
 *    - Update PROJECTION header to next month
 *
 * B) Last column already matches newMonthLabel → FILL mode (just populate data)
 *
 * C) Otherwise → ROTATE mode (drop oldest, append new month column)
 */
function processComparisonTable(tableXml, metrics, newMonthLabel) {
  const normalize = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return tableXml;

  const headerCells = extractCells(rows[0][0]);
  const headers     = headerCells.map(c => normalize(extractText(c)));

  // Detect PROJECTION column (last column contains "projection")
  const projColIdx = headers[headers.length - 1].includes('projection')
    ? headers.length - 1
    : -1;

  // Next month label for the projection column
  const newMonthIdx = MONTH_NAMES.indexOf(newMonthLabel.split(' ')[0].toLowerCase());
  const nextMonth   = MONTH_NAMES[(newMonthIdx + 1) % 12];
  const nextMonthUp = nextMonth[0].toUpperCase() + nextMonth.slice(1);

  if (projColIdx !== -1) {
    // ── Case A: fill the slot before PROJECTION, update projection header ──
    const fillColIdx = projColIdx - 1; // column to fill with new data

    return tableXml.replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, rowXml => {
      const cells = extractCells(rowXml);
      if (cells.length < 2) return rowXml;

      const newCells = [...cells];

      if (rowHasMonth(cells)) {
        // Header row: rename fill column to newMonthLabel, update projection to next month
        newCells[fillColIdx] = setCellText(newCells[fillColIdx], newMonthLabel);
        newCells[projColIdx] = setCellText(newCells[projColIdx], `${nextMonthUp} Projection`);
      } else {
        // Data row: fill the current month column
        const label    = extractText(cells[0]).toUpperCase().replace(/\s+/g, ' ').trim();
        const prevCell = cells[fillColIdx - 1] || cells[fillColIdx];
        const value    = valueForRow(label, prevCell, metrics);
        if (value) newCells[fillColIdx] = setCellText(newCells[fillColIdx], value);
      }

      return reconstructRow(rowXml, newCells);
    });
  }

  // ── Case B: fill mode — last column already has new month ──
  if (headers[headers.length - 1].includes(normalize(newMonthLabel))) {
    return tableXml.replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, rowXml => {
      const cells = extractCells(rowXml);
      if (cells.length < 2 || rowHasMonth(cells)) return rowXml;

      const label    = extractText(cells[0]).toUpperCase().replace(/\s+/g, ' ').trim();
      const prevCell = cells[cells.length - 2];
      const value    = valueForRow(label, prevCell, metrics);
      if (!value) return rowXml;

      const newCells = [...cells];
      newCells[newCells.length - 1] = setCellText(newCells[newCells.length - 1], value);
      return reconstructRow(rowXml, newCells);
    });
  }

  // ── Case C: rotate — find first month column, drop it, append new month ──
  // Count how many leading columns are non-month (e.g. RANKING, DOCTORS)
  const labelColCount = headers.findIndex(h =>
    MONTH_NAMES.some(m => h.includes(m))
  );
  const firstMonthCol = labelColCount === -1 ? 1 : labelColCount;

  let result = tableXml.replace(
    /<a:tblGrid>([\s\S]*?)<\/a:tblGrid>/,
    (match, inner) => {
      const cols = [...inner.matchAll(/<a:gridCol\b[^>]*\/?>/g)].map(m => m[0]);
      if (cols.length < firstMonthCol + 2) return match;
      // Keep label cols, drop oldest month col, keep rest, append oldest at end
      return `<a:tblGrid>${[
        ...cols.slice(0, firstMonthCol),
        ...cols.slice(firstMonthCol + 1),
        cols[firstMonthCol]
      ].join('')}<\/a:tblGrid>`;
    }
  );

  result = result.replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, rowXml => {
    const cells = extractCells(rowXml);
    if (cells.length < firstMonthCol + 2) return rowXml;

    const templateCell = cells[cells.length - 1];
    let newCellText;
    if (rowHasMonth(cells)) {
      newCellText = newMonthLabel;
    } else {
      // Use the first label column (e.g. DOCTORS name) for lookup
      const label = extractText(cells[firstMonthCol > 1 ? 1 : 0]).toUpperCase().replace(/\s+/g, ' ').trim();
      newCellText = valueForRow(label, templateCell, metrics);
    }

    const newCell  = setCellText(templateCell, newCellText);
    const newCells = [
      ...cells.slice(0, firstMonthCol),
      ...cells.slice(firstMonthCol + 1),
      newCell
    ];
    return reconstructRow(rowXml, newCells);
  });

  return result;
}

/**
 * True when the table is a doctor ranking table (has DOCTORS/DOCTOR column + month columns).
 */
function isDoctorTable(tableXml) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return false;
  const headerText = extractCells(rows[0][0])
    .map(c => extractText(c).toUpperCase()).join(' ');
  return (headerText.includes('DOCTOR') || headerText.includes('DOCTORS')) &&
    MONTH_NAMES.some(m => headerText.toLowerCase().includes(m));
}

/**
 * Fill doctor ranking table: sort doctors by new month revenue descending,
 * rotate month columns, fill MARCH '26 revenue for each doctor.
 */
function processDoctorTable(tableXml, metrics, newMonthLabel) {
  const rows = [...tableXml.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)];
  if (!rows.length) return tableXml;

  const headerCells  = extractCells(rows[0][0]);
  const headers      = headerCells.map(c => extractText(c).toUpperCase().replace(/\s+/g, ' ').trim());
  const doctorColIdx = headers.findIndex(h => h.includes('DOCTOR'));
  const firstMonthCol = headers.findIndex(h => MONTH_NAMES.some(m => h.toLowerCase().includes(m)));
  if (doctorColIdx === -1 || firstMonthCol === -1) return tableXml;

  const fmt = (n) => Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  // Build a lookup: doctor name (uppercase) → march revenue
  const doctorLookup = {};
  for (const [name, data] of Object.entries(metrics.doctors || {})) {
    doctorLookup[name.toUpperCase().replace(/\s+/g, ' ').trim()] = data.revenue;
  }

  // Smart match: find best doctor in lookup for a given template name
  function findDoctorRevenue(templateName) {
    const key = templateName.toUpperCase().replace(/\s+/g, ' ').trim();

    // 1. Exact match
    if (doctorLookup[key] !== undefined) return doctorLookup[key];

    // 2. Alias map (hardcoded for known abbreviations)
    const alias = DOCTOR_ALIAS_MAP[key];
    if (alias) {
      const aliasKey = alias.toUpperCase().replace(/\s+/g, ' ').trim();
      const match = Object.entries(doctorLookup).find(([n]) =>
        n.toUpperCase().replace(/\s+/g, ' ').trim() === aliasKey
      );
      if (match) return match[1];
    }

    // 3. Smart fuzzy: score each data name against the template name
    const templateWords = key.split(' ').filter(w => w.length > 2);
    if (!templateWords.length) return undefined;

    let bestMatch = null;
    let bestScore = 0;

    for (const [dataName, revenue] of Object.entries(doctorLookup)) {
      const dataNorm  = dataName.toUpperCase().replace(/\s+/g, ' ').trim();
      const dataWords = dataNorm.split(' ').filter(w => w.length > 2);

      // Forward: template words found in data name
      const forward  = templateWords.filter(w => dataNorm.includes(w)).length;
      // Backward: data words found in template name
      const backward = dataWords.filter(w => key.includes(w)).length;

      // Bonus: one name starts with the other's first word
      const firstWordBonus = (templateWords[0] && dataNorm.startsWith(templateWords[0])) ||
                             (dataWords[0] && key.startsWith(dataWords[0])) ? 1 : 0;

      const score = forward + backward + firstWordBonus;

      // Require at least 2 meaningful signal to avoid false positives
      if (score >= 2 && score > bestScore) {
        bestScore = score;
        bestMatch = revenue;
      }
    }

    return bestMatch;
  }

  // Rotate grid columns
  let result = tableXml.replace(
    /<a:tblGrid>([\s\S]*?)<\/a:tblGrid>/,
    (match, inner) => {
      const cols = [...inner.matchAll(/<a:gridCol\b[^>]*\/?>/g)].map(m => m[0]);
      if (cols.length < firstMonthCol + 2) return match;
      return `<a:tblGrid>${[
        ...cols.slice(0, firstMonthCol),
        ...cols.slice(firstMonthCol + 1),
        cols[firstMonthCol]
      ].join('')}<\/a:tblGrid>`;
    }
  );

  // Process rows on original tableXml, then apply to result
  for (const rowMatch of rows) {
    const rowXml = rowMatch[0];
    const cells = extractCells(rowXml);
    if (cells.length < firstMonthCol + 2) continue;

    let newCells;
    if (rowHasMonth(cells)) {
      // Header: rotate month columns, set last to newMonthLabel
      newCells = [
        ...cells.slice(0, firstMonthCol),
        ...cells.slice(firstMonthCol + 1),
        setCellText(cells[cells.length - 1], newMonthLabel),
      ];
    } else {
      // Data row: keep existing doctor name, rotate months, fill March value
      const doctorName = extractText(cells[doctorColIdx]).toUpperCase().replace(/\s+/g, ' ').trim();
      const revenue = findDoctorRevenue(doctorName);
      const marchValue = revenue !== undefined ? fmt(revenue) : '';

      newCells = [
        ...cells.slice(0, firstMonthCol),
        ...cells.slice(firstMonthCol + 1),
        setCellText(cells[cells.length - 1], marchValue),
      ];
    }

    const newRowXml = reconstructRow(rowXml, newCells);
    const idx = result.indexOf(rowXml);
    if (idx !== -1) {
      result = result.slice(0, idx) + newRowXml + result.slice(idx + rowXml.length);
    }
  }

  return result;
}

// ── Month auto-detection ──────────────────────────────────────────────────────

export async function detectTemplateMonth(buffer) {
  const zip    = await JSZip.loadAsync(buffer);
  const counts = {};
  const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  for (const path of slides) {
    const xml = (await zip.files[path].async('string')).toLowerCase();
    for (const m of MONTH_NAMES) {
      const n = (xml.match(new RegExp(m, 'g')) || []).length;
      if (n) counts[m] = (counts[m] || 0) + n;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fillTemplate(templateBuffer, metrics, _oldMonth, newMonth, newYear) {
  const zip = await JSZip.loadAsync(templateBuffer);

  const yearSuffix    = `'${String(newYear || new Date().getFullYear()).slice(-2)}`;
  const newMonthLabel = `${(newMonth || 'NEW').toUpperCase()} ${yearSuffix}`; // e.g. "MARCH '26"


  const slides = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  for (const path of slides) {
    let xml = await zip.files[path].async('string');

    // 1. Replace old month → new month in every title / text box (NOT inside tables)
    if (newMonth) {
      xml = replaceMonthInTitles(xml, newMonth);
    }

    // 1b. Replace known metric values in bullet-point text boxes
    xml = replaceTextBoxMetrics(xml, metrics);

    // 2. Process tables: rotate rolling comparison tables; fill KPI values in simple tables.
    xml = xml.replace(/<a:tbl>([\s\S]*?)<\/a:tbl>/g, (_, inner) => {
      if (isDoctorTable(inner)) {
        return '<a:tbl>' + processDoctorTable(inner, metrics, newMonthLabel) + '</a:tbl>';
      }
      if (isTestWiseTable(inner)) {
        return '<a:tbl>' + processTestWiseTable(inner, metrics) + '</a:tbl>';
      }
      if (isComparisonTable(inner)) {
        return '<a:tbl>' + processComparisonTable(inner, metrics, newMonthLabel) + '</a:tbl>';
      }
      if (isKpiTable(inner)) {
        return '<a:tbl>' + processKpiTable(inner, metrics) + '</a:tbl>';
      }
      return `<a:tbl>${inner}<\/a:tbl>`;
    });

    zip.file(path, xml);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
