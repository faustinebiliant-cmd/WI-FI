# How the VPS Controls TP-Link Access Points

How a TP-Link-only business works, in plain English: from the first setup of its access
point, through the business making packages, up to a customer using a voucher, and finally
deleting the router. No secrets in this file.

- MikroTik routers: `HOW-VPS-CONTROLS-ROUTERS.md`
- The controller itself (installing, updating, removing): `TPLINK-CONTROLLER-GUIDE.md`
- Regular checks: `OWNER-CHECKUP-GUIDE.md`

Last updated: 7 November 2026 (tested on a real phone on 6 November; memory ceilings 7 November)

---

## 1. The big picture

```
   Customer's phone
         |  (open WiFi, made by the system)
   TP-Link access point ("EAP")
         |  (cable)
   The business's own internet box -------- internet --------+
                                                             |
                                                VPS  oswagolink.co.tz (69.62.105.119)
                                                             |
              +----------------------------------------------+-------------------+
              |                                                                  |
   TP-Link controller                                               The system
   (Docker box "omada")                                             (backend "wifi-backend",
   gives the access points their orders                             portal, panels, database)
              ^                                                                  |
              +-------- the system gives the controller its orders --------------+
                        (only inside the VPS: 127.0.0.1:8043, certificate checked)
```

**Who does what:**

| Part | Its job |
|---|---|
| **The access point (EAP)** | Broadcasts the business's WiFi. Blocks every phone until it is told "let this phone in", then lets it in for the paid time, at the package speed |
| **The TP-Link controller** | TP-Link's own program, on **our VPS** (not TP-Link's cloud). Every access point reports to it and takes its orders from it |
| **The system** (the Oswagolink program on the VPS) | The brain. It tells the controller what to do: build a site for a new business, adopt its access point, let a phone in after a valid voucher, cut it off, delete the site |
| **The business panel** | Where the business adds its router, makes packages and vouchers, and sees who is online |

**The big difference from MikroTik:** there is **no tunnel** to the business and nothing to
paste on a router. The access point itself calls the VPS over the normal internet, and the
system never talks to the access point directly: it only talks to the controller, inside the
VPS.

**One site per business.** In the controller every business gets its **own site** (its own
WiFi, portal and access points). Businesses can never see each other.

---

## 2. What on the VPS takes part

| Part | Where | In plain English |
|---|---|---|
| **The controller** | Docker box `omada`, data in `/opt/omada/` | Runs all the time; restarts by itself after a crash, a reboot, or if it ever reaches its memory limit (1.75 GB). Java and its database have memory ceilings that fit inside that limit (`TPLINK-CONTROLLER-GUIDE.md` section 3) |
| **The doors for access points** | Firewall: 29810 + 19810 (udp), 29811 to 29817 (tcp) | Where access points knock to find and talk to the controller |
| **The portal entrance** | Firewall: 8880 (tcp) | Phones pass here for a moment on their way to our portal |
| **The controller's admin page** | 8043, **closed** to the internet | Only you, through the SSH tunnel |
| **The Open API key** (`oswagolink-backend`) | Only the VPS `.env` | The system's master key to the controller: build and delete sites, adopt access points, set speeds |
| **The hotspot operator** (`oswagolink-portal`) | Its password only in the VPS `.env` | A small login that can only let phones in and out. The system adds every new business site to its list |
| **Your hand-made site "Oswagolink"** | In the controller | Not used by any business. **Keep it**: it keeps the operator's site list from ever being empty, and the test commands use it (by this exact name) |

**The system's TP-Link parts** (files in `backend/`):

| Part | When it runs | What it does |
|---|---|---|
| Site builder (`services/routers/omadaSites.js`) | When a business adds or deletes a TP-Link router | Builds the whole site in seconds, or removes it |
| Adopt job (`scripts/omadaAdopt.js`) | **Every minute** | Looks for a waiting access point whose MAC a business registered, and adopts it into **that business's** site |
| TP-Link connector (`services/routers/OmadaRouter.js`) | On every voucher, disconnect, expiry | Lets a phone in (time and speed), cuts it off, lists who is online |
| Router pinger (`scripts/pingRouters.js`) | **Every 5 minutes** | Asks the controller for each access point's status. The router shows **Online** only when one of its access points is online |
| Voucher expiry (`services/sessionCleaner.js`) | **Every 15 seconds** | Ends vouchers whose time is up and cuts their phones off |
| Online check (same file) | **Every minute** | Compares who the database thinks is online with who the controller says is online |

---

## 3. The life of a TP-Link business, step by step

### Step 1: the business adds its router (business panel, about 10 seconds)
**Routers → Add Router → TP-Link.** The business types:
- the access point's **MAC** (from the sticker, for example `D4-D6-DF-A5-F8-D2`);
- a **WiFi name** (what customers will see, for example "Mama Lishe WiFi").

The system then builds the business's site in the controller, by itself:

| What it makes | Why |
|---|---|
| A new **site**: business name + router name + 8 characters (Tanzania, Africa/Nairobi time) | Its own space; never mixed with another business |
| A random **access point login** for that site (24 characters, kept encrypted) | Every access point of this business will get it. Nobody needs to know it |
| The **open WiFi** with the business's name, as a guest network | Customers join without a password; the portal decides who gets internet. Guest network = phones cannot reach the business's own computers or printers |
| A hidden **20 Mbps safety limit** per phone | Normally each phone gets its package speed; this is only the ceiling if that ever fails |
| The **portal**: External Portal `https://oswagolink.co.tz/portal/` | Every new phone is sent to our portal |
| **Before paying**, phones may open only the VPS (`69.62.105.119`) | So the portal opens, but nothing else works until a voucher is used |
| The site is **added to the operator** | So the system can let this business's phones in |
| A **one-time setup login** (`oswsetup` + 12 characters with symbols) | For the technician, see step 2 |

If any part fails, the system deletes the half-made site again and the business sees "please
try again". Nothing half-made is ever left behind.

### Step 2: the technician prepares the access point (on site, about 10 minutes)
The business panel opens the **Connect** window (also later with the **Connect** button). It
shows the steps, the setup login and the Inform URL. The technician:
1. Plugs the access point into the business's internet box (with its power adapter). If it was
   used before: holds the reset button for 10 seconds.
2. With a phone, joins the access point's own WiFi and opens **omadaeap.net**.
3. When it asks to make a login: types **exactly** the setup login from the Connect window
   (username and password; the password has symbols like `@ # * !`).
4. When it asks for WiFi names and passwords: types anything (for example `setup-temp` /
   `Temp-2026x`). The controller replaces them later.
5. Joins the `setup-temp` WiFi again, opens omadaeap.net, logs in with the setup login.
6. **System → Controller Settings → Controller Inform URL**: pastes the Inform URL and saves.
   - First try: `oswagolink.co.tz?dPort=29810&mPort=29814&omadacId=cd94399be58321df0d45c1ff32d49f95`
   - Not connected after 5 minutes? Use the second one from the Connect window (the same with
     `69.62.105.119` at the start): some internet connections cannot look up the name.

The Inform URL is **not secret**: it only says where our controller is.

### Step 3: the system adopts the access point (by itself, 1 to 5 minutes)
1. The access point knocks on the VPS (port 29810) and shows up in the controller as
   **waiting** ("pending").
2. Within a minute the **adopt job** sees it. It adopts it **only if** a business registered
   **exactly this MAC**, and only into **that business's site**. It logs in to the access
   point with the factory login or the setup login.
3. The controller gives the access point the site's own random login and the business's WiFi.
   The `setup-temp` WiFi disappears; the business's WiFi appears.
4. The access point counts as adopted only when the controller shows it **Connected**. The
   setup login then disappears from the panel (it no longer works anyway).
5. Within 5 minutes the router shows **Online** in the business panel and the admin panel.

**An access point nobody registered is never adopted.** The admin panel's Routers page lists it
as "no business registered this MAC".

### Step 4: the business makes packages and vouchers (business panel)
- **Packages → Add**: name, price, time, and a **speed from 1 to 20 Mbps** (required, exactly
  like MikroTik). Each customer of this package gets this speed.
- **Vouchers**: generate codes from a package, print them or sell them.

### Step 5: the business closes the back door
The business switches off (or puts a password on) its internet box's own WiFi, so customers
use the access point's WiFi and cannot skip paying.

---

## 4. The life of a voucher (the customer's side)

1. **The customer joins the business's WiFi.** It is open. The access point blocks everything
   except the VPS.
2. **The portal opens.** The access point sends the phone to the controller's portal entrance
   (port 8880), which passes it on to `https://oswagolink.co.tz/portal/` together with the
   details: which phone (its MAC), which access point, which site, which WiFi.
3. **The portal checks the place.** The system checks that this access point is registered to
   that site's router, and shows the business's name and packages.
4. **The customer types the voucher.** The system checks: the voucher belongs to this business
   and this router, it is not used up or cancelled, and its time is not over.
5. **The system tells the controller** (inside the VPS):
   1. cut any older approval of this phone (so the time is exactly right);
   2. give this phone its **package speed** (set before it is let in, so it never has a moment
      at full speed);
   3. **let this phone in** for the voucher's remaining time.
6. **Internet works.** The business panel's **Active Sessions** shows the phone.
7. **When the time is up:** the access point cuts the phone off by itself, and the system's
   15-second check also ends the voucher and cuts its phones (a safety net). Using the voucher
   on a second phone cuts the first phone.
8. **Early stop:** the business can press **Disconnect** (Active Sessions) or cancel the voucher;
   the system cuts the phone at once.

If setting the speed ever fails, the customer still gets in (they paid), at most at the 20 Mbps
safety limit, and the error log says so.

---

## 5. Deleting a TP-Link router

**Business panel → Routers → Delete.** No tunnel needed: the system does it all.
1. **Forgets the access point**: it goes back to factory settings (its WiFi disappears).
2. **Deletes the business's site** in the controller.
3. **Takes the site off the operator's list.**
4. Deletes the router with its packages and vouchers.

If the controller refuses (for example it is restarting), **nothing is deleted** and the
business sees "try again". Only sites the system made are ever deleted: your hand-made site
"Oswagolink" is never touched.

---

## 6. Seeing it with your own eyes (optional)

The panels show the important things without any tunnel: router status, access point status,
active sessions. To look inside the controller itself:
1. PowerShell on your PC (leave the window open; it shows nothing when it works):
   ```
   ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 8043:127.0.0.1:8043 biliant@69.62.105.119
   ```
2. Browser: **https://127.0.0.1:8043** → Advanced → Continue → log in.
3. Top left: choose a site (each business site starts with the business name).
   **Devices** = its access points, **Clients** = phones online now.

**Look, but do not change business sites by hand.** The system does not know about changes made
by hand: for example, switching off the portal would make every phone get internet for free, and
changing the "before paying" list could stop the portal opening.

---

## 7. Read-only checks (safe to run any time, on the VPS)

**Is the controller running?**
```
sudo docker ps --format '{{.Names}}  {{.Status}}'
```
Good looks like: `omada  Up …`.

**Access points waiting, and the state of every business's access point**
```
cd ~/WI-FI/backend && node scripts/omadaOpenApiTest.js waiting
```
Good looks like: `Access points waiting to be adopted: none`, and for each business site
`status 1 (online), detail 14 (Connected)` with `adopted=true`.

**What the system did with TP-Link lately**
```
pm2 logs wifi-backend --lines 40 --nostream | grep -iE "omada|adopt"
```
What each line means: `OWNER-CHECKUP-GUIDE.md` section 13, "TP-Link messages".

**Controller memory** (weekly)
```
sudo docker stats --no-stream --format '{{.Name}}  CPU {{.CPUPerc}}  MEM {{.MemUsage}}'
sudo docker top omada -o pid,args | grep -oE 'Xmx[0-9]+m|wiredTigerCacheSizeGB [0-9.]+'
```
Good looks like: box memory flat at about 1.5 to 1.7 GB (limit 1.75 GB); `Xmx600m` and
`wiredTigerCacheSizeGB 0.25` (that line twice is normal).

---

## 8. When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| Add Router says "could not prepare your WiFi … try again" | The controller refused or did not answer; nothing was saved | Try again in a minute. Again: is the controller running (section 7)? Send Claude `pm2 logs wifi-backend --lines 40 --nostream \| grep -i omada` |
| Router stays "Connect the access point" / "Waiting to be adopted" | The access point has not reached the controller, or adopting failed | 1. Inform URL with the **IP** (step 2.6). 2. Run `waiting` (section 7) and send Claude the output |
| Panel says "Not connected: see Connect", reason **wrong login** | The access point's login is not the setup login (a typing mistake) | Reset the access point (10 seconds) and do step 2 again, typing the setup login carefully |
| `waiting` shows **Managed by others** | The access point still belongs to another controller or site | Reset the access point and do step 2 again |
| Router **Offline**, access point **offline** | The access point has no power or internet | Ask the business: switched on? Internet box working? It comes back by itself |
| Every TP-Link router offline at once | The controller is down | `sudo docker restart omada`, wait 10 minutes (`OWNER-CHECKUP-GUIDE.md` section 7) |
| WiFi visible but the portal does not open | The portal entrance or the "before paying" rule is broken | Send Claude the business name and the time |
| Voucher accepted but no internet | The controller did not let the phone in | Send Claude `pm2 logs wifi-backend --lines 40 --nostream \| grep -i omada` |
| Delete Router says "try again" | The controller refused; nothing was deleted | Try again later. Again: tell Claude |

---

## 9. Never do this

- **Never change a business's site by hand** in the controller (portal, WiFi, "before paying",
  access points). Let the system do it.
- **Never delete or rename your hand-made site "Oswagolink".**
- **Never change the operator's password** in the controller (Hotspot → Operators): the system
  logs in with the password in `.env`, and every TP-Link voucher would stop working.
- **Never delete the Open API app** (Settings → Platform Integration → Open API) unless the key
  leaked: the system would stop building, adopting and deleting.
- **Never open ports 8043, 8088, 8843 or 27217.**
- **Never share** the setup login of a business, `.env`, or anything from `/opt/omada/`.
- **Never adopt an access point by hand into a business site**: register its MAC in the business
  panel and let the system adopt it.

---

## 10. Where everything lives

| Thing | On the VPS | In the project |
|---|---|---|
| The controller | Docker box `omada`, data `/opt/omada/` | `vps/omada/`, `TPLINK-CONTROLLER-GUIDE.md` |
| Site builder (create, delete, operator) | backend | `backend/services/routers/omadaSites.js` |
| Adopt job (every minute) | backend | `backend/scripts/omadaAdopt.js` |
| Letting phones in and out | backend | `backend/services/routers/OmadaRouter.js`, `omadaClient.js` |
| Open API connection (key, speeds, status) | backend | `backend/services/routers/omadaOpenApi.js` |
| Portal pages for TP-Link | backend + website | `backend/controllers/portalController.js`, `frontend/portal/` |
| TP-Link test tool (`check`, `waiting`, `trial-full`, …) | `~/WI-FI/backend/scripts/omadaOpenApiTest.js` | same |
| TP-Link's own list of commands | not used by the system | `docs/tplink-openapi/` |
| Settings and keys | `~/WI-FI/backend/.env` (secret) | (secret, not in the project) |
| Router records, access points | database `wifi_app`, tables `routers`, `omada_aps` | `Database/schema.sql` |
