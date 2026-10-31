# Oswagolink - Localhost vs VPS Checklist

## PART 1: THE "LOCALHOST" SETUP (For your Windows PC)
Use exactly this code while you are building and testing on your laptop.

### 1. API Clients (All 3 apps)
Files:
- frontend/platform-panel/src/api/client.js
- frontend/tenant-panel/src/api/client.js
- frontend/portal/src/api/client.js
Code:
const API_URL = 'http://localhost:5001/api';

### 2. Router Basenames
Files:
- frontend/platform-panel/src/App.jsx
- frontend/tenant-panel/src/App.jsx
Code:
// Platform App.jsx
<BrowserRouter basename="/platform">

// Tenant App.jsx
<BrowserRouter basename="/tenant">

### 3. Impersonation Redirect (Platform to Tenant)
File: frontend/platform-panel/src/pages/TenantDetailPage.jsx
Code:
window.location.href = 'http://localhost:3001/tenant/';

### 4. End Impersonation Redirect (Tenant to Platform)
Files:
- frontend/tenant-panel/src/App.jsx
- frontend/tenant-panel/src/components/Layout.jsx (if it exists)
Code:
window.location.href = 'http://localhost:3002/platform/login';

### 5. Test Portal Link
File: frontend/tenant-panel/src/pages/RoutersPage.jsx
Code:
const portalUrl = `http://localhost:3000/portal/?router=${router.router_token}&mac=11:22:33:44:55:66`;

---

## PART 2: THE "VPS" SETUP (For your live server)
When you are 100% finished building a feature, change the files above to these exact lines before you run git push.

### 1. API Clients (All 3 apps)
Files:
- frontend/platform-panel/src/api/client.js
- frontend/tenant-panel/src/api/client.js
- frontend/portal/src/api/client.js
Code:
const API_URL = '/api';

### 2. Router Basenames
(Keep these exactly as they are for the VPS)
Code:
// Platform App.jsx
<BrowserRouter basename="/platform">

// Tenant App.jsx
<BrowserRouter basename="/tenant">

### 3. Impersonation Redirect (Platform to Tenant)
File: frontend/platform-panel/src/pages/TenantDetailPage.jsx
Code:
window.location.href = 'https://oswagolink.co.tz/tenant/';

### 4. End Impersonation Redirect (Tenant to Platform)
Files:
- frontend/tenant-panel/src/App.jsx
- frontend/tenant-panel/src/components/Layout.jsx
Code:
window.location.href = 'https://oswagolink.co.tz/platform/login';

### 5. Test Portal Link
File: frontend/tenant-panel/src/pages/RoutersPage.jsx
Code:
const portalUrl = `https://oswagolink.co.tz/portal/?router=${router.router_token}&mac=11:22:33:44:55:66`;

---

## DEPLOYMENT WORKFLOW

1. Ensure code matches PART 2.

2. Push to GitHub:
git add .
git commit -m "Deploy feature to VPS"
git push origin main

3. SSH into VPS and pull code:
ssh biliant@69.62.105.119
cd ~/WI-FI
git pull

4. Restart backend (if backend was changed):
cd ~/WI-FI/backend
pm2 restart wifi-backend

5. Rebuild Frontends (if frontend was changed):
cd ~/WI-FI/frontend/tenant-panel
npm run build
sudo cp -r dist/. /var/www/wifi-app/tenant/

cd ~/WI-FI/frontend/platform-panel
npm run build
sudo cp -r dist/. /var/www/wifi-app/platform/

cd ~/WI-FI/frontend/portal
npm run build
sudo cp -r dist/. /var/www/wifi-app/portal/

6. IMPORTANT: Change the files back to PART 1 on your laptop so you can continue developing locally.