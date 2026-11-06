# Oswagolink: TP-Link Controller Guide

Everything about the TP-Link (Omada) part of Oswagolink: what was installed, where, and why;
how to use and check it; what to do when something goes wrong; how to update it; and how to
remove all of it. Plain English, **no secret values** in this file.

Related guides: `VPS-HANDBOOK.md` (the whole VPS), `OWNER-CHECKUP-GUIDE.md` (regular checks),
`SECURITY-STATUS.md` (protections). Technical commands: `vps/omada/README.md`.

Last updated: 5 November 2026

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

---

## 2. What was installed and changed, and why (history)

### 2a. On the VPS
| Date | What | Why | Undo (section 10) |
|---|---|---|---|
| 5 Nov 2026 | **Docker** (Ubuntu's own package `docker.io`, plus `docker-buildx`) | TP-Link does not support our Ubuntu 26.04. Inside a sealed box (Docker) the controller gets Ubuntu 24.04, which TP-Link supports. The box also lets us limit its memory and CPU, and remove it cleanly | 10a step 5 |
| 5 Nov 2026 | **Docker settings file** `/etc/docker/daemon.json` | Docker must **never** touch the firewall or switch on "forwarding" (forwarding stays off so one router can never reach another). Docker's logs are kept small (3 files of 10 MB) | 10a step 5 |
| 5 Nov 2026 | **The box recipe** `vps/omada/` in the project (Dockerfile, starter, README) | Builds the box from official parts only: Ubuntu 24.04, Java 21, MongoDB 8.0, and the controller 6.3.0.45 from `static.tp-link.com`, refused if its fingerprint (SHA256) does not match | delete the image, 10a step 1 |
| 5 Nov 2026 | **The box itself**, name `omada` | Runs the controller all the time; restarts by itself after a crash or reboot; at most **1.5 GB** memory and **60% of the CPU**; no special rights; runs as an ordinary user (not root) | 10a step 1 |
| 5 Nov 2026 | **Folder `/opt/omada/`** (data + logs) | The controller's database, settings and automatic backups. Kept outside the box so updates do not lose anything | 10a step 4 |
| 6 Nov 2026 | **Java memory settings** in the starter (`MALLOC_ARENA_MAX=2`, network buffers 128 MB, code space 96 MB) | Java used 1.38 GB with a 700 MB heap and slowly climbed to the box's 1.5 GB limit; these are the standard fixes for that climb | rebuild without them (not needed) |
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
| Site | `Oswagolink` (one site for now) | Later: **one site per business**, so businesses can never see each other |
| Device account (site settings) | `eap-admin` + strong password | The login every adopted EAP gets. Different from your admin login |
| Test WiFi, portal, speed profile, operator | `Oswagolink TP Test`, External Portal `https://oswagolink.co.tz/portal/`, pre-auth only the VPS (`69.62.105.119/32`), `Speed-2M`, operator `portal-test` (Hotspot **Admin**, only this site) | The test setup. Phase C makes these per business |

### 2c. Doors (ports) on the VPS for the controller
| Port | Open to the internet? | Used for |
|---|---|---|
| 29810 / udp, 19810 / udp | **Yes** | EAPs knock to find the controller |
| 29811 to 29817 / tcp | **Yes** | EAPs are managed through these |
| 8880 / tcp | **Yes** | The portal entrance (phones pass through on their way to our portal). Its front page only points to 8043, which is closed |
| 8043 | **No** (only through your SSH tunnel) | The controller's admin page |
| 8088, 8843, 8044, 27001, 19810/tcp | **No** | Admin and TP-Link extras we do not use |
| 27217 | **No**, and it only listens inside the VPS | The controller's MongoDB database |

### 2d. On your laptop (test leftovers, to clean up: section 10b)
| What | Why it is there |
|---|---|
| "Omada Network Application" (Windows) in `C:\Users\Dell\Omada Controller\` (with an old `data-old` folder) | Phase A test controller (4 November 2026) |
| Windows firewall rule **"Omada test - EAP cable only"** | Let the EAP on the cable reach the laptop controller |
| Folder `C:\Users\Dell\omada-test\` (`approve.js`, `operator.json`) | The test script. `operator.json` holds the test operator's password. **Keep it until Phase C is built**, then delete it |
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
| Memory and CPU | `sudo docker stats --no-stream --format '{{.Name}}  CPU {{.CPUPerc}}  MEM {{.MemUsage}}'` | memory under 1.5 GB, CPU usually a few % |
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
4. Make sure the laptop's own Omada program is **not** running (it would take the same address).

**The tunnel drops often** ("client_loop: send disconnect: Connection reset"). Then the page's
buttons silently do nothing. Press Ctrl+C in the tunnel window, run step 1 again, press F5.
"channel 2: open failed: Connection refused" means the controller is still starting: wait.

---

## 5. Checks

| When | What | How |
|---|---|---|
| Daily (with the backend check) | Controller running | Section 3, "Is it running?" |
| Weekly | Memory under 1.5 GB; VPS `available` above 1 GB | Section 3 + `free -h` |
| Weekly | The controller's backups exist | `sudo ls -l /opt/omada/data/autobackup/` (newest from last night) |
| Weekly | EAPs online | Controller → Devices: all `Connected` |
| Every 2 to 3 months | Controller update check (never automatic) | Section 8 |

---

## 6. Passwords and secrets of this part (no values here)

| Secret | Where it lives | Notes |
|---|---|---|
| Controller admin login | your password manager | Used only through the tunnel |
| Device account (`eap-admin`) | your password manager | Every adopted EAP keeps this login inside itself: never the same as the admin login |
| Hotspot operator (`portal-test` today) | laptop `omada-test\operator.json` (test); in Phase C only in the VPS `.env` | Role **Hotspot Admin**: can let phones in and out, cannot change the controller |
| The controller's data `/opt/omada/` and its backups | VPS, root and the box only | Hold the controller's settings and logins: **never share or copy into the project** |
| MongoDB (inside the box) | no password, but only reachable from inside the VPS (`127.0.0.1:27217`) | Never open 27217 |
| Not secret | the controller ID (`omadacId`), site IDs, the Inform URL | Fine to send to Claude |

**Never** screenshot a password box with the eye open. From the browser's developer tools copy only
**Request URL** and **Request method**, never the "Request Headers" (they hold the login code).

---

## 7. How an EAP joins (lessons from 5 November 2026, for technicians)

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
| B8 | Watch memory and billing speed for a day | in progress (5 Nov 2026: controller 1.38 of 1.5 GB, CPU 2%, VPS available 1.7 GB, load 0.09) |
| Phase C | Build it in: TP-Link businesses in the panels, the portal understands TP-Link links, the voucher cleaner cuts TP-Link phones off, one site per business, setup guide for technicians, security review | Plan to be written first, then your "go" |
| Phase D | Swahili and AzamPay, for MikroTik **and** TP-Link businesses | after Phase C |
| Later | Different speed per package (TP-Link's Open API) | the first version uses one speed per business |
| Later | Create each business's site automatically (today: you create it, about 10 minutes, from a checklist) | after the first 5 to 10 TP-Link customers |
| When many TP-Link businesses | VPS with 2 CPU cores | watch section 5 |

---

## 12. Never do this

- **Never open 8043, 8088, 8843 or 27217** in the firewall (admin and database). Only the doors in 2c.
- **Never delete `/opt/omada`** unless you are removing everything (section 10).
- **Never run `docker system prune -a`** or other Docker clean-up commands from the internet:
  they can delete the controller's image.
- **Never update the controller "quickly"**: always section 8, with a snapshot first.
- **Never give the device account the same password as your admin login.**
- **Never share** the controller's passwords, its backups, `operator.json`, or the browser's
  "Request Headers".
