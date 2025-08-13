# Tenkasi District Administration

Digital Petition Redressal Mechanism

## Overview
This app enables citizens to file Petitions or Civic Complaints, track their status, and allows officials to manage and resolve them. It includes:

- Petition vs Civic Complaint submission with Taluk → Firka → Village location
- Weekly rate-limiting (one submission per phone per 7 days)
- Photo uploads for Civic Complaints
- Inline preview and acknowledgement (print/download) after submission
- Tracking by Phone Number + Reference ID
- DC/DM read-only access via PIN with filters
- Official login with filters, status updates, and response/acknowledgement notes
- Bilingual UI toggle (English / தமிழ்)
- Node/Express API with PostgreSQL storage
- Render Blueprint for one-click deploy (web + database)

## Quick Start (Local)
Prerequisites: Node 18+, PostgreSQL

1) Clone and configure env
```bash
cp .env.example .env
# Set DATABASE_URL in .env (e.g. postgresql://USER:PASSWORD@HOST:5432/DB)
```

2) Install and run
```bash
npm install
npm start
# Open http://localhost:3000
```

3) Database
- On boot, the server creates tables `submissions` and `officials` if they do not exist.
- A default Official user is seeded: username “Tenkasi Admin” and password “efvhuytgbnmki493401”. Change this in DB for production.

## Deploy to Render (Blueprint)
This repo includes `render.yaml`.

1) On Render, click New → Blueprint → select this repository
2) Review and Create
3) Render provisions:
   - Web Service: Node, build `npm install`, start `npm start`, health `/health`
   - PostgreSQL: `tenkasi-db` with `DATABASE_URL` wired automatically
4) Open the service URL

Environment variables
- `DATABASE_URL`: set by Blueprint to the Render Postgres connection string
- `PGSSLMODE`: `require` (set in render.yaml)
- `PORT`: optional (default 3000)

## Credentials (Demo)
- DC/DM PIN: `qdguckebg461293`
- Official Login:
  - Username: `Tenkasi Admin`
  - Password: `efvhuytgbnmki493401`

Note: These are demo credentials. Change them for production use.

## Using the App

### Citizen
- File Petition/Complaint: choose type, provide details, select Taluk → Firka → Village
- Phone number is required; one submission per 7 days per phone
- Civic Complaints can include photos (stored with the record)
- After submission: inline preview shows Reference ID and a Download Acknowledgement button (print/save PDF)
- Track: use the header “Track Petition/Complaint”, then enter Phone Number + Reference ID to view and download acknowledgement

### DC/DM
- Use the DC/DM Login (PIN only)
- Read-only list of petitions/complaints with filters (type, status, location, search)

### Officials
- Login with username/password
- Filter by type/status/location or search
- Update status (Complaint: In Progress, Rejected, Resolved; Petition: In Progress, Validating, Accepted, Resolved)
- Add an acknowledgement/response note (gets appended to the record description)
- Download acknowledgement for any record

## API (Server)
Base URL: `/`

- Health
  - GET `/health` → `{ ok: true }`

- Create submission
  - POST `/api/submissions`
  - Body (example):
    ```json
    {
      "id": "CMP12345678",
      "type": "complaint", // or "petition"
      "name": "John Doe",
      "phone": "+919876543210",
      "email": "john@example.com",
      "category": "water-supply", // for complaints
      "department": null,         // for petitions
      "taluk": "Tenkasi",
      "firka": "Tenkasi",
      "village": "Melagaram",
      "description": "Description...",
      "urgency": "high",
      "status": "pending",
      "photos": ["data:image/png;base64,..."]
    }
    ```

- List submissions (filters optional)
  - GET `/api/submissions?type=&status=&category=&department=&taluk=&firka=&village=&q=`

- Lookup by ID + phone (citizen tracking)
  - GET `/api/submissions/lookup?id=CMP12345678&phone=+919876543210`

- Update status (officials)
  - POST `/api/submissions/:id/status`
  - Body: `{ "status": "in-progress", "response": "Acknowledgement/Response text" }`

- Auth
  - POST `/api/auth/dcdm` → `{ pin }`
  - POST `/api/auth/official` → `{ username, password }`

## Internationalization (i18n)
- Language toggle in the header (right): English / தமிழ்
- Add new strings in `index.html` `I18N` object and set `data-i18n` attributes on elements

## Notes & Production Hardening
- Passwords are stored in plaintext for demo; use hashing (bcrypt/argon2) in production
- Replace localStorage rate limiting with server-side controls if needed
- Photo uploads are stored as base64 in DB; consider object storage (e.g., S3) and store URLs for scale
- Add authentication/session/JWT for admin endpoints in production

## Project Structure
- `index.html` – Frontend UI (single page)
- `server/index.js` – Node/Express API and static hosting
- `server/db.sql` – Schema
- `render.yaml` – Render blueprint (web + database)
- `.env.example` – Environment template

## License
For demonstration purposes only. Adapt and secure for production before use.