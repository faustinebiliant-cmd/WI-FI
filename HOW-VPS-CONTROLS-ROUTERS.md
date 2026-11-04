# How the VPS Controls the Routers

Everything on the VPS that connects to, sets up, or controls the MikroTik routers, in
plain English. No secrets in this file. For daily checks see `OWNER-CHECKUP-GUIDE.md`; for
security see `SECURITY-STATUS.md`; for setting up a router see the admin panel's Setup Guide.

Last updated: 3 November 2026

---

## 1. The big picture

```
   Customer's phone
         |  (WiFi)
   Access point (192.168.88.2 to .9)
         |  (cable, port 2-5)
   MikroTik router  ---------- internet (port 1) ----------  VPS  oswagolink.co.tz
   "oswagolink-10-20-0-X"                                       69.62.105.119
         |                                                         |
         +========= private tunnel (WireGuard) ====================+
           router 10.20.0.X  <------------------------------>  VPS 10.20.0.1
```

There are **two roads** between a router and the VPS:

| Road | Used for | Who starts it |
|---|---|---|
| **The normal internet** (HTTPS, the padlock) | The router downloads its setup and its login page; customers' phones open the portal | The router or the phone |
| **The private tunnel** (WireGuard) | The VPS controls the router: creates voucher users, disconnects customers, asks who is online, checks the router is alive | The VPS |

The tunnel is like a private, locked corridor between the VPS and each router. Every router
has its **own** corridor and its own address in it (10.20.0.3, 10.20.0.4, ...). The VPS is
always **10.20.0.1**. One router can never walk into another router's corridor.

---

## 2. What on the VPS takes part

### 2a. The tunnel: WireGuard
| What | Where | In plain English |
|---|---|---|
| Tunnel settings | `/etc/wireguard/wg0.conf` (only root can read it) | The VPS's own tunnel key and a list of every router allowed in: each router's **public** key and its one address (10.20.0.X/32) |
| Tunnel door | UDP port **51820**, open in the firewall | Where routers knock to enter their corridor. Without the right key, nobody gets in |
| No traffic between routers | `ip_forward = 0` on the VPS | Even a router that someone tampered with cannot reach another router |

**Never edit `wg0.conf` by hand.** The two helpers below do it safely.

### 2b. The two helpers (the only things that change the tunnel list)
| Helper | Where | What it does |
|---|---|---|
| `wifi-wireguard-add-peer` | `/usr/local/sbin/` (copy in `vps/`) | Adds one new router to the tunnel list. Checks the key and address are correctly shaped, refuses duplicates, saves only after WireGuard accepted it |
| `wifi-wireguard-remove-peer` | `/usr/local/sbin/` (copy in `vps/`) | Removes one router from the tunnel list (makes a backup copy first). Removing one that is already gone is fine |

The backend is allowed to run **only these two** with `sudo` and no password, nothing else.
They never run typed text as a command. A lock makes sure two changes never happen at once.

### 2c. The backend (PM2 program `wifi-backend`)
The program that does all the work. Its router parts:

| Part (file in `backend/`) | When it runs | What it does with routers |
|---|---|---|
| **Router setup links** (`controllers/provisionController.js`) | When a router is being set up | Hands out the router's setup script, its customer login page, and accepts its tunnel key ("registration") |
| **Router remote control** (`services/routers/MikroTikRouter.js`) | Whenever needed | Logs in to the router **through the tunnel** (port 8728, the router's API) to create or remove voucher users, disconnect a customer, list who is online, check status, open/close the staff door. Refuses any router answer bigger than 2 MB |
| **Voucher expiry** (`services/sessionCleaner.js`) | Every **15 seconds** | Ends vouchers whose time is up and removes them from the router |
| **Online check** (same file) | Every **1 minute** | Compares who the database thinks is online with who the router says is online. A router that does not answer 3 times in a row counts as offline |
| **Router pinger** (`scripts/pingRouters.js`) | Every **5 minutes** | Marks routers online/offline. "Offline" only after 8 minutes of silence |
| **Emergency key** (`scripts/routerStaffDoor.js`) | Only when you run it | Opens or closes one router's staff door (Winbox) through the tunnel |

### 2d. The database (what it knows about each router)
Table `routers`. **Never share `SELECT *` from this table**: it holds secrets.

| Column | Meaning | Secret? |
|---|---|---|
| `name`, `location_label` | What the business called it | No |
| `tunnel_ip` / `ip_address` | Its address in the tunnel (10.20.0.X) | No |
| `router_token` | The code in the customer portal link | No (customers see it) |
| `provision_token` | The one-time setup code (30 minutes) | **Yes** |
| `api_password_encrypted` | The router's API password, locked with `ROUTER_ENCRYPTION_KEY` | **Yes** |
| `public_key` | The router's **public** tunnel key: how the VPS finds its corridor to remove it | No (public keys are safe to show) |
| `provisioned_at` | When its setup finished | No |
| `status`, `last_seen_at` | Online/offline and when it last answered | No |

### 2e. Settings in `backend/.env` that matter for routers
| Setting | Meaning |
|---|---|
| `ROUTER_MODE=real` | Talk to real routers (`mock` is only for a programmer's computer) |
| `ROUTER_ENCRYPTION_KEY` | Unlocks every router's API password. **Never change it**: every router password would become unreadable and every router would need a new setup |

### 2f. The website (Nginx)
Serves the customer portal (`/portal/`) and the router setup links (`/api/provision/...`)
over HTTPS. Routers check the certificate before downloading anything, so nobody can hand
them a fake setup script.

---

## 3. What the setup puts on each router

| On the router | What it is for |
|---|---|
| Name `oswagolink-10-20-0-X` | Shows its tunnel address at a glance |
| Tunnel `wg-vps` + peer `peer1` (the VPS) | Its end of the private corridor; it only accepts the VPS (10.20.0.1) |
| User `wifiapi` | The account the VPS logs in with. Works **only** from 10.20.0.1, through the tunnel |
| Router services | API only from the VPS; web admin, SSH, Telnet, FTP switched **off** |
| Firewall rules | API only through the tunnel; customers can never use the tunnel |
| Hotspot (the customer login) on ports 2 to 5 | Every customer must log in with a voucher; `flash/hotspot/login.html` sends them to your portal |
| Access points `192.168.88.2` to `.9` | Their own traffic skips the customer login |
| 20 speed profiles (1 to 20 Mbps) | The package speeds |
| Script `wg-boot` (at start-up) | Waits for the internet, then opens the tunnel |
| Script `wg-watchdog` (every 2 minutes) | Restarts the tunnel if the VPS stops answering |
| Script `ap-port-check` (every minute) + list `ap-ports` + 5 blocking rules | **Staff door**: Winbox and the Neighbors list are blocked on ports with an access point; every other LAN port stays open for staff |

---

## 4. The life of a router

1. **Add Router** (business panel): the VPS creates the router record and a **setup code
   valid 30 minutes**.
2. **Step 1** pasted on the router: the router sets its clock, downloads its setup script over
   HTTPS, gets its tunnel address (10.20.0.X), builds everything in section 3.
3. **Registration** (end of step 1): the router sends its **public** tunnel key. The VPS adds
   it with the add-helper and saves the key. The setup code is used up. **SETUP COMPLETE**.
4. **Step 2**: the router downloads its customer login page.
5. **Within about 5 minutes**: the tunnel is up, the VPS reaches the router, it shows **ONLINE**.
6. **Every day**: the VPS creates voucher users, removes ended ones, checks who is online.
7. **Delete Router** (business panel) or **Delete Business** (admin panel): the VPS removes its
   tunnel **first** with the remove-helper (using the saved key), then deletes the record. If
   the tunnel cannot be removed, nothing is deleted, so no stray tunnel is ever left behind.

## 5. The life of a voucher
1. A customer connects to the WiFi; the router shows your portal.
2. They type the code; the portal asks the VPS; the VPS checks it and **creates a user with that
   code on the router** (through the tunnel), with the package's time and speed.
3. The portal logs the phone in on the router: internet works.
4. When the time is up, the VPS (every 15 seconds) **removes the user from the router**: the
   phone is cut off.

---

## 6. Read-only checks (safe to run any time)

**Which routers are in the tunnel?**
```
sudo wg show wg0 allowed-ips | awk '{print $2}'
```
Good looks like: one `10.20.0.X/32` line per router that is set up (the same routers as the
business panels' Routers pages).

**When did each router last talk to the VPS?**
```
sudo wg show wg0 latest-handshakes
```
Good looks like: a recent time (a few minutes) for every router that is switched on.

**Can the VPS reach one router?**
```
ping -c 3 10.20.0.X
```
Good looks like: 3 replies.

**Are the fixed helpers installed?**
```
grep -c "mktemp -d" /usr/local/sbin/wifi-wireguard-add-peer /usr/local/sbin/wifi-wireguard-remove-peer
```
Good looks like: `:1` at the end of both lines.

**Any router errors?**
```
pm2 logs wifi-backend --err --lines 30 --nostream
```
What each message means: `OWNER-CHECKUP-GUIDE.md` section 13.

---

## 7. When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| Router **OFFLINE** | No answer through the tunnel for 8 minutes | Is it switched on, with internet in port 1? It comes back by itself within about 5 minutes |
| **REGISTRATION FAILED** during setup | The VPS could not add the tunnel | Send Claude the result of the command below this table. Then reset the router and run the setup again |
| **ALREADY PROVISIONED** | The router was set up before | Reset it (`/system reset-configuration`, then `y`) and start again |
| Staff cannot open Winbox on any port | The staff door is closed everywhere | Admin Setup Guide, "Emergency key": `node scripts/routerStaffDoor.js open 10.20.X.Y`, then `close` when done |
| Error log: `A router sent more than 2 MB ... Router: 10.20.X.Y` | Someone has probably tampered with that router | Tell Claude the same day (`SECURITY-STATUS.md` section 7) |

Registration problems (for the REGISTRATION FAILED row):
```
pm2 logs wifi-backend --lines 60 --nostream | grep -iE "register|enroll"
```

---

## 8. Never do this

- **Never edit `/etc/wireguard/wg0.conf` by hand**: use the helpers (they run automatically).
- **Never open port 8728** (router API) or 5001/5432 to the internet.
- **Never share** setup commands, `backend/.env`, `SELECT *` from `routers`, or router backup
  files (`.backup`: they contain the router's passwords and keys).
- **Never change `ROUTER_ENCRYPTION_KEY`**.
- **Never repair a half-finished router setup by hand**: reset the router and run the setup again.
- After resetting a used router, remove `auto-before-reset.backup` and old `.rsc` files from its
  storage (a reset keeps files).

---

## 9. Where everything lives

| Thing | On the VPS | In the project |
|---|---|---|
| Tunnel settings | `/etc/wireguard/wg0.conf` | (secret, not in the project) |
| Tunnel helpers | `/usr/local/sbin/wifi-wireguard-add-peer`, `-remove-peer` | `vps/` (same names) |
| Router setup script (what the router downloads) | made by the backend | `backend/controllers/provisionController.js` |
| Router remote control | backend | `backend/services/routers/MikroTikRouter.js` |
| Voucher expiry and online check | backend | `backend/services/sessionCleaner.js` |
| Router pinger | backend | `backend/scripts/pingRouters.js` |
| Emergency key | `~/WI-FI/backend/scripts/routerStaffDoor.js` | `backend/scripts/routerStaffDoor.js` |
| Router settings | `~/WI-FI/backend/.env` (secret) | (secret, not in the project) |
| Router records | database `wifi_app`, table `routers` | `Database/schema.sql` |
| Technician instructions | admin panel, Router Setup Guide | `frontend/platform-panel/src/pages/SetupGuidePage.jsx` |
