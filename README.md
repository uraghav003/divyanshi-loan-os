# divyanshi-loan-os
Divyanshi Capital Loan OS — Enterprise RM Operating System (React + Express + Google Apps Script + Gemini AI). Internal project — contains business logic; keep PRIVATE.

## Login

JWT-based email/password auth.

- `server/` — Express API. Copy `server/.env.example` to `server/.env`, set `JWT_SECRET`, then:
  ```
  cd server && npm install
  node utils/seed.js you@company.com yourpassword "Your Name" admin
  npm run dev
  ```
- `client/` — React (Vite) app with a login page and protected dashboard route:
  ```
  cd client && npm install
  npm run dev
  ```

The client dev server proxies `/api` requests to the Express server on port 4000.
