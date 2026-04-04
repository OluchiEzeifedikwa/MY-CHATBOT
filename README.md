# MeshAI

A full-stack AI platform with two features:
- **Chat Assistant** — medical Q&A chatbot powered by Llama 3.3
- **AB4 Sales Reports** — upload hospital sales data and generate structured AI reports

Built with Node.js, Express, Prisma (PostgreSQL), and Groq.

---

## Features

| Feature | Description |
|---|---|
| Medical Chat | Conversational Q&A with session history |
| AB4 Report Generation | Upload CSV/Excel, get a full sales report |
| Google Sheet Support | Generate reports directly from a Sheet URL |
| Dark UI | Served at `/` — no separate frontend needed |

---

## Requirements

- Node.js 18+
- PostgreSQL database
- [Groq API key](https://console.groq.com)
- Google Service Account (only if using Google Sheets)

---

## Setup

### Option A — Docker (recommended)

**1. Create a `.env` file**
```env
GROQ_API_KEY=your_groq_api_key

# Optional — defaults to "medassist" if not set
POSTGRES_USER=medassist
POSTGRES_PASSWORD=medassist
POSTGRES_DB=medassist

# Only needed for Google Sheets feature
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**2. Build and start**
```bash
docker compose up --build
```

The app and database start together. Migrations run automatically on startup.

**3. Open the app**

Visit `http://localhost:3000`

**Other useful commands**
```bash
docker compose up -d          # run in background
docker compose down           # stop containers
docker compose down -v        # stop and delete database volume
docker compose logs -f app    # follow app logs
```

---

### Option B — Manual

**1. Install dependencies**
```bash
npm install
```

**2. Create a `.env` file**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/medassist
GROQ_API_KEY=your_groq_api_key

# Only needed for Google Sheets feature
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**3. Run database migrations**
```bash
npx prisma migrate deploy
```

**4. Start the server**
```bash
node server.js
```

**5. Open the app**

Visit `http://localhost:3000`

---

## API Endpoints

### Chat

| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/chat/session` | — |
| POST | `/api/chat/message` | `{ sessionId, message }` |
| GET | `/api/chat/history/:sessionId` | — |

### Reports

| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/report/upload` | `multipart/form-data` — `file` + `prompt` |
| POST | `/api/report/google-sheet` | `{ url, prompt }` |
| GET | `/api/report/:id` | — |

---

## Supported File Formats

| Format | Works |
|---|---|
| Excel `.xlsx` / `.xls` | ✅ |
| CSV `.csv` | ✅ |
| PDF `.pdf` | ⚠️ Limited — PDF text is unstructured and may not parse correctly |

> **Recommendation:** Export your data as Excel or CSV for best results.

---

## Data Structure Expected

The report engine expects columns in this order:

```
Patient Name | Department | Doctor | AB4 | (empty) | Service/Test | Amount
```

Rows where the payor column is not `AB4` are automatically ignored.

---

## Project Structure

```
├── controllers/        # Request handlers
├── services/           # Business logic
├── repositories/       # Database queries
├── routes/             # Express routers
├── lib/
│   ├── parsers/        # CSV, Excel, PDF, Google Sheet parsers
│   └── prisma.js       # Prisma client
├── middleware/         # File upload, error handler
├── prisma/
│   └── schema.prisma   # Database schema
├── public/
│   └── index.html      # Frontend UI
└── server.js           # Entry point
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `GROQ_API_KEY` | ✅ | Groq API key for LLM |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional | For Google Sheets |
| `GOOGLE_PRIVATE_KEY` | Optional | For Google Sheets |
