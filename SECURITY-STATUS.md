# Oswagolink: Security Status

What protects your system today, what was fixed, and what is still open.
Plain English, no secrets. Keep it next to `OWNER-CHECKUP-GUIDE.md` (the
weekly checks that keep these protections working).

Last updated: 5 November 2026

---

## 1. The big picture

Think of the system as a building with four doors. Each door has its own lock:

| Door | Who uses it | Main lock |
|---|---|---|
| **SSH** (the VPS control room) | Only you | Your PC's key or your password, a robot-blocker, no root login |
| **Websites** (portal, business panel, admin panel) | Customers, businesses, you | HTTPS padlock, logins, browser safety rules, admin device passes |
| **The backend and database** | Only the websites, from inside the VPS | Not reachable from the internet at all |
| **The router tunnel** (WireGuard) | Your customers' MikroTik routers | Each router has its own key and its own private address |
| **The TP-Link controller doors** (since 5 Nov 2026) | TP-Link access points (EAPs), and phones passing the portal entrance | An EAP is only managed after you adopt it; the controller's admin page and database are never reachable from the internet |

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

Fixed in the second audit (3 November 2026, everything between users and the VPS):

| What was wrong | What could have happened | What was done |
|---|---|---|
| **One router's answer could fill the server's memory** (proven in a test: +1.45 GB in 15 seconds) | A business owner, or anyone who takes over a router, could crash the server again and again: every business offline | A router may send at most **2 MB per connection**; beyond that the connection is cut and the router counts as "not answering" (test: +19 MB). A real busy router (1,000 customers online) sends about 0.1 MB |
| **Router setup links worked for 12 hours** | A setup link copied or photographed by someone else stayed usable for half a day | Setup links now work for **30 minutes** (the router's last setup step gets 10 extra minutes) |
| **New routers could not finish setup** (found by the tests): the router sends its registration as POST, the server only accepted GET since 31 October | Every new router setup would end with "REGISTRATION FAILED" | The server accepts the router's registration again |

Fixed in the third audit (3 November 2026, every input of the portal and both panels):

No injection was possible (every database query keeps typed text apart from the command, the
screens show text safely, router commands are strictly checked). These rules were tightened:

| Field | Now accepts only |
|---|---|
| Business name, owner name | 2 to 60 characters: letters, numbers, spaces and . , - ' & ( ) |
| Package name, router name | 1 to 40 characters, same characters |
| Router location | 0 to 60 characters, same characters |
| Package price, monthly fee | Whole numbers from 0 to 1,000,000 TZS |
| Email (new business) | An ordinary address (letters, numbers, . _ % + -), at most 50 characters |
| Owner phone | Tanzanian number, saved as digits only |
| Login and passwords | Email and password at most **50 characters** each (new passwords 8 to 50; admin account 12 to 50) |
| Admin reasons | Real text only: impersonation 10 to 300, suspend/activate 5 to 500 characters |
| Any request | At most 32 KB (the biggest real request is under 1 KB) |

Refused: HTML, symbols, emoji, invisible and right-to-left characters, the "zero" character, text
sent as a list or an object. Every refusal gives a clear message, never "server error". The forms
use the same rules: characters that are not allowed cannot be typed, and fields stop at their limit.

Login pages (both panels), also 3 November 2026:

| Defence | What it does |
|---|---|
| Same answer, same time | A wrong password and an email nobody has get exactly the same answer after the same time (tested: 236 ms both), so nobody can find out which emails have accounts |
| "Account deactivated" only with the right password | A stranger cannot learn that an account exists but is switched off |
| Guessing limit per account | 10 wrong passwords per hour per account, from any number of internet addresses (a botnet included), on top of 5 per internet address. After that the account waits 1 hour; other accounts are not affected |

What reaches the browser (also 3 November 2026): no passwords, password hashes, router passwords, setup tokens or tunnel keys are ever sent; built website files hold no secrets and no source maps.

| Change | What it does |
|---|---|
| "Don't store" on every API answer | Browsers and proxies keep no copy of private data (customers, phone numbers, voucher codes), so the next person on a shared computer cannot see it |
| "Log out of all devices" (business panel, Settings) | Every phone and computer logged in to that account is logged out at once (lost phone, borrowed laptop, copied login) |
| Font served by our own site | The panels no longer load anything from Google: visitors' addresses go nowhere else, and the "only our own code" rule now allows nothing from outside |

Also fixed earlier the same day:
- **The server no longer stops** when a router sends a strange reply (it logs it and keeps running).
- **Broken requests** get a clean "bad request" answer instead of looking like server errors.

Fixed on 4 November 2026 (the optional items, plus the router staff door):

| What was wrong | What could have happened | What was done |
|---|---|---|
| **Customers on the Wi-Fi could find the router**: its name showed in the MikroTik app's "Discovered" list, and they could try to log in | A paying customer could guess the router's admin password and take over the business's Wi-Fi | Winbox, Winbox-by-MAC and the Neighbors list are blocked on access-point ports, and the router no longer announces itself there (5 rules). Phone-tested: the app found nothing and could not log in; the cable port still works for staff |
| **Before paying, customers could reach every port of the VPS** (SSH 22, tunnel 51820), because the portal's address was fully open | A customer could guess the SSH password from inside the Wi-Fi, and fail2ban would then ban the whole business's internet address | Before paying, customers reach the VPS **only on ports 80 and 443** (the portal). New routers get this from the setup; existing routers need 3 commands once |
| **Router answers about online customers were saved without checking** | A tampered router could send rubbish (very long text, fake addresses) every minute: errors in the logs, a broken minute-check for that router | Only real MAC and IP addresses are used; anything else is skipped quietly (15 tests passed) |
| **Router registration had no time limit, and two registrations at the same moment could both add a tunnel** | A stuck helper could hang the request forever; one setup link could create two tunnels | At most 30 seconds, then "failed" and the router tries again. The setup link is marked used **before** the tunnel is added, so a second registration is refused. If the router is deleted during setup, its new tunnel is removed again |
| **Every router deletion left a copy of the tunnel settings, including the VPS private key** | Copies of the most important tunnel secret piling up on the VPS | The copy now exists only while the removal runs: deleted on success, kept only if the removal fails (for recovery) |
| **Device pass files stayed in the VPS home folder** | Someone who got into the VPS account could copy an admin device pass | Deleted. How to add, remove or renew a device: admin panel → Setup Guide → "Admin panel device passes" |

Added on 5 November 2026: the TP-Link controller (for TP-Link-only businesses, still in testing).
Details: `TPLINK-CONTROLLER-GUIDE.md`.

| Risk | Protection |
|---|---|
| A new program on the VPS could take too much memory or CPU and stop billing | Sealed Docker box: at most 1.75 GB memory and 60% of the CPU; tested: billing unaffected |
| Docker normally changes the firewall and switches "forwarding" on (routers could then reach each other) | Docker is configured never to touch the firewall or forwarding (checked: forwarding still `0`, no Docker firewall rules) |
| The controller program itself is downloaded from the internet | Only from `static.tp-link.com`, refused if its fingerprint (SHA256) differs; Java and MongoDB from their official sources |
| The controller running with full rights | Runs as an ordinary user inside the box, all special rights removed, cannot gain new ones |
| Its admin page or database reachable from the internet | Admin (8043, 8088, 8843) closed: only through your SSH tunnel. MongoDB (27217) only listens inside the VPS. Checked from outside: closed |
| The portal entrance shared the admin port (8088 by default) | Moved to its own port 8880; only 8880 is open, and its front page only points to the closed 8043 |
| Strangers pointing their EAPs at our VPS | They only appear as "Pending"; nothing happens unless you adopt them |
| Customers on the WiFi taking over an EAP | Each EAP's own web page and phone-app management are switched off; EAP logins use the device account, different from your admin login |
| Customers using the internet before paying | Before paying, phones may reach only our VPS (`69.62.105.119/32`); the portal account (Hotspot Admin) can only let phones in and out, on its own site |
| TP-Link's cloud | Not used (cloud access and data sharing off) |

New doors this opened (each needed): 29810 and 19810 (udp), 29811 to 29817 and 8880 (tcp).
**Never open** 8043, 8088, 8843 or 27217.

---

## 3. Protections that were already in place (checked and confirmed)

**On the VPS**
- Firewall: only these doors open to the internet: SSH (22), websites (80, 443), router tunnel (51820), and since 5 November 2026 the TP-Link controller's EAP doors (29810 and 19810 udp, 29811 to 29817 and 8880 tcp). The database (5432), backend (5001) and the controller's admin (8043) and database (27217) are private.
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
| 7 | **Routers: customers could reach the Winbox admin login** | Paying customers on the WiFi could see the router and try to guess its admin password | **Done and tested 4 November 2026** on a reset router: a phone on the access-point WiFi could not log in with the MikroTik app (9 Winbox tries and 9 discovery tries blocked, counters above 0), while the cable port still works for staff. The phone could still see the router's name in its "Discovered" list, so a 4th and 5th rule (same day) stop the router announcing itself towards access points. Winbox and the Neighbors list are blocked on access-point ports (found automatically every minute); any other LAN port stays open for staff; up to 8 access points (192.168.88.2 to .9); emergency key `scripts/routerStaffDoor.js` on the VPS. A reset router has no old `test`/`1234` user |
| 8 | **Backend runs as its own low-rights user** (today it runs as `biliant`) | If the backend were ever broken into, the intruder would not get your account | Plan for a calm day |
| 9 | **VPS tidy-up** | Fewer old files with secrets lying around | **Done 4 November 2026**: old `.env` copies, old Nginx copies and default site, old login page, old tunnel copies (with the private key) and old helpers removed. The device pass `.p12` copies were deleted the same day. Since then, router deletions leave no tunnel copies behind |
| Later | **SSH keys only** (switch off password login) | Removes password guessing completely | When you are ready: one line in `00-oswagolink.conf`. After it, only your PC can log in; the emergency way in is Hostinger's VNC console |
| Later | **Portal on its own address** (for example `wifi.oswagolink.co.tz`) | The portal and the business login would no longer share one website address | Bigger change, no rush |

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
| TP-Link controller box and Docker settings | Docker box `omada`, `/opt/omada/`, `/etc/docker/daemon.json` | `vps/omada/` |

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
  login, remove fail2ban, open ports 5001/5432/8728 (or the TP-Link controller's
  8043/8088/8843/27217), run Docker clean-up commands, or run
  `npm audit fix --force`. Ask Claude first.
- **TP-Link controller:** passwords only in your password manager; update it on
  purpose every 2 to 3 months (`TPLINK-CONTROLLER-GUIDE.md` section 8); from the
  browser's developer tools share only "Request URL" and "Request method".
- To repeat the audit later: `SECURITY-AUDIT-PROMPT.md`.

---

## 7. Warning signs in the logs (possible attack)

These lines in `pm2 logs wifi-backend --err` mean someone may be attacking.
Check for them in the weekly error check (guide step 4c).

| Line in the log | What it means | What to do |
|---|---|---|
| `[MikroTik] A router sent more than 2 MB in one connection: connection cut (a real router never does this). Router: 10.20.X.Y` | A router tried to flood the server with an endless answer. A normal router never sends this much, so **someone has probably tampered with that router** (its owner, or someone who got its admin password). The server cut it off and kept running for everyone else | **Red: tell Claude the same day**, with the time of the line. The line ends with the router's tunnel address (10.20.X.Y): find that router in the admin panel's Routers page, contact that business, and if needed block its router (delete it in the panel, which also removes its tunnel) |
| `Router connection error (server kept running)`, many per day | A router keeps sending strange replies | Yellow: tell Claude |
| `[Cleaner] Slow round` together with the 2 MB line above | A tampered router is also slowing down the every-minute check | Red: tell Claude |
