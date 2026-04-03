import Groq from 'groq-sdk';
import reportRepository from '../repositories/report.repository.js';
import { parseCSV } from '../lib/parsers/csv.parser.js';
import { parseExcel } from '../lib/parsers/excel.parser.js';
import { parsePDF } from '../lib/parsers/pdf.parser.js';
import { parseGoogleSheet } from '../lib/parsers/googlesheet.parser.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a sales report analyst. You will receive a pre-aggregated AB4 sales summary.
Using the provided summary data, generate a clear, well-structured markdown report that includes:

1. An overview section with key metrics (unique patients, total services, total revenue, number of doctors).
2. A breakdown table of services/tests by Department.
3. A referring doctors table in descending order by revenue: Doctor | No. of Patients | No. of Services | Total Amount (₦).
4. A top services/tests table by revenue: Service | Count | Total Amount (₦).
5. A written summary and analysis of AB4 sales performance.

Use only the numbers provided — do not invent or estimate any figures.
Use markdown formatting for all tables and sections.
Format all monetary amounts with the ₦ symbol and comma separators (e.g. ₦181,500).`;

class ReportService {
  async generateFromFile(file, prompt) {
    const rawData = await this.#parseFile(file);
    return this.#generate(rawData, prompt);
  }

  async generateFromGoogleSheet(url, prompt) {
    const rawData = await parseGoogleSheet(url);
    return this.#generate(rawData, prompt);
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

  #aggregateAB4Data(rawData) {
    const lines = rawData.split('\n').filter((l) => l.trim());

    const patients = new Set();
    const doctors = {};
    const departments = {};
    const services = {};
    let totalRevenue = 0;
    let totalServices = 0;

    for (const line of lines) {
      const cols = this.#parseCSVLine(line);
      const ab4Idx = cols.findIndex((c) => c.trim().toUpperCase() === 'AB4');
      if (ab4Idx === -1) continue;

      const patient = cols[0]?.trim();
      const department = cols[1]?.trim().toUpperCase();
      const doctor = cols[2]?.trim();
      const service = cols[ab4Idx + 2]?.trim();
      const amountRaw = cols[cols.length - 1]?.trim().replace(/[,₦\s]/g, '');
      const amount = parseFloat(amountRaw) || 0;

      if (patient) patients.add(patient);
      totalRevenue += amount;
      totalServices++;

      if (department) departments[department] = (departments[department] || 0) + 1;

      if (doctor) {
        if (!doctors[doctor]) doctors[doctor] = { patients: new Set(), services: 0, revenue: 0 };
        doctors[doctor].patients.add(patient);
        doctors[doctor].services++;
        doctors[doctor].revenue += amount;
      }

      if (service) {
        if (!services[service]) services[service] = { count: 0, revenue: 0 };
        services[service].count++;
        services[service].revenue += amount;
      }
    }

    const fmt = (n) => `₦${n.toLocaleString('en-NG')}`;

    const deptRows = Object.entries(departments)
      .sort((a, b) => b[1] - a[1])
      .map(([dept, count]) => `${dept} | ${count}`)
      .join('\n');

    const doctorRows = Object.entries(doctors)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, d]) => `${name} | ${d.patients.size} | ${d.services} | ${fmt(d.revenue)}`)
      .join('\n');

    const serviceRows = Object.entries(services)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([svc, s]) => `${svc} | ${s.count} | ${fmt(s.revenue)}`)
      .join('\n');

    return `AB4 AGGREGATED SUMMARY
- Unique patients: ${patients.size}
- Total services: ${totalServices}
- Total revenue: ${fmt(totalRevenue)}
- Unique doctors: ${Object.keys(doctors).length}

DEPARTMENTS (Dept | Count):
${deptRows}

DOCTORS (Doctor | Patients | Services | Revenue):
${doctorRows}

TOP SERVICES (Service | Count | Revenue):
${serviceRows}`;
  }

  async #generate(rawData, prompt) {
    if (!prompt) throw new Error('prompt is required');

    const aggregatedSummary = this.#aggregateAB4Data(rawData);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Here is the AB4 aggregated sales summary:\n\n${aggregatedSummary}\n\nGenerate a report that covers: ${prompt}`,
        },
      ],
    });

    const content = completion.choices[0].message.content;

    const report = await reportRepository.saveReport(prompt, content);

    return { reportId: report.id, content };
  }
}

export default new ReportService();
