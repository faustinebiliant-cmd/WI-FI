# Oswagolink VPS Handbook

Everything on the VPS, part by part: what it is, what it does, where it lives, what it
stores, what is secret, what to renew and when, and what never to touch.
Plain English, **no secret values** in this file.

Related guides (all in the project root):
- `OWNER-CHECKUP-GUIDE.md`: daily, weekly and monthly checks, emergencies, message list
- `HOW-VPS-CONTROLS-ROUTERS.md`: the router tunnel and router control in detail
- `SECURITY-STATUS.md`: what protects the system, what is still open
- Admin panel, Router Setup Guide: how to set up a router

Last updated: 4 November 2026

---

## 1. The VPS at a glance

| Item | Value |
|---|---|
| Provider and plan | Hostinger KVM 1 (paid until 19 October 2028, auto-renew on) |
| Hardware | 1 CPU, 3.8 GB memory, 2 GB swap, 48 GB disk |
| System | Ubuntu 26.04.1 LTS |
| Name / address | `srv2076152` / `69.62.105.119` |
| Your login | `biliant` (has `sudo`); logging in as `root` over SSH is switched off |
| Clock | UTC (Tanzania = UTC + 3 hours), kept exact automatically |
| Websites | `oswagolink.co.tz` (portal, business panel, landing page), `admin.oswagolink.co.tz` (admin panel, device pass needed) |

### What runs on it, and how the pieces connect
```
 Internet
    |
    |  only 4 doors open (firewall): 22 SSH, 80 + 443 websites, 51820 router tunnel
    v
 +--------------------------------------------------------------------------------+
 | VPS                                                                            |
 |                                                                                |
 |  SSH (22) + fail2ban ............... your login (key or password)              |
 |                                                                                |
 |  Nginx (80, 443) ......... websites, padlock, safety rules, device passes      |
 |     |-- files: /var/www/wifi-app/  (portal, tenant, platform)                  |
 |     |-- /api/  -->  Backend on 127.0.0.1:5001 (inside the VPS only)            |
 |                        |                                                       |
 |                        |-- PostgreSQL on 127.0.0.1:5432 (inside only)          |
 |                        |-- routers, through the WireGuard tunnel (wg0)         |
 |                                                                                |
 |  WireGuard (51820) ....... one private tunnel per router (10.20.0.X)           |
 |  Automatic jobs .......... backups, clean-up, certificates, updates, logs      |
 +--------------------------------------------------------------------------------+
```

---

## 2. Access: SSH and fail2ban

**What it is:** SSH is the remote control of the VPS: the black window where you type commands.
fail2ban is a guard that blocks internet addresses that guess passwords.

| Thing | Where | Notes |
|---|---|---|
| SSH program | `sshd`, port 22 | Your PC logs in with its **key**; your password also works (your choice, for now) |
| Our SSH rules | `/etc/ssh/sshd_config.d/00-oswagolink.conf` (copy: `vps/sshd-00-oswagolink.conf`) | Root cannot log in; only `biliant`; 3 tries per connection; remote screens (X11) off |
| Keys allowed to log in | `~/.ssh/authorized_keys` | Holds your PC's **public** key. Adding a line here lets that key in, so only add your own |
| fail2ban settings | `/etc/fail2ban/jail.d/oswagolink-sshd.local` (copy: `vps/fail2ban-oswagolink-sshd.local`) | 5 wrong passwords in 10 minutes: that address banned 1 hour, doubling for repeat robots (up to 1 week). Only SSH is blocked; websites keep working |
| Login records | system journal (`journalctl -u ssh`), `/var/log/auth.log` | Who logged in, failed tries |

**Locked out?** Usually a ban on your home address: wait 1 hour, or switch your PC to phone data,
log in, then `sudo fail2ban-client set sshd unbanip YOUR.HOME.IP`. Real emergency: the **VNC
console** in Hostinger's hPanel works without SSH.

**Later (when you are ready):** switch password login off (keys only): one line in
`00-oswagolink.conf`, then test from a new window before closing the old one.

---

## 3. Firewall (ufw)

**What it is:** decides which doors of the VPS the internet may knock on. Everything else is refused.

| Door (port) | For | Status |
|---|---|---|
| 22 / tcp | SSH | Open (protected by fail2ban and the SSH rules) |
| 80 / tcp | Websites (only redirects to HTTPS) | Open |
| 443 / tcp | Websites with the padlock | Open |
| 51820 / udp | Router tunnel (WireGuard) | Open (only routers with the right key get in) |
| 5001 | Backend | **Never open**: only Nginx uses it, inside the VPS |
| 5432 | Database | **Never open**: only the backend uses it, inside the VPS |
| 8728 | Router API (on the routers) | **Never open**: only through the tunnel |

Check: `sudo ufw status verbose`. The VPS also does **not** pass traffic between routers
(`ip_forward = 0`), so one router can never reach another.

---

## 4. Nginx: the websites

**What it is:** the program that answers every visitor. It serves the website files, puts the
padlock (HTTPS) on everything, adds browser safety rules, checks admin device passes, and passes
`/api/` requests to the backend.

### 4a. Its settings files
| File | What it does |
|---|---|
| `/etc/nginx/nginx.conf` | Main settings (Ubuntu's). We changed one line: `server_tokens off` (Nginx no longer shows its version) |
| `/etc/nginx/sites-available/wifi-app` (switched on in `sites-enabled/`) | **oswagolink.co.tz**: sends http to https; `/api/` to the backend; `/` landing page; `/portal/` customer portal; `/tenant/` business panel; `/platform` forwards to the admin site; the Google verification file; any other address forwards to the portal |
| `/etc/nginx/sites-available/oswagolink-admin` (switched on) | **admin.oswagolink.co.tz**: the admin panel files and `/api/`, only for devices with a device pass; no-index, no-framing rules |
| `/etc/nginx/conf.d/wifi-performance.conf` (copy: `vps/nginx-wifi-performance.conf`) | Faster loading: HTTP/2, compression, browser caching (files in `/assets/` kept a year, pages checked every time) |
| `/etc/nginx/conf.d/wifi-security-headers.conf` (copy: `vps/nginx-security-headers.conf`) | The values of the browser safety rules for the main site |
| `/etc/nginx/snippets/oswagolink-page-headers.conf` (copy: `vps/nginx-page-headers-snippet.conf`) | Sends those safety rules (no framing, no type guessing, referrer rule, HTTPS-only) |
| `/etc/nginx/conf.d/oswagolink-admin-devices.conf` and `/etc/nginx/snippets/oswagolink-admin-devices.conf` | Made by `wifi-admin-device`: the list of allowed device passes. **Do not edit by hand** |

There is no default "Welcome to nginx" site any more: a visit to the bare address
`69.62.105.119` gets "404 Not Found".

### 4b. The website files
| Folder | Contents |
|---|---|
| `/var/www/wifi-app/portal/` | Customer portal (built from `frontend/portal`) |
| `/var/www/wifi-app/tenant/` | Business panel (from `frontend/tenant-panel`), plus `landing.html` and the Google verification file |
| `/var/www/wifi-app/platform/` | Admin panel (from `frontend/platform-panel`) |

These are **copies** made by `npm run build` + `sudo cp`. Never edit them directly: change the
project, push, and rebuild.

### 4c. The padlock (HTTPS certificates)
| Thing | Where |
|---|---|
| Certificates and their private keys | `/etc/letsencrypt/` (root only). **Secret: never copy or share** |
| Renewal | Automatic: `/etc/cron.d/certbot-renew`, twice a day (03:17 and 15:17 UTC = 06:17 and 18:17 Tanzania); certificates last 90 days and renew about 30 days before |
| Check | `sudo certbot certificates` (every 3 months, guide step 6b) |

### 4d. What Nginx records
| Log | Contents | Kept |
|---|---|---|
| `/var/log/nginx/access.log` | Every visit: address, time, page, result code | Rotated automatically (old ones compressed, then deleted) |
| `/var/log/nginx/error.log` | Problems (see guide step 4e for which lines matter) | Same |

### 4e. Safe way to change Nginx (only with Claude's commands)
1. Make the change.
2. `sudo nginx -t`: must say **test is successful**. If not, do **not** reload: the website keeps
   running on the old settings.
3. `sudo systemctl reload nginx`.
4. Check the sites (`curl` lines Claude gives you). The first check right after a reload can still
   show the old answer: run it once more.

---

## 5. The backend (the program that does all the work)

| Thing | Value |
|---|---|
| Program | Node.js, run by **PM2** under the name `wifi-backend` (PM2 restarts it if it stops; it starts by itself after a reboot) |
| Code | `~/WI-FI/backend/` (from GitHub) |
| Listens on | `127.0.0.1:5001`: only Nginx can reach it |
| Settings | `~/WI-FI/backend/.env` (**secret**, details in section 9) |
| Logs | `pm2 logs wifi-backend` (files in `~/.pm2/logs/`, rotated by `pm2-logrotate`) |
| Health | `curl -s https://oswagolink.co.tz/api/health` gives `"status":"ok"` |

**What it runs by itself:**
| Job | When |
|---|---|
| Voucher expiry | every 15 seconds |
| Who-is-online check with the routers | every minute |
| Router online/offline check | every 5 minutes |
| History clean-up (deletes ended sessions and vouchers older than 1 month) | every night 23:00 UTC (02:00 Tanzania), and 2 minutes after each restart |

**Useful commands:** `pm2 status`, `pm2 restart wifi-backend`,
`pm2 logs wifi-backend --err --lines 30 --nostream`.

**Updating** (when Claude pushes): `cd ~/WI-FI && git pull`, then the steps Claude gives
(database change first if any, `pm2 restart wifi-backend`, rebuild a panel if needed).

---

## 6. The database (PostgreSQL)

| Thing | Value |
|---|---|
| Database | `wifi_app` |
| Listens on | localhost only (`127.0.0.1` / `::1`) |
| The app's login | user `wifi_app`, **not** an administrator, password in `.env` |
| Administrator | the system user `postgres`, only from inside the VPS (`sudo -u postgres psql -d wifi_app`) |
| Data files | `/var/lib/postgresql/` (root/postgres only). **Never touch** |
| Settings | Memory tuned for this VPS: shared_buffers 768 MB, effective_cache_size 2 GB, work_mem 8 MB, maintenance_work_mem 128 MB, random_page_cost 1.1 (copy: `vps/wifi-db-memory.sql`) |
| Monitoring | Slow requests (over 300 ms) written to its log; `pg_stat_statements` keeps a list of the busiest requests (report: `vps/wifi-db-slow-report.sql`, guide step 5a) |
| Logs | `/var/log/postgresql/` (guide step 4e for which lines matter) |
| Structure | `Database/schema.sql` + `Database/migrations/` in the project |

**What it stores:** businesses, owner logins (passwords scrambled with bcrypt), routers (with their
encrypted API passwords and one-time setup codes), packages, vouchers, sessions (customers' device
MAC and IP), payments, impersonation records, admin audit logs.

**Never share** the result of `SELECT *` on `tenant_users` or `routers`. Counting (`SELECT COUNT(*)`)
or looking at a few safe columns is fine.

---

## 7. Backups

| Thing | Value |
|---|---|
| Who makes them | `/usr/local/sbin/wifi-db-backup` (copy: `vps/wifi-db-backup`) |
| When | Every night 00:00 UTC (03:00 Tanzania): `/etc/cron.d/wifi-db-backup` |
| Where | `/var/backups/wifi-db/wifi_app_YYYY-MM-DD_0000.dump` (root only) |
| Kept | The last **14 nights** (older ones are deleted automatically) |
| What is inside | The **whole database** (all data, including secrets): **never share a backup file** |
| Proven | Practice restore done 2 November 2026 (repeat every 3 months, guide step 6a) |
| Off the VPS | Not automatic yet: copy one to your PC every month (guide step 5c). Hostinger also keeps a weekly copy of the whole VPS |

**Restoring for real replaces the live data: always ask Claude first.**

---

## 8. The router tunnel (WireGuard), in short

Full explanation: `HOW-VPS-CONTROLS-ROUTERS.md`.

| Thing | Where |
|---|---|
| Tunnel settings | `/etc/wireguard/wg0.conf` (root only): the VPS's key and every router's public key + address |
| The VPS's own tunnel keys | `/etc/wireguard/server_private.key` (**secret**) and `server_public.key` (public) |
| Helpers that add / remove routers | `/usr/local/sbin/wifi-wireguard-add-peer`, `wifi-wireguard-remove-peer` (copies in `vps/`); the backend may run only these two with `sudo` |
| Emergency key for a router's staff door | `~/WI-FI/backend/scripts/routerStaffDoor.js` |

**Never edit `wg0.conf` by hand.** Each router deletion leaves a backup copy
`wg0.conf.before-remove.<date>` (holds the private key, root only): delete old ones now and then
(`sudo ls /etc/wireguard/`).

---

## 9. Every secret on the VPS

| Secret | Where | Who can read it | If it leaked | If it must be changed |
|---|---|---|---|---|
| Your `biliant` password | system | nobody (stored scrambled) | Someone could log in over SSH and use sudo | `passwd` (choose a long, unique one) |
| Your PC's SSH **private** key | on your **PC** only (`~/.ssh/`), never on the VPS | you | Someone could log in as you | Make a new key, replace the line in `~/.ssh/authorized_keys` (ask Claude) |
| `DB_PASSWORD` (in `.env`) | `~/WI-FI/backend/.env` | `biliant` only | Database readable from inside the VPS | Change it in PostgreSQL **and** in `.env`, restart (ask Claude) |
| `JWT_SECRET`, `ADMIN_JWT_SECRET` (in `.env`) | same | same | Someone could make fake logins | Put new random values, restart: everyone simply logs in again |
| `ROUTER_ENCRYPTION_KEY` (in `.env`) | same | same | Router API passwords could be unlocked | **Never just change it**: every router password would become unreadable. Ask Claude for a planned change |
| `ADMIN_HOST`, `ALLOWED_ORIGINS`, `NODE_ENV`, `PORT`, `ROUTER_MODE`, `DB_*` names, `JWT_EXPIRES_IN` (in `.env`) | same | same | Not secret, but part of the same file | Only with Claude's instructions |
| VPS tunnel private key | `/etc/wireguard/server_private.key` and inside `wg0.conf` | root only | Someone could pretend to be the VPS to routers | Every router would need new settings: only if it really leaked |
| HTTPS certificate keys | `/etc/letsencrypt/` | root only | Someone could pretend to be your website | `certbot` can replace them (ask Claude) |
| Device pass office key | `/etc/nginx/admin-devices/ca.key` | root only | Someone could make their own admin device passes | Rebuild the pass office and give new passes to your devices (ask Claude) |
| Device passes | installed on your laptop and phone (`.p12` files); delete the `.p12` copies from the VPS home folder once installed | you | That device's access to the admin panel | `sudo wifi-admin-device remove NAME`, then `add NAME` for a new one |
| Database backups | `/var/backups/wifi-db/` | root only | The whole database | Not changeable: protect them |
| Router API passwords | in the database, **encrypted** | the backend | Little alone (they only work through the tunnel) | Made per router at setup |
| Router setup codes | in the database, 30 minutes, single use | the backend | A router slot could be hijacked within those 30 minutes | They expire by themselves |

**Never put any of these in chat, GitHub, email, screenshots, or another AI.** You may tell Claude
whether a setting is **set**, or how **long** it is, never its value.

---

## 10. Automatic jobs (you do nothing)

| Job | When (Tanzania time) | Set up in |
|---|---|---|
| Voucher expiry, online checks | every 15 seconds / 1 minute / 5 minutes | the backend |
| History clean-up | 02:00 every night | the backend |
| Database backup | 03:00 every night | `/etc/cron.d/wifi-db-backup` |
| Certificate renewal check | 06:17 and 18:17 | `/etc/cron.d/certbot-renew` |
| Ubuntu security updates | daily | Ubuntu (unattended upgrades) |
| Log rotation | daily | Ubuntu (logrotate) and `pm2-logrotate` |
| Clock correction | always | Ubuntu (time sync) |
| fail2ban guard | always | `fail2ban` service |
| Restart the backend if it stops, start it after a reboot | always | PM2 (`pm2-biliant` service) |

---

## 11. Calendar: what to renew, update or check, and when

| When | What | How |
|---|---|---|
| Daily (1 min) | Backend running, routers online | Guide section 3 |
| Weekly (5 min) | Backups, memory, disk, errors, the other logs, fail2ban and SSH rules | Guide section 4 |
| Monthly (15 min) | Speed report, **Ubuntu updates** (`sudo apt update && sudo apt upgrade`, reboot at a quiet time if asked), **copy a backup to your PC**, business subscriptions | Guide section 5 |
| Monthly | Delete old `wg0.conf.before-remove.*` copies, if routers were deleted | Section 8 |
| Every 3 months | **Practice restore**, certificate check | Guide section 6 |
| Every year (suggested) | Change your `biliant` password and the admin panel password | `passwd`; admin password with Claude |
| When MikroTik offers a new **long-term** RouterOS | Update routers one at a time (not the "testing" versions) | Winbox: System > Packages |
| On a calm day (planned) | Vite upgrade in the 3 apps (clears the "5 vulnerabilities" note) | With Claude, never `npm audit fix --force` |
| When you are ready | SSH keys only (password login off) | Section 2 |
| Before **31 October 2028** | **Renew the admin device passes** (they last 2 years), or the admin panel locks you out | `sudo wifi-admin-device add NAME` for each device (ask Claude) |
| Before **19 October 2028** | Hostinger renewal (auto-renew on: keep the payment card valid) | hPanel |
| Before your **domain expiry date** (write it in the guide, section 10) | Renew `oswagolink.co.tz`, or everything goes offline | Your domain seller |
| Around **2036** | The device pass office itself expires (10 years) | Ask Claude well before |

---

## 12. Never do this

- **Never open ports 5001, 5432 or 8728** in the firewall.
- **Never edit by hand:** `/etc/wireguard/wg0.conf`, the device-pass files Nginx uses,
  `/var/lib/postgresql/`, or the website folders in `/var/www/wifi-app/`.
- **Never change `ROUTER_ENCRYPTION_KEY`** without a planned change.
- **Never re-enable root login**, remove fail2ban, or delete `00-oswagolink.conf`.
- **Never run `npm audit fix --force`.**
- **Never restore a backup** without Claude.
- **Never share:** `.env`, backups, `SELECT *` from `tenant_users` or `routers`, private keys,
  device pass files, router setup commands.
- **Never reload Nginx** after `nginx -t` failed.
- **Never run commands from other AIs or websites** that delete, restore or change settings without
  asking Claude first. Reading commands (`ls`, `cat` of non-secret files, `status`, `df`, `free`) are fine.

---

## 13. When something goes wrong

| What you see | First step | Then |
|---|---|---|
| Websites do not open | `pm2 status` (must be `online`); if not: `pm2 restart wifi-backend` | `sudo systemctl status nginx postgresql --no-pager`, send Claude a screenshot |
| "502 Bad Gateway" | The backend is down: `pm2 restart wifi-backend` | `pm2 logs wifi-backend --err --lines 50 --nostream` to Claude |
| Admin panel says 403 on your own device | Its device pass is missing or expired | `sudo wifi-admin-device list`, ask Claude |
| SSH refused | Probably a fail2ban ban (section 2) | VNC console in hPanel |
| Disk almost full (`df -h /` above 80%) | Tell Claude | Usually old logs or backups |
| VPS does not answer at all | hPanel: is the VPS running? | Hostinger support |
| Router problems | `HOW-VPS-CONTROLS-ROUTERS.md` section 7 | |

---

## 14. Map: where everything lives

| Thing | On the VPS | Copy / source in the project |
|---|---|---|
| SSH rules | `/etc/ssh/sshd_config.d/00-oswagolink.conf` | `vps/sshd-00-oswagolink.conf` |
| fail2ban | `/etc/fail2ban/jail.d/oswagolink-sshd.local` | `vps/fail2ban-oswagolink-sshd.local` |
| Nginx main settings | `/etc/nginx/nginx.conf` | (Ubuntu's file, one line changed) |
| Main website | `/etc/nginx/sites-available/wifi-app` | (on the VPS only) |
| Admin website | `/etc/nginx/sites-available/oswagolink-admin` | `vps/nginx-admin-site.conf` (first version) |
| Speed settings | `/etc/nginx/conf.d/wifi-performance.conf` | `vps/nginx-wifi-performance.conf` |
| Browser safety rules | `/etc/nginx/conf.d/wifi-security-headers.conf`, `/etc/nginx/snippets/oswagolink-page-headers.conf` | `vps/nginx-security-headers.conf`, `vps/nginx-page-headers-snippet.conf` |
| Device passes | `/etc/nginx/admin-devices/`, tool `/usr/local/sbin/wifi-admin-device` | `vps/wifi-admin-device` |
| Certificates | `/etc/letsencrypt/`, `/etc/cron.d/certbot-renew` | `vps/certbot-renew.cron` |
| Website files | `/var/www/wifi-app/{portal,tenant,platform}` | `frontend/` (built) |
| Backend | `~/WI-FI/backend/`, PM2 `wifi-backend` | `backend/` |
| Backend settings | `~/WI-FI/backend/.env` | (secret, not in the project) |
| Database | PostgreSQL `wifi_app` | `Database/` |
| Database tuning | inside PostgreSQL | `vps/wifi-db-memory.sql`, `vps/wifi-db-monitoring.sql` |
| Backups | `/var/backups/wifi-db/`, `/usr/local/sbin/wifi-db-backup`, `/etc/cron.d/wifi-db-backup` | `vps/wifi-db-backup`, `vps/wifi-db-backup.cron` |
| Swap (memory safety net) | `/swapfile` (2 GB) | `vps/wifi-add-swap` |
| Router tunnel | `/etc/wireguard/`, helpers in `/usr/local/sbin/` | `vps/wifi-wireguard-*` |
| Logs | `/var/log/nginx/`, `/var/log/postgresql/`, `~/.pm2/logs/`, system journal | |
