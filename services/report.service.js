import Groq from 'groq-sdk';
import reportRepository from '../repositories/report.repository.js';
import { parseCSV } from '../lib/parsers/csv.parser.js';
import { parseExcel } from '../lib/parsers/excel.parser.js';
import { parsePDF } from '../lib/parsers/pdf.parser.js';
import { parseGoogleSheet } from '../lib/parsers/googlesheet.parser.js';
import { fillTemplate, detectTemplateMonth } from '../lib/pptxTemplateEngine.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ANALYSIS_PROMPT = `You are a sales report analyst. Based on the data summary below, write ONLY a short written analysis (3-5 paragraphs).
Do not produce any tables or lists — just the analysis text. Focus on performance highlights, top doctors, top departments, and opportunities.`;

class ReportService {
  async generateFromFile(file, prompt) {
    const rawData = await this.#parseFile(file);
    return this.#generate(rawData, prompt);
  }

  async generateFromGoogleSheet(url, prompt) {
    const rawData = await parseGoogleSheet(url);
    return this.#generate(rawData, prompt);
  }

  async generateFromTemplate(templateFile, dataFile, prompt) {
    const rawData = await this.#parseFile(dataFile);
    const payor   = this.#detectPayor(rawData, prompt || '');
    const agg     = this.#aggregate(rawData, payor);

    const metrics = {
      doctorsReferred: Object.keys(agg.doctors).length,
      patients:        agg.patients.size,
      business:        agg.totalRevenue,
      services:        agg.services,
      departments:     agg.departments,
      doctors:         agg.doctors,
    };

    // Auto-detect which month the template belongs to (e.g. 'february') — must come first
    const oldMonth = await detectTemplateMonth(templateFile.buffer);

    // Parse new month + year from prompt e.g. "March 2026"
    const MONTH_NAMES_LIST = [
      'january','february','march','april','may','june',
      'july','august','september','october','november','december',
    ];
    const monthMatch = (prompt || '').match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
    );
    const yearMatch = (prompt || '').match(/\b(20\d{2})\b/);

    // If no month in prompt, default to the month AFTER the template's detected month
    let newMonth;
    if (monthMatch) {
      newMonth = monthMatch[1].toLowerCase();
    } else if (oldMonth) {
      const idx = MONTH_NAMES_LIST.indexOf(oldMonth.toLowerCase());
      newMonth = MONTH_NAMES_LIST[(idx + 1) % 12];
    } else {
      newMonth = MONTH_NAMES_LIST[new Date().getMonth()];
    }

    const newYear = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

    return fillTemplate(templateFile.buffer, metrics, oldMonth, newMonth, newYear);
  }

  async getReport(id) {
    return reportRepository.getReport(id);
  }

  #parseFile(file) {
    const { mimetype, buffer } = file;

    if (mimetype === 'text/csv') return parseCSV(buffer);
    if (mimetype === 'application/pdf') return parsePDF(buffer);
    if (
      mimetype === 'application/vnd.ms-excel' ||
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) return parseExcel(buffer);

    throw new Error('Unsupported file type');
  }

  #parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  #detectPayor(rawData, prompt) {
    const fromPrompt = prompt.match(/\b([A-Z]{2}\d+)\b/i);
    if (fromPrompt) return fromPrompt[1].toUpperCase();

    const counts = {};
    for (const line of rawData.split('\n')) {
      const cols = this.#parseCSVLine(line);
      for (const col of cols) {
        const val = col.trim().toUpperCase();
        if (/^[A-Z]{2}\d+$/.test(val)) counts[val] = (counts[val] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  }

  #fmt(n) {
    return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  #aggregate(rawData, payor) {
    const lines = rawData.split('\n').filter((l) => l.trim());

    const patients = new Set();
    const doctors = {};
    const departments = {};
    const services = {};
    let totalRevenue = 0;

    for (const line of lines) {
      const cols = this.#parseCSVLine(line);
      const payorIdx = payor
        ? cols.findIndex((c) => c.trim().toUpperCase() === payor)
        : cols.findIndex((c) => /^[A-Z]{2}\d+$/.test(c.trim().toUpperCase()));
      if (payorIdx === -1) continue;

      const patient = cols[0]?.trim();
      const department = cols[1]?.trim().toUpperCase();
      const doctor = cols[2]?.trim();
      const service = cols[payorIdx + 2]?.trim();
      const amountRaw = cols[cols.length - 1]?.trim().replace(/[,₦\s]/g, '');
      const amount = parseFloat(amountRaw) || 0;

      if (patient) patients.add(patient);
      totalRevenue += amount;

      if (department) {
        if (!departments[department]) departments[department] = { count: 0, revenue: 0 };
        departments[department].count++;
        departments[department].revenue += amount;
      }

      if (doctor) {
        if (!doctors[doctor]) doctors[doctor] = { patients: new Set(), services: 0, revenue: 0 };
        doctors[doctor].patients.add(patient);
        doctors[doctor].services++;
        doctors[doctor].revenue += amount;
      }

      if (service) {
        if (!services[service]) services[service] = { count: 0, revenue: 0, dept: department };
        services[service].count++;
        services[service].revenue += amount;
      }
    }

    return { patients, doctors, departments, services, totalRevenue };
  }

  #buildMarkdown(payor, data) {
    const { patients, doctors, departments, services, totalRevenue } = data;
    const fmt = this.#fmt.bind(this);
    const lines = [];

    // Overview
    lines.push('## Overview');
    lines.push(`- **Payor:** ${payor || 'ALL'}`);
    lines.push(`- **Unique Patients:** ${patients.size}`);
    lines.push(`- **Total Revenue:** ${fmt(totalRevenue)}`);
    lines.push(`- **Unique Doctors:** ${Object.keys(doctors).length}`);
    lines.push('');

    // Department breakdown
    lines.push('## Breakdown by Department');
    lines.push('| Department | No. of Tests | Business Value (₦) |');
    lines.push('|---|---|---|');
    Object.entries(departments)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .forEach(([dept, d]) => {
        lines.push(`| ${dept} | ${d.count} | ${fmt(d.revenue)} |`);
      });
    lines.push('');

    // Laboratory section
    const labEntries = Object.entries(services).filter(([, s]) => s.dept === 'LABORATORY');
    const labTotal = labEntries.reduce((acc, [, s]) => ({ count: acc.count + s.count, revenue: acc.revenue + s.revenue }), { count: 0, revenue: 0 });

    lines.push('## Laboratory Tests');
    lines.push(`**Total Laboratory Revenue:** ${fmt(labTotal.revenue)}`);
    lines.push('');

    // Doctors
    lines.push('## Referring Doctors');
    lines.push('| Doctor | No. of Patients | No. of Services | Total Amount (₦) |');
    lines.push('|---|---|---|---|');
    Object.entries(doctors)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .forEach(([name, d]) => {
        lines.push(`| ${name} | ${d.patients.size} | ${d.services} | ${fmt(d.revenue)} |`);
      });
    lines.push('');

    return lines.join('\n');
  }

  async #generate(rawData, prompt) {
    if (!prompt) throw new Error('prompt is required');

    const payor = this.#detectPayor(rawData, prompt);
    const data = this.#aggregate(rawData, payor);
    const tables = this.#buildMarkdown(payor, data);

    // Ask AI only for the written analysis
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        {
          role: 'user',
          content: `Payor: ${payor || 'ALL'} | Patients: ${data.patients.size} | Revenue: ${data.totalRevenue} | Doctors: ${Object.keys(data.doctors).length}\nTop doctor: ${Object.entries(data.doctors).sort((a,b) => b[1].revenue - a[1].revenue)[0]?.[0]}\nTop department: ${Object.entries(data.departments).sort((a,b) => b[1].revenue - a[1].revenue)[0]?.[0]}\n\nWrite the analysis.`,
        },
      ],
    });

    const analysis = completion.choices[0].message.content;
    const content = `${tables}\n## Summary and Analysis\n${analysis}`;

    const report = await reportRepository.saveReport(prompt, content);
    return { reportId: report.id, content };
  }
}

export default new ReportService();
