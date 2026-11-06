# Oswagolink: TP-Link Controller Guide

Everything about the TP-Link (Omada) part of Oswagolink: what was installed, where, and why;
how to use and check it; what to do when something goes wrong; how to update it; and how to
remove all of it. Plain English, **no secret values** in this file.

How a TP-Link business works day to day, from the first setup to a customer's voucher:
**`HOW-VPS-CONTROLS-TPLINK.md`**.

Related guides: `VPS-HANDBOOK.md` (the whole VPS), `OWNER-CHECKUP-GUIDE.md` (regular checks),
`SECURITY-STATUS.md` (protections). Technical commands: `vps/omada/README.md`.

Last updated: 6 November 2026

---

## 1. The idea in one picture

Some businesses cannot afford a MikroTik router **and** an access point. For them, the
TP-Link access point (an "EAP") does the billing job itself:

```
 Customer's phone
       |  WiFi
 TP-Link EAP  ---- business's own internet box ---- internet ----+
       |                                                         |
       |  reports to / takes orders from (ports 29810-29817)     |
       +------------------------------------------->  VPS  <-----+
                                                      |
                               Omada controller (in a sealed Docker box)
                                                      |
                               Oswagolink backend: "this voucher is valid,
                               let this phone in for 2 hours"
```

- The **EAP** blocks every phone until our portal says yes, then lets it in for the paid time,
  at the business's speed, and cuts it off when the time is up.
- The **controller** is TP-Link's program that gives the EAPs their orders. It runs on **our own
  VPS**, not in TP-Link's cloud (the free cloud refused to adopt the EAP, on 4 November 2026).
- **MikroTik businesses are not affected at all.** They keep working exactly as before.

**Status on 5 November 2026:** tested and working on the VPS with one test EAP (Phase A on the
laptop, Phase B on the VPS). Building it into the panels and the portal is **Phase C** (not done
yet). Decision for the first version: **one speed per business** (packages differ by time and price).

**Update 6 November 2026 (automation step V2-1):** with the Open API key, a TP-Link package can have
its **own speed** (1-20 Mbps). When a voucher is used, the phone gets that speed before it is let in
(tested on a phone: 1 Mbps limit gave 920 kbps, removed gave 2.1 Mbps). A package without a speed
gives the business WiFi speed (the speed profile on the WiFi), and a package speed can never be
faster than that. If setting the speed fails, the customer still gets in at the business WiFi speed.
Both panels also show each access point's status (online, offline, pending, …), checked every 5 minutes.

**Update 6 November 2026 (first phone test of the automatic adopt):**
- The access point's own setup page demands a symbol in the password, so the one-time setup login
  now has symbols (`@ # * !`). The setup page also insists on a WiFi name and password: anything
  will do (`setup-temp`), the controller replaces it with the business's WiFi.
- Behind the laptop's internet sharing the access point could not look up `oswagolink.co.tz`; the
  Inform URL with the IP (`69.62.105.119?dPort=...`) worked. The Connect window now shows both.
- An access point is counted as adopted only when the controller shows it **connected** (it can show
  "disconnected" for a moment while being adopted). One that the 5-minute check sees waiting again
  is adopted again automatically. Check with `node scripts/omadaOpenApiTest.js waiting` (shows
  TP-Link's detailed status, for example "Adopt failed" or "Managed by others").

**Update 6 November 2026 (one speed setting, as on MikroTik):** with the Open API key, every TP-Link
package **must** have a speed (1-20 Mbps), exactly like MikroTik, and Add Router no longer asks for a
WiFi speed (two speed settings confused businesses). Oswagolink puts a hidden **20 Mbps safety limit**
per phone on each WiFi it makes: normally it changes nothing, but if setting a phone's package speed
ever fails, that phone gets at most 20 Mbps instead of the whole line. Older TP-Link packages without
a speed keep working at that limit. Without the key (sites made by hand) nothing changed.

**Update 6 November 2026 (automation steps V2-2, V2-3, V2-4, all tested on a real phone):** with the Open API key, nobody touches
the controller for a new TP-Link business any more:
- **Add Router → TP-Link** (business panel) asks for the access point's MAC and a **WiFi name**. Oswagolink then makes the whole site in a few seconds: site
  (Tanzania, Africa/Nairobi, General) with its own random access point login (`eap-admin`, kept
  encrypted), the open WiFi as a guest network, a hidden 20 Mbps safety limit per phone, the External Portal
  `https://oswagolink.co.tz/portal/`, before-paying access only to `69.62.105.119/32`, and the site is
  added to the hotspot operator. If any step fails, the half-made site is deleted again and nothing is saved.
- The business panel then shows **Connect**: the steps for the technician, the Inform URL and a
  **one-time setup login** (`oswsetup` + 12 characters: letters, numbers and symbols from `@ # * !`, as the access point demands) to type on the new access point.
  Every minute, `scripts/omadaAdopt.js` adopts the access point with **exactly the MAC the business
  registered**, into **that business's site** (first with the factory login, then with the setup
  login). After adoption the access point gets the site's own login, and the setup login is no
  longer shown. An access point whose MAC no business registered is **never** adopted; the admin
  Routers page lists it as "no business registered this MAC".
- **Delete Router** forgets the access point (it returns to factory settings), deletes the site,
  then takes it off the operator. Only sites the system made (`omada_site_auto`); your hand-made
  site "Oswagolink" is never touched. **Keep that site and its name**: it keeps the operator's site
  list from ever being empty (TP-Link refuses an empty list), and the test commands find it by name. If the controller refuses, the router is not deleted.
- Without the Open API key everything works as before (site made by hand, site ID in the admin panel).

---

## 2. What was installed and changed, and why (history)

### 2a. On the VPS
| Date | What | Why | Undo (section 10) |
|---|---|---|---|
| 5 Nov 2026 | **Docker** (Ubuntu's own package `docker.io`, plus `docker-buildx`) | TP-Link does not support our Ubuntu 26.04. Inside a sealed box (Docker) the controller gets Ubuntu 24.04, which TP-Link supports. The box also lets us limit its memory and CPU, and remove it cleanly | 10a step 5 |
| 5 Nov 2026 | **Docker settings file** `/etc/docker/daemon.json` | Docker must **never** touch the firewall or switch on "forwarding" (forwarding stays off so one router can never reach another). Docker's logs are kept small (3 files of 10 MB) | 10a step 5 |
| 5 Nov 2026 | **The box recipe** `vps/omada/` in the project (Dockerfile, starter, README) | Builds the box from official parts only: Ubuntu 24.04, Java 21, MongoDB 8.0, and the controller 6.3.0.45 from `static.tp-link.com`, refused if its fingerprint (SHA256) does not match | delete the image, 10a step 1 |
| 5 Nov 2026 | **The box itself**, name `omada` | Runs the controller all the time; restarts by itself after a crash or reboot; at most **1.75 GB** memory (1.5 GB until 6 Nov 2026) and **60% of the CPU**; no special rights; runs as an ordinary user (not root) | 10a step 1 |
| 5 Nov 2026 | **Folder `/opt/omada/`** (data + logs) | The controller's database, settings and automatic backups. Kept outside the box so updates do not lose anything | 10a step 4 |
| 6 Nov 2026 | **Java memory settings** in the starter (`MALLOC_ARENA_MAX=2`, network buffers 128 MB, code space 96 MB) | Java used 1.38 GB with a 700 MB heap and slowly climbed to the box's 1.5 GB limit; these are the standard fixes for that climb. Result: Java flat at 1.21 GB for over an hour | rebuild without them (not needed) |
| 6 Nov 2026 | **Box limit raised 1.5 → 1.75 GB** (`sudo docker update --memory 1.75g --memory-swap 2.25g omada`, no restart) | Working in the controller's admin pages (login, creating the Open API key, firmware check, then the API document) made Java jump from 1.22 to 1.36 GB and the box to 1.497 of 1.5 GB. Java keeps that memory afterwards, so 1.5 GB was too tight | `sudo docker update --memory 1.5g --memory-swap 2g omada` |
| 5 Nov 2026 | **Firewall: 4 new doors** (see 2c) | EAPs anywhere must reach the controller, and customers' phones must reach the portal entrance | 10a step 3 |

### 2b. Settings inside the controller (and why)
| Setting | Value | Why |
|---|---|---|
| Admin login | your own name (not "admin") + strong password | In your password manager only |
| Cloud access, "Improvement program" | off | No link to TP-Link's cloud; share nothing |
| Controller Hostname/IP | `oswagolink.co.tz` | It had chosen `10.20.0.1` (our private router tunnel), which EAPs cannot use |
| Device Management (System Settings) | on, `oswagolink.co.tz` | Lets EAPs at customers' places be managed over the internet |
| **HTTP Portal Port** | **8880** (was 8088) | Phones must pass the controller's "portal entrance" before reaching our portal. 8088 is also the **admin** port, so the entrance got its own port and only 8880 is open |
| Device Web HTTP/HTTPS access, Standalone app management | off | Customers cannot even see an EAP's own login page; nobody can take an EAP over with the phone app |
| History Data Retention | short (1 day clients, weekly 1 month) | Smaller database, less memory |
| Backup Schedule | daily (move to **04:00**, see 9) | Automatic copy of the settings |
| Site | `Oswagolink` (made by hand, 5 Nov) | Since 6 Nov the system makes **one site per business** by itself, so businesses can never see each other. This hand-made site stays: no business uses it, but it keeps the operator's list non-empty |
| Device account (site settings) | `eap-admin` + strong password | The login every adopted EAP gets. Different from your admin login |
| Test WiFi, portal, speed profile, operator | `Oswagolink TP Test`, External Portal `https://oswagolink.co.tz/portal/`, pre-auth only the VPS (`69.62.105.119/32`), `Speed-2M`, first operator `portal-test` | The test setup of 5 Nov. Since Phase C the system uses the operator `oswagolink-portal` (Hotspot **Admin**), and since 6 Nov it makes the WiFi and portal per business |

### 2c. Doors (ports) on the VPS for the controller
| Port | Open to the internet? | Used for |
|---|---|---|
| 29810 / udp, 19810 / udp | **Yes** | EAPs knock to find the controller |
| 29811 to 29817 / tcp | **Yes** | EAPs are managed through these |
| 8880 / tcp | **Yes** | The portal entrance (phones pass through on their way to our portal). Its front page only points to 8043, which is closed |
| 8043 | **No** (only through your SSH tunnel) | The controller's admin page |
| 8088, 8843, 8044, 27001, 19810/tcp | **No** | Admin and TP-Link extras we do not use |
| 27217 | **No**, and it only listens inside the VPS | The controller's MongoDB database |

### 2d. On your laptop
**Cleaned up on 6 November 2026:** the Windows test controller was uninstalled (without its
data), the folders `C:\Users\Dell\Omada Controller` and `C:\Users\Dell\omada-test` (with the test
operator's password) were deleted, and the firewall rule "Omada test - EAP cable only" removed.
You look at the VPS controller through the tunnel only (section 4). Still on the laptop:

| What | Why it is there |
|---|---|
| Internet sharing from WiFi to the cable (Ethernet 2, `192.168.137.x`) | Gives the test EAP internet |

### 2e. On the test EAP (EAP225-Outdoor v3, MAC D4-D6-DF-A5-F8-D2)
Adopted by the VPS controller on 5 November 2026. Its **Controller Inform URL** is
`69.62.105.119?dPort=29810&mPort=29814&omadacId=cd94399be58321df0d45c1ff32d49f95`.
To give it back to MikroTik use: section 10c.

---

## 3. Everyday commands (VPS)

| What you want | Command | Good looks like |
|---|---|---|
| Is it running? | `sudo docker ps --format '{{.Names}}  {{.Status}}'` | `omada  Up …` |
| Memory and CPU | `sudo docker stats --no-stream --format '{{.Name}}  CPU {{.CPUPerc}}  MEM {{.MemUsage}}'` | memory under 1.6 GB (limit 1.75 GB), CPU usually a few % |
| Restart it | `sudo docker restart omada` | It takes **5 to 10 minutes** to be fully up (Java starts slowly on our CPU limit) |
| Its recent errors (to send Claude) | `sudo tail -n 30 /opt/omada/logs/server.log` | mostly `INFO` lines |

**Memory words** (`free -h`): `free` is completely unused memory (Linux keeps it low on purpose);
`buff/cache` is borrowed and given back instantly; **`available` is the real number to watch**
(above 1 GB is healthy).

---

## 4. Opening the controller's admin page (through the private tunnel)

The admin page is never open to the internet. You reach it through a private pipe:

1. On your PC, in a PowerShell window (leave it open; it shows nothing when it works):
   ```
   ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 8043:127.0.0.1:8043 biliant@69.62.105.119
   ```
2. In the browser: **`https://127.0.0.1:8043`** → "not private" warning → Advanced → Continue.
3. Log in with your controller login (password manager).

**The tunnel drops often** ("client_loop: send disconnect: Connection reset"). Then the page's
buttons silently do nothing. Press Ctrl+C in the tunnel window, run step 1 again, press F5.
"channel 2: open failed: Connection refused" means the controller is still starting: wait.

---

## 5. Checks

| When | What | How |
|---|---|---|
| Daily (with the backend check) | Controller running | Section 3, "Is it running?" |
| Weekly | Memory under 1.6 GB; VPS `available` above 1 GB | Section 3 + `free -h` |
| Weekly | The controller's backups exist | `sudo ls -l /opt/omada/data/autobackup/` (newest from last night) |
| Weekly | EAPs online | Controller → Devices: all `Connected` |
| Every 2 to 3 months | Controller update check (never automatic) | Section 8 |

---

## 6. Passwords and secrets of this part (no values here)

| Secret | Where it lives | Notes |
|---|---|---|
| Controller admin login | your password manager | Used only through the tunnel |
| Device account (`eap-admin`) of the hand-made Oswagolink site | your password manager | Every adopted EAP keeps this login inside itself: never the same as the admin login |
| Device account of each site Oswagolink makes (since V2-2) | the database, **encrypted** (`routers.omada_device_password_encrypted`) | A different random 24-character password per business; never shown in a panel |
| One-time setup login `oswsetup` (since V2-3) | the database, **encrypted** (`routers.omada_setup_password_encrypted`) | Shown only to that business, in its Connect window, until its access point is adopted. Only useful before adoption: afterwards the EAP has the device account |
| Open API key `oswagolink-backend` (Client ID + Client Secret, created 6 Nov 2026) | only the VPS `.env` (`OMADA_OPENAPI_CLIENT_ID`, `OMADA_OPENAPI_CLIENT_SECRET`) | Mode Client, role **Admin**, all sites (including new ones). For automation: create/delete sites, adopt EAPs, speeds. If it leaks: delete the app in Global > Settings > Platform Integration > Open API and create a new one |
| Hotspot operator (`oswagolink-portal`, the name in `OMADA_OPERATOR_USER`) | only the VPS `.env` (`OMADA_OPERATOR_PASSWORD`) | Role **Hotspot Admin**: can let phones in and out, cannot change the controller. Since V2-2 Oswagolink adds each new site to its site list (and removes it when the router is deleted); this sends its password (from `.env`) to the controller, never anywhere else |
| The controller's data `/opt/omada/` and its backups | VPS, root and the box only | Hold the controller's settings and logins: **never share or copy into the project** |
| MongoDB (inside the box) | no password, but only reachable from inside the VPS (`127.0.0.1:27217`) | Never open 27217 |
| Not secret | the controller ID (`omadacId`), site IDs, the Inform URL | Fine to send to Claude |

**Never** screenshot a password box with the eye open. From the browser's developer tools copy only
**Request URL** and **Request method**, never the "Request Headers" (they hold the login code).

---

## 7. How an EAP joins (lessons from 5 November 2026, for technicians)

**Since V2-3 (automatic):** the technician follows the **Connect** window in the business panel
(Routers page). In step 2 below they make the local login **exactly** the setup login shown there,
and in step 4 Oswagolink adopts the EAP by itself within 1 to 3 minutes. The steps below stay
valid for sites made by hand.

1. Plug the EAP (PoE adapter) into the business's internet box. Reset it if it was used before.
2. Phone → the EAP's factory WiFi → `omadaeap.net` → it asks for a new local login: use a
   temporary one, **or** directly the device account (`eap-admin` + its password).
3. **System → Controller Settings → Controller Inform URL**, type **exactly** (all small letters,
   no spaces; phones like to add capitals and spaces):
   `oswagolink.co.tz?dPort=29810&mPort=29814&omadacId=cd94399be58321df0d45c1ff32d49f95`
   - Only the **32-character** controller ID works (from `https://127.0.0.1:8043/api/info`).
     The 24-character ID in the controller's copied "Site URL" is refused ("not hexadecimal"),
     and so is `omada://` at the start.
   - If the EAP never shows up with the **name**, use the **number**: `69.62.105.119?dPort=…`
     (behind the laptop's internet sharing the name did not work).
4. Controller → Devices: within 1 to 2 minutes the EAP shows **Pending** → **Adopt**.
   - "Failed to adopt … username or password is incorrect" = the EAP's local login is not the
     device account. Either **Retry** and type the EAP's temporary login, or set the EAP's
     **System → User Account** to the device account, then Retry.
5. Wait for **Connected**. Then switch off or password-protect the internet box's own WiFi, so
   customers cannot skip paying.

---

## 8. Updating the controller (every 2 to 3 months, never automatic)

Always together with Claude, on a quiet day:
1. **Hostinger snapshot** first.
2. Claude reads TP-Link's release notes and checks that Java 21 and MongoDB 8 still fit.
3. Claude downloads the new official Linux `.tar.gz`, measures its fingerprint, updates
   `vps/omada/Dockerfile` and pushes. You say "push" as usual.
4. VPS: `cd ~/WI-FI && git pull`, then build with the new version name (Claude gives the exact lines).
5. Stop and remove the old box, start the new one with the same `docker run` line (new name).
   The data in `/opt/omada` is kept.
6. Wait 10 minutes, open the admin page, check every EAP is `Connected`, test one voucher.
7. Problem? Start the old box again, or restore the snapshot (newer controllers may change the
   database, so going back can need the snapshot).

---

## 9. Backups of the controller

- **Today:** the controller saves its own backup every night inside `/opt/omada/data/` (Settings →
  Maintenance → Backup Schedule). **Set its time to 04:00**, so it does not run at 03:00 together with
  the database backup on our single CPU.
- Like the database backups, they stay **on the VPS**. Copying them off the VPS belongs to the
  same open task ("off-VPS backups", `OWNER-CHECKUP-GUIDE.md` section 11).
- Hostinger's weekly VPS backup also contains `/opt/omada`.
- Restoring a controller backup: always with Claude (Settings → Maintenance → Restore).

---

## 10. Removing everything (if you ever want to)

### 10a. From the VPS (in this order)
1. Stop and delete the box and its images:
   ```
   sudo docker stop omada; sudo docker rm omada
   sudo docker rmi oswagolink/omada:6.3.0.45 ubuntu:24.04
   ```
2. Check nothing is left listening: `sudo ss -tulnp | grep -E ':(8043|8088|8880|27217|2981[0-7]|19810)\b'`
   (good: no lines).
3. Close the 4 doors (each prints "Rule deleted"; if one says "Could not delete", use
   `sudo ufw status numbered` and `sudo ufw delete <number>`):
   ```
   sudo ufw delete allow 29810/udp
   sudo ufw delete allow 19810/udp
   sudo ufw delete allow 29811:29817/tcp
   sudo ufw delete allow 8880/tcp
   ```
4. Delete the controller's data (this deletes its settings and backups for good):
   ```
   sudo rm -rf /opt/omada
   ```
5. Only if nothing else uses Docker: remove Docker and its files:
   ```
   sudo apt remove --purge -y docker.io docker-buildx
   sudo rm -rf /var/lib/docker /etc/docker
   ```
6. Check the VPS is as before: `sudo ufw status numbered` (only 22, 80, 443, 51820) and
   `sysctl -n net.ipv4.ip_forward` (must say `0`).
7. In the project, `vps/omada/` and this guide can stay (they change nothing on their own) or be
   deleted with Claude.

### 10b. From your laptop
(Steps 1 to 3 were done on 6 November 2026.)
1. Settings → Apps → **Omada Network Application** → Uninstall. Then delete the folder
   `C:\Users\Dell\Omada Controller` if it is still there (it holds `data-old`).
2. PowerShell **as administrator**:
   `Remove-NetFirewallRule -DisplayName "Omada test - EAP cable only"`
3. Delete `C:\Users\Dell\omada-test` (it contains the test operator's password).
4. Turn off internet sharing to the cable if you no longer need it (WiFi adapter → Properties →
   Sharing → untick).

### 10c. The test EAP back to MikroTik use
1. Controller → Devices → the EAP → ⋮ → **Forget**.
2. Hold its **Reset** button 10 seconds.
3. Set it up standalone with the fixed address `192.168.88.2` behind the MikroTik, as before.

---

## 11. The road ahead

| Next | What | Status |
|---|---|---|
| B8 | Watch memory and billing speed | 6 Nov 2026 evening, after the busiest day: Java 1,388,964 KB (under the 1,450,000 line), box 1.56 of 1.75 GB, VPS available 1.6 GB. Morning reading on 7 Nov decides whether Java gets 600 MB instead of 700 MB |
| Phase C | Build it in: TP-Link businesses in the panels, the portal understands TP-Link links, the voucher cleaner cuts TP-Link phones off, setup guide for technicians | done 5 Nov 2026, phone tests passed |
| Phase D | Swahili and AzamPay, for MikroTik **and** TP-Link businesses | after Phase C |
| V2-0 | Open API key + test tool (`node scripts/omadaOpenApiTest.js check / trial-site / speed / speed-off`) | done 6 Nov 2026 (all tests passed); TP-Link's API document saved in `docs/tplink-openapi/` |
| V2-1 | Different speed per package + access point status in both panels | done, phone test passed 6 Nov 2026 |
| V2-2 | Create each business's site automatically | done, `trial-full` and phone test passed 6 Nov 2026 |
| V2-3 | Adopt the access point automatically (MAC checked) + Inform URL and setup login in the business panel | done, phone test passed 6 Nov 2026 (after three fixes: symbols in the setup login, Inform URL with the IP, "adopted" only when connected) |
| V2-4 | Delete Router also removes the site from the controller (only sites the system made) | done, tested 6 Nov 2026 (site gone, hand-made site stayed) |
| V2-5 | Security review of V2-0 to V2-4 + guides | next (7 Nov 2026) |
| When many TP-Link businesses | VPS with 2 CPU cores | watch section 5 |

---

## 12. Never do this

- **Never open 8043, 8088, 8843 or 27217** in the firewall (admin and database). Only the doors in 2c.
- **Never delete `/opt/omada`** unless you are removing everything (section 10).
- **Never run `docker system prune -a`** or other Docker clean-up commands from the internet:
  they can delete the controller's image.
- **Never update the controller "quickly"**: always section 8, with a snapshot first.
- **Never give the device account the same password as your admin login.**
- **Never change a business's site by hand**, never delete or rename the hand-made site
  "Oswagolink", never change the operator's password in the controller (the system logs in with
  the one in `.env`): `HOW-VPS-CONTROLS-TPLINK.md` section 9.
- **Never share** the controller's passwords, its backups, a business's setup login, or the browser's
  "Request Headers".
