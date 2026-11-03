# Oswagolink: Security Status

What protects your system today, what was fixed, and what is still open.
Plain English, no secrets. Keep it next to `OWNER-CHECKUP-GUIDE.md` (the
weekly checks that keep these protections working).

Last updated: 2 November 2026

---

## 1. The big picture

Think of the system as a building with four doors. Each door has its own lock:

| Door | Who uses it | Main lock |
|---|---|---|
| **SSH** (the VPS control room) | Only you | Your PC's key or your password, a robot-blocker, no root login |
| **Websites** (portal, business panel, admin panel) | Customers, businesses, you | HTTPS padlock, logins, browser safety rules, admin device passes |
| **The backend and database** | Only the websites, from inside the VPS | Not reachable from the internet at all |
| **The router tunnel** (WireGuard) | Your customers' MikroTik routers | Each router has its own key and its own private address |

---

## 2. Fixed during the security audit (2 November 2026)

| # | What was wrong | What could have happened | What was done |
|---|---|---|---|
| 1 | **SSH accepted passwords for `root`** (the all-powerful user), and nothing slowed down password guessing. An earlier "keys only" setting never took effect | A robot that guessed the root password would own everything: database, routers, backups | **Root can no longer log in over SSH**; only `biliant` may log in; 3 tries per connection; remote-screen feature (X11) off. **fail2ban** installed: 5 wrong passwords in 10 minutes bans that internet address for 1 hour, doubling for robots that return (up to 1 week). Your password login still works (your choice); your PC logs in with its key |
| 2 | **The portal sent voucher codes to whatever "router address" was written in the link** | A fake portal link could steal a customer's paid voucher, or run a hacker's code on oswagolink.co.tz (where business owners log in) | The portal now only sends codes to a router on a local network (like `192.168.88.1`). Anything else is ignored. Phone-tested |
| 3 | **A backend library (body-parser) had a known "freeze the server" weakness** | A specially packed request could overload the server | Updated to the fixed version 1.20.9. Safety report: 0 problems |
| 4 | **The portal and business panel pages missed some browser safety rules, and Nginx showed its exact version** | Click tricks inside another website; robots picking servers by version | Pages now tell browsers: never show me inside another site, don't guess file types, don't leak page addresses, HTTPS only. Nginx no longer shows its version |
| 5 | **Voucher codes were short (6 characters, 0-9 and A-F: about 16.7 million codes)** | Someone patient, switching internet addresses, could guess a code a customer had paid for | New codes have **8 characters without look-alikes** (no 0/O, no 1/I/L), e.g. `K7MP4RQX`: about 850 billion codes, roughly 51,000 times harder to guess. The whole system now uses only 8-character codes (all old 6-character vouchers were deleted with their packages). The portal ignores small letters, spaces and dashes typed by customers. Any code that does not work gets the same short answer ("Invalid voucher code"), so strangers learn nothing about what a real code looks like |
| 6 | **Changing a business password did not log out other devices** | A stolen business login kept working up to 1 day, even after the owner changed the password | Changing the password now logs out **every other device** at once (they see "Your password was changed. Please log in again."). The device used for the change stays logged in |

Also fixed earlier the same day:
- **The server no longer stops** when a router sends a strange reply (it logs it and keeps running).
- **Broken requests** get a clean "bad request" answer instead of looking like server errors.

---

## 3. Protections that were already in place (checked and confirmed)

**On the VPS**
- Firewall: only 4 doors open to the internet: SSH (22), websites (80, 443), router tunnel (51820). The database (5432) and backend (5001) are private.
- The VPS does not pass traffic between routers: one router can never reach another.
- Secret files (`.env`, backups, WireGuard keys, helper scripts) can only be read by their owner.
- The database only accepts connections from inside the VPS, and the app's database user is not an administrator.
- HTTPS uses only modern encryption (TLS 1.2 and 1.3), renewed automatically.
- Nightly database backups (14 days), automatic Ubuntu security updates.

**In the code**
- Every database request is protected against "SQL injection" (typed-in text can never become a database command).
- Router passwords are stored encrypted (AES-256-GCM).
- Business logins and admin logins use different secret keys; the server refuses to start if they are the same.
- The admin panel only opens on devices with your device pass (laptop and phone).
- Every business only ever sees its own routers, vouchers and customers.
- "Impersonate owner" is checked on the server, ends after 1 hour, and is written in the Audit Logs.
- Request limits stop password and voucher guessing from one address.
- Every page only runs Oswagolink's own code (Content-Security-Policy, built into each page).
- No passwords or keys are stored in GitHub.

---

## 4. Still open (in order)

| # | What | Why it matters | Status |
|---|---|---|---|
| 7 | **Routers: limit the Winbox admin tool, remove any `test`/`1234` user** | Paying customers on the WiFi can try to guess a router's admin password | Needs your router |
| 8 | **Backend runs as its own low-rights user** (today it runs as `biliant`) | If the backend were ever broken into, the intruder would not get your account | Plan for a calm day |
| 9 | **VPS tidy-up**: old `.env` copies (contain secrets), Nginx default site, old script copies | Fewer old files with secrets lying around | From about 4 November |
| Later | **SSH keys only** (switch off password login) | Removes password guessing completely | When you are ready: one line in `00-oswagolink.conf` |

---

## 5. Where the security settings live

| What | On the VPS | Copy in this project |
|---|---|---|
| SSH rules | `/etc/ssh/sshd_config.d/00-oswagolink.conf` | `vps/sshd-00-oswagolink.conf` |
| Robot-blocker (fail2ban) | `/etc/fail2ban/jail.d/oswagolink-sshd.local` | `vps/fail2ban-oswagolink-sshd.local` |
| Browser safety rules (values) | `/etc/nginx/conf.d/wifi-security-headers.conf` | `vps/nginx-security-headers.conf` |
| Browser safety rules (sender) | `/etc/nginx/snippets/oswagolink-page-headers.conf` | `vps/nginx-page-headers-snippet.conf` |
| Admin device passes | managed by `sudo wifi-admin-device` | `vps/wifi-admin-device` |
| Router tunnel add/remove | `/usr/local/sbin/wifi-wireguard-add-peer`, `-remove-peer` | `vps/` (same names) |

Each project copy starts with its install, check and undo commands.
Backups of the Nginx files from before the change: `~/nginx-backup-2026-11-02/`.

---

## 6. Keeping it safe (your part)

- Do the **weekly check** in `OWNER-CHECKUP-GUIDE.md` (step 4f confirms fail2ban
  is running and the SSH rules are still in place).
- **Never share**: the `.env` file, passwords, keys, device-pass files, backup
  files, or `SELECT *` results from `tenant_users` or `routers`.
- **Locked out of SSH?** Probably a ban on your home address after wrong
  passwords: wait 1 hour, or use your phone's mobile data, then
  `sudo fail2ban-client set sshd unbanip YOUR.HOME.IP`. Emergency: the VNC
  console in Hostinger's hPanel.
- **Advice from other AIs** (including Hostinger's): do not re-enable root
  login, remove fail2ban, open ports 5001/5432/8728, or run
  `npm audit fix --force`. Ask Claude first.
- To repeat the audit later: `SECURITY-AUDIT-PROMPT.md`.
