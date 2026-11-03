# Oswagolink: Owner's Check-up Guide

Your guide for keeping Oswagolink healthy. No programming knowledge needed:
copy each command, paste it into the VPS window, and compare what you see
with **"Good looks like"**. When something does not match, take a screenshot
and send it to Claude (check the safety rules first).

Last updated: 2 November 2026

---

## 0. Before every check-up: connect to the VPS

In Windows PowerShell on your PC:

```
ssh biliant@69.62.105.119
cd ~/WI-FI
```

- `sudo` asks for **your VPS password**. The screen stays blank while you
  type it; that is normal. Press Enter.
- The line must start with `biliant@srv2076152`. Your PC logs in with its key
  (no password asked). Logging in as `root` over SSH is switched off on purpose:
  use `biliant` and `sudo` (same power).
- Typing your password wrong 5 times within 10 minutes bans **your internet
  address** from SSH for 1 hour (websites and routers keep working). See
  section 7, "Locked out of SSH".

---

## 1. Safety rules (always)

1. **Never send these to anyone, including Claude:**
   - the file `backend/.env`
   - any backup file (`.dump`)
   - the result of `SELECT *` on `tenant_users` or `routers` (these hold
     password hashes, router passwords and tokens)
   - private keys (WireGuard, SSH) or the admin device passes
2. **Never run `npm audit fix --force`.** It breaks the build. The "2
   vulnerabilities" warning after `npm run build` is known and harmless for the
   live site (see section 9).
3. **Commands from other AIs or websites:** ask Claude before running anything
   that deletes, restores, or changes settings. Reading commands (`ls`, `cat`,
   `status`, `free`, `df`, `SELECT`) are safe.
4. **Restoring a backup replaces the live database.** Always message Claude
   first (section 7).
5. Keep backup copies on your PC in `Documents`, **never inside the WI-FI
   project folder** (that folder goes to GitHub).

---

## 2. What runs by itself (you do nothing)

| What | When (Tanzania time) | What it does |
|---|---|---|
| Voucher expiry check | every 15 seconds | Ends vouchers whose time is up and removes them from the router |
| Session sync (cleaner) | every minute | Compares who the database thinks is online with who the router says is online |
| Router status check (pinger) | every 5 minutes | Marks routers online/offline (offline after 8 minutes of silence) |
| History clean-up | every night 02:00 | Deletes ended sessions and finished vouchers older than 1 month |
| Database backup | every night 03:00 | Saves a full copy in `/var/backups/wifi-db/`, keeps the last 14 |
| SSL certificate renewal check | 06:17 and 18:17 daily | Renews the website's padlock certificate before it expires |
| Ubuntu security updates | daily | Installs urgent security fixes automatically |
| Log rotation | automatic | Stops log files from filling the disk |
| fail2ban (SSH guard) | all the time | 5 wrong SSH passwords within 10 minutes → that internet address banned for 1 hour; robots that return get double, up to 1 week |

---

## 3. DAILY (1 minute): is everything running?

### 3a. Is the backend running?
```
pm2 status
```
**Good looks like:**
- `wifi-backend` and `pm2-logrotate` both show `online`.
- The `↺` number (restarts) stays the same from day to day. It goes up by 1
  every time you deploy an update; that is normal.

**Tell Claude if:** status is `errored` or `stopped`, or `↺` keeps climbing
on days you did not deploy anything (it means the backend keeps crashing).

### 3b. Are routers online?
Open the admin panel (`admin.oswagolink.co.tz`) → **Routers**.

**Good looks like:** routers are `online`.
**If one is offline:** first ask the business whether the router is switched
on and has internet. A router that is turned off at night shows offline; that
is normal and fixes itself when it comes back.

---

## 4. WEEKLY (5 minutes): backups, space, errors

### 4a. Did the nightly backups run?
```
sudo ls -l /var/backups/wifi-db/
```
**Good looks like:**
- One file per night, named like `wifi_app_2026-11-09_0000.dump`, with the
  newest one from last night.
- Up to 14 files (older ones are deleted automatically).
- Sizes are similar or slowly growing.

**Tell Claude if:** last night's file is missing, or a file is much smaller
than the others.

### 4b. Memory, disk and load
```
free -h
df -h /
uptime
```
**Good looks like:**

| Number | Where | Good | Tell Claude if |
|---|---|---|---|
| `available` | `free -h`, line `Mem:` | above 1 GB | under 1 GB most of the time |
| `used` | `free -h`, line `Swap:` | `0B` or small and not growing | grows week after week |
| `Use%` | `df -h /` | under 70% | above 80% |
| load average (first number) | `uptime` | under 0.7 | above 0.7 most of the day (time to upgrade to KVM 2) |

### 4c. Recent errors
```
pm2 logs wifi-backend --err --lines 30 --nostream
```
**Good looks like:** few or no new lines since last week. Each line starts
with the date and time (UTC, so 3 hours behind Tanzania).

**Normal, no action:**
- `Failed to fetch active users: Timed out` / `Failed to remove voucher: Timed
  out` around a time a router was off or had no internet.

**Tell Claude if:** the same error repeats many times today while routers are
online, or you see words like `Database error`, `ECONNREFUSED`, or `FATAL`.
Not sure what a line means? Look it up in **section 13** (every message the
backend can write, and whether it matters).

### 4d. Did the history clean-up run?
```
pm2 logs wifi-backend --lines 300 --nostream | grep History
```
**Good looks like:** a line like
`[History] Deleted history older than 30 days: sessions=… vouchers=…`
from last night. The numbers can be 0 (nothing was old enough).

### 4e. The three other logs (backup, database, website)
The backend log (4c) is not the only one. These three show problems the
backend cannot see.

**Backup log** (did any nightly backup fail?):
```
sudo journalctl -t wifi-db-backup --since "8 days ago" --no-pager
```
**Good looks like:** one `OK: /var/backups/wifi-db/wifi_app_…dump (…K)` line
per night. **Tell Claude if:** any line says `FAILED`.

**Database log** (real database errors only):
```
sudo sh -c 'grep -hE "ERROR|FATAL|PANIC" /var/log/postgresql/postgresql-*-main.log | tail -20'
```
**Normal, no action:**
- `FATAL: terminating connection due to administrator command`: the database
  was restarted (an update or a VPS reboot).
- `ERROR: duplicate key value violates unique constraint` now and then: two
  clicks at the same moment; the system already handles it.

**Tell Claude if:** you see `PANIC`, `could not write`, `No space left on
device`, `out of memory`, `too many clients`, or `deadlock detected` more than
once a week.

**Website log** (Nginx, the front door):
```
sudo tail -n 20 /var/log/nginx/error.log
```
**Normal, no action:** lines with `SSL_do_handshake() failed`, `client sent
invalid`, `no "ssl_certificate"`, `client SSL certificate verify error` or
`client sent no required SSL certificate`. Those are robots scanning the
internet, and strangers being refused at the admin site (device passes working).

**Tell Claude if:** many lines say `connect() failed (111: Connection refused)
while connecting to upstream` (the backend was down, visitors saw "502"), or
`No space left on device`.

### 4f. Is anyone attacking the VPS login?
```
sudo fail2ban-client status sshd
```
**Good looks like:** the report shows `Status for the jail: sshd`. `Currently
banned` with some numbers is normal: those are robots on the internet that
tried to log in and were blocked automatically.

**Tell Claude if:** it says `Failed to access socket` or `command not found`
(the guard is not running). First try `sudo systemctl restart fail2ban`, wait
10 seconds, and check again.

Also confirm the SSH rules are still in place (an Ubuntu update could change them):
```
sudo sshd -T | grep -Ei "^(permitrootlogin|maxauthtries|x11forwarding|allowusers) "
```
**Good looks like:** `permitrootlogin no`, `maxauthtries 3`, `x11forwarding no`,
`allowusers biliant`. The rules live in `/etc/ssh/sshd_config.d/00-oswagolink.conf`.

---

## 5. MONTHLY (15 minutes)

### 5a. Database speed report
```
sudo -u postgres psql -d wifi_app < vps/wifi-db-slow-report.sql
```
**How to read it:**
- **Ignore** lines that mention `pg_catalog`, `tableoid`, `attrelid`,
  `pg_rewrite`, `pg_collation`, `pg_description`: those are the nightly backup
  reading the database layout.
- **Ignore** `CREATE EXTENSION` and the report's own lines
  (`SELECT relname AS table_name…`, `SELECT round(…`).
- **Look at** the other lines (`avg_ms` column). Your own system's work is
  around 0.0–0.5 ms today.

**Tell Claude if:** one of your system's lines has an `avg_ms` above 50, or the
"Table sizes" show `sessions` or `vouchers` above a few million rows. Send the
whole report (it is safe to share: it shows request shapes, never real values).

### 5b. Ubuntu updates
```
sudo apt update && sudo apt upgrade
```
Type `y` when asked. If the end says **"System restart required"**, choose a
quiet time (late night, few customers) and run `sudo reboot`. Wait 2 minutes,
connect again, and run `pm2 status` (both `online`).

### 5c. Copy one backup to your PC (until the automatic off-VPS copy exists)
On the VPS (change the date to last night's file from step 4a):
```
sudo install -o biliant -m 600 /var/backups/wifi-db/wifi_app_YYYY-MM-DD_0000.dump ~/backup.dump
```
On your PC, in a **new** PowerShell window:
```
scp biliant@69.62.105.119:~/backup.dump C:\Users\Dell\Documents\oswagolink-backup.dump
```
Back on the VPS:
```
rm ~/backup.dump
```

### 5d. Check business subscriptions
In the admin panel: which businesses are on trial, whose trial is ending, who
has not paid. (Business task, not technical, but easy to forget.)

**New businesses get a 14-day free trial.** The business page shows
"Trial ends: YYYY-MM-DD (last day)". The day after, the business is blocked
automatically (owner cannot log in, portal says the service is not available).
- **They paid?** Business page → **Activate Business** → reason ("First monthly
  fee paid"). The trial ends and they are a paying customer.
- Watch the trial end dates each month, so nobody is blocked by surprise.

**Business has not paid?** Admin panel → Businesses → click the business →
**Suspend Business** → write the reason (for example "November fee not paid").
- The owner can no longer log in, and the WiFi portal tells customers the
  service is not available. Customers already online keep their time.
- When they pay: same page → **Unsuspend Business** → reason ("Payment received").
- Both actions, with your reason, are saved in **Audit Logs**.

**Business leaving for good?** Business page → **Danger zone** → **Delete Business**
→ type DELETE. Everything of that business is removed: owner login, routers and
their VPN tunnels, packages, vouchers, sessions and payment records. It cannot be
undone (only from a backup). Prefer **Suspend** if they might come back.
- If it says a VPN tunnel could not be removed, nothing was deleted: try again
  in a minute.
- Afterwards, ask the business to **reset their router to factory settings**
  (or reuse it for another business with a fresh setup).
- The Audit Logs keep a line: who deleted which business, and when.

---

## 6. EVERY 3 MONTHS (10 minutes)

### 6a. Prove the backups really work (practice restore)
This uses a separate practice copy; the live system is not touched.
```
sudo -u postgres createdb wifi_app_check
sudo cat /var/backups/wifi-db/wifi_app_YYYY-MM-DD_0000.dump | sudo -u postgres pg_restore --no-owner -d wifi_app_check
sudo -u postgres psql -d wifi_app_check -c "SELECT code, status FROM vouchers ORDER BY created_at DESC LIMIT 10;"
sudo -u postgres dropdb wifi_app_check
```
**Good looks like:** the third command lists your recent vouchers. Always run
the last line (deletes the practice copy).

### 6b. Website certificate (the padlock)
```
sudo certbot certificates
```
**Good looks like:** `VALID: … days` with more than 30 days. It renews by
itself; this only confirms it.

---

## 7. Emergencies

| What you see | First thing to do | Then |
|---|---|---|
| Portal or panels do not open | `pm2 status` → if not `online`: `pm2 restart wifi-backend` | Still broken: `sudo systemctl status nginx postgresql --no-pager` and send Claude a screenshot |
| "502 Bad Gateway" | The backend is down: `pm2 restart wifi-backend` | Send Claude `pm2 logs wifi-backend --err --lines 50 --nostream` |
| One business: customers cannot connect | Is their router online in the admin panel? Is it switched on with internet? | Send Claude the router name and the time it started |
| VPS does not answer at all | Log in to Hostinger (hPanel) and check the VPS is running | Contact Hostinger support |
| Locked out of SSH (the websites still work, but `ssh` hangs or is refused) | Probably fail2ban banned your home address after wrong passwords. Wait 1 hour, **or** connect the PC to your phone's mobile data and log in | Then free your home address: `sudo fail2ban-client set sshd unbanip YOUR.HOME.IP` (find it with `sudo fail2ban-client status sshd`) |
| SSH fully broken (not a ban) | hPanel → your VPS → **VNC / emergency console** (works without SSH). Log in as `biliant` | Undo the SSH rules: `sudo rm /etc/ssh/sshd_config.d/00-oswagolink.conf && sudo systemctl reload ssh`, then message Claude |
| Data deleted or database broken | **Stop. Do not try fixes from the internet.** | Message Claude: we choose the right backup together and restore it safely |
| `Unexpected crash, restarting` in the logs | Nothing: PM2 already started a fresh copy within a second | Send Claude the lines just above and below it: it is a bug to fix |
| Did the backend crash? | Run the command just below this table | `code [0] via signal [SIGINT]` = a normal update restart. `code [1]` = a crash: send Claude a screenshot |

Crash check (last 20 restarts):
```
grep -E "exited with code" ~/.pm2/pm2.log | tail -20
```

---

## 8. Updating the system (when Claude has pushed a change)

Claude always gives the exact commands for each update. The usual pattern:
```
cd ~/WI-FI && git pull
pm2 restart wifi-backend
```
Plus, only when Claude says so: a database migration (`sudo -u postgres psql -d
wifi_app < Database/migrations/…`) and/or rebuilding a panel (`npm run build`
and `sudo cp …`). Afterwards: `pm2 status` → `online`, and do the test Claude
describes.

---

## 9. Known messages that are NOT problems

| Message | Why it is fine |
|---|---|
| `2 vulnerabilities (1 moderate, 1 high)` after `npm run build` | Only affects the build tool's preview server on a programmer's computer, never the live site. A careful upgrade is planned. Do **not** run `npm audit fix --force`. |
| `Use --update-env to update environment variables` after `pm2 restart` | Just a PM2 tip |
| `4 additional security updates can be applied with ESM Apps` at login | Optional extra updates from Ubuntu Pro (free for personal use); can be enabled later |
| `LF will be replaced by CRLF` | Windows/Linux line-ending notice, harmless |
| `Swap: 2.0Gi … 0B used` | The memory safety net is ready and not needed: good |
| Router `offline` at night | Router switched off or without internet; it comes back by itself |
| `Router connection error (server kept running)` | A router sent a strange reply; only that one connection was dropped. Now and then is fine. Many per day: tell Claude |

---

## 10. Important dates

| Date | What | Action |
|---|---|---|
| Every 3 months | Practice restore (6a), certificate check (6b) | See section 6 |
| **Domain `oswagolink.co.tz`** | Expiry date: **write it here: ____________** | Check with your domain seller; renew before it expires or the whole system goes offline |
| 19 Oct 2028 | Hostinger VPS plan paid until here (auto-renew is on) | Make sure the payment card is still valid |
| **Before 31 Oct 2028** | Admin device passes (laptop + phone) expire | Ask Claude to renew them, otherwise the admin panel locks you out |

---

## 11. Plan ahead (not urgent)

- **Off-VPS backups:** today backups live on the VPS itself. If the whole VPS
  were lost, you would depend on Hostinger's weekly backup. Set up an automatic
  nightly copy to a second place; until then, do step 5c every month.
- **Upgrade to KVM 2** when the load average (4b) stays above 0.7, or available
  memory stays under 1 GB.
- **Before each new business:** test a new router's setup once.

---

## 12. Quick facts (no secrets)

| Item | Value |
|---|---|
| VPS | Hostinger KVM 1: 1 CPU, 3.8 GB memory, 2 GB swap, 48 GB disk, Ubuntu |
| VPS address | 69.62.105.119 (login user: `biliant`) |
| VPS clock | UTC (Tanzania = UTC + 3 hours) |
| Database | PostgreSQL, database name `wifi_app` |
| Backend | `wifi-backend`, managed by PM2 |
| Websites | `oswagolink.co.tz` (portal, business panel), `admin.oswagolink.co.tz` (your admin panel, needs a device pass) |
| Backups | `/var/backups/wifi-db/` (root only), 14 nights |
| History kept | 1 month |
| Project code | GitHub: `faustinebiliant-cmd/WI-FI` |
| Old notes | `docs/archive/` (history only, do not follow) |
| Your localhost vs VPS notes | `LOCALHOST-VS-VPS.md` |
| What protects the system, what is still open | `SECURITY-STATUS.md` |

---

## 13. Every backend message explained

From `pm2 logs wifi-backend` (4c). Times in the log are UTC (Tanzania = UTC + 3).
**Green** = normal, **Yellow** = watch it, **Red** = tell Claude the same day.

### Router messages
| Message starts with | Meaning | Level |
|---|---|---|
| `[MikroTik] connection error: Timed out` | A router did not answer in 5 seconds | Green when that router was off / without internet. Yellow if it repeats all day while the router is online |
| `[MikroTik] Failed to fetch active users` | The 1-minute check could not ask a router who is online | Same as above |
| `[MikroTik] Failed to remove voucher` | An ended voucher could not be taken off a router yet; tried again every 15 s until it works | Same as above |
| `[MikroTik] Failed to create voucher` | A customer pressed Connect but the router did not answer; the customer saw "try again" and kept the voucher | Green now and then. Yellow if many customers report it |
| `[MikroTik] Failed to disconnect device` | Disconnect button pressed, router did not answer; the panel said "NOT disconnected" | Green |
| `[Cleaner] Router … did not answer 3 times in a row` | Router counted as offline; its open sessions closed | Green |
| `[Pinger] Router … check failed` | The 5-minute status check could not reach one router | Green |
| `Router connection error (server kept running)` | A router sent a strange reply; that one connection was dropped | Green now and then. Yellow if many per day |
| `Revoke voucher: router could not be used` / `Disconnect: router could not be used` / `Delete package: router could not be used` | The button was pressed while the router was off; the panel said "NOT …, try again" | Green |
| `Router adapter error` | The system could not prepare a router connection | Yellow (red if every router shows it) |
| `Decryption failed` | A saved router password could not be unlocked | **Red**: usually means the secret key in `.env` was changed. Do not change `.env` |
| `Failed to remove WireGuard peer` | A deleted router's VPN tunnel could not be removed; nothing was deleted | Yellow: try again in a minute; red if it keeps failing |
| `provisioned_at update failed` / `Enrollment error` / `Bootstrap error` | A router setup step failed | Yellow during a router setup; tell Claude if a setup does not finish |

### Background work
| Message starts with | Meaning | Level |
|---|---|---|
| `[History] Deleted history older than 30 days` | Nightly clean-up done (in the normal log, not the error log) | Green |
| `[History] Clean-up failed` | The nightly clean-up stopped | Yellow once (retried next night). Red two nights in a row |
| `[Cleaner] Slow round: … routers took … s` | The 1-minute check needed more than 45 seconds | Yellow: with many businesses, time to talk about KVM 2 |
| `[Cleaner] Voucher expiry error` / `Voucher expiry failed for one router` / `Session sync failed for router` | One round of the checks failed; the next round tries again | Yellow if it repeats for an hour |
| `[Cleaner] Database error` / `[Pinger] Fatal error` | The checks could not use the database | **Red** if it repeats |
| `Pinger error` / `History clean-up error` | A background program was stopped (took too long) | Yellow |

### Database and server
| Message starts with | Meaning | Level |
|---|---|---|
| `Unexpected error on idle PostgreSQL client: terminating connection due to administrator command` | The database was restarted; the backend reconnected by itself | Green |
| `Unexpected error on idle PostgreSQL client` (other text) | A database connection broke; reconnected by itself | Yellow if many per day |
| `Health check failed` | The backend could not reach the database | **Red** if it repeats |
| `Unhandled error (server kept running)` | Something failed that our code did not expect; the server kept going | Yellow: send Claude a screenshot when you see it |
| `Unexpected crash, restarting` | A real bug; PM2 restarted the backend within a second | **Red**: send Claude the lines around it |
| `Could not close connections in time, forcefully shutting down` | During a restart something was slow to finish | Green now and then |
| `FATAL:` (at start-up) | The backend refused to start: a setting in `.env` is wrong or missing | **Red**: the backend is down. Send Claude the line (it never prints secrets) |
| `WARNING: ADMIN_HOST is empty` | The admin protection setting is missing in `.env` | **Red** |
| `CORS blocked origin` | Only on a programmer's computer, never on the VPS | Green |
| `Server error:` | A request failed in an unexpected way; the visitor got "server error" | Yellow once. Red if it repeats |

### Button and page errors
Lines like `Login error`, `Redeem error`, `Create package error`, `Generate
vouchers error`, `List vouchers error`, `Dashboard stats error`, `Delete tenant
error`, `Payment error` and similar mean: **one button or page failed for one
person** (they saw "Failed to …").
- **Green** if it happened once while the database was being restarted.
- **Red** if the same one repeats: that button is broken for everybody. Send
  Claude a screenshot of the line **and the 5 lines under it** (the reason).

`Payment … AzamPay is not connected yet` is expected until mobile payments are
switched on.
