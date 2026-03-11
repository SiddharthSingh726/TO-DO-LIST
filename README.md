# TaskFlow Pro Deployment Guide

This project is ready to deploy as a **single Node web service** so shared login works across browsers/devices.

## Local Run

1. Open terminal in the project folder.
2. Run:
   ```bash
   npm start
   ```
3. Open:
   - http://localhost:3000

## Deploy via GitHub + Render (Recommended)

### 1. Push to GitHub

```bash
git add .
git commit -m "Prepare Render deployment"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Deploy on Render using Blueprint

1. In Render dashboard, click **New +** -> **Blueprint**.
2. Connect your GitHub repo.
3. Render will detect [render.yaml](render.yaml).
4. Click **Apply**.

This creates:

- Node web service
- Persistent disk mounted at `/var/data`
- `DB_FILE=/var/data/taskflow-db.json` for shared user/state storage

### 3. Verify

After deployment, open your Render URL and test:

1. Register user in browser A.
2. Login with same user in browser B/device.
3. Confirm same account and synced task data.

## Important Notes

- Deploying only static [index.html](index.html) on GitHub Pages will **not** run [server.js](server.js), so shared login will not work there.
- Keeping frontend + backend on the same Render service avoids CORS issues.
- The persistent disk is required so users/data survive restarts and new deploys.
