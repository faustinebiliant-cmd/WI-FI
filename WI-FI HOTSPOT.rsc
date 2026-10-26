=====================================================================
OSWAGOLINK WI-FI HOTSPOT: COMPLETE GUIDE (START TO FINISH)
TP-Link EAP225 (dumb antenna) + MikroTik hEX RB750Gr3 + VPS portal
=====================================================================

THE BIG PICTURE (read this first)
- EAP225 = only broadcasts Wi-Fi. No login page, no DHCP, no routing.
- MikroTik hEX = the brain: gives IP addresses, runs the HotSpot,
  catches new phones, and lets them online only after voucher login.
- VPS (oswagolink.co.tz) = hosts the portal page and the backend that
  makes vouchers. The backend talks to the MikroTik API through a
  private WireGuard tunnel (never over the public internet).
- Flow: phone joins Wi-Fi -> MikroTik HotSpot catches it -> shows
  login.html -> login.html redirects to the portal on the VPS ->
  customer enters voucher -> portal sends the browser to the
  MikroTik login URL -> MikroTik lets them online.

NETWORK FACTS USED IN THIS GUIDE
- MikroTik LAN: 192.168.88.0/24, MikroTik address 192.168.88.1
- EAP225 fixed address: 192.168.88.2
- Wi-Fi name (SSID): Oswagolink2 (open, no password)
- VPS public IP: 69.62.105.119, portal: oswagolink.co.tz/portal
- WireGuard: VPS wg0 = 10.20.0.1, MikroTik wg-vps = 10.20.0.2,
  UDP 51820, MikroTik API port 8728 (only through the tunnel)

PLACEHOLDERS YOU MUST REPLACE
- YOUR_STRONG_PASSWORD = new MikroTik admin password
- YOUR_ROUTER_ID = router id your portal expects (inside the VPS html)
- VPS_PUBLIC_KEY / ROUTER_PUBLIC_KEY = WireGuard public keys
- API_PASSWORD = password for the backend's MikroTik API user

RULES THAT SAVE YOU TROUBLE
1. Never share WireGuard private keys, .backup files, or passwords.
2. Never open ports 8728, 5432 or 5001 to the public internet.
3. Keep Winbox "Safe Mode" OFF unless doing a risky change. If it is
   ON and the connection drops, RouterOS undoes your changes.
4. Run MikroTik commands in Winbox > New Terminal, one at a time.
5. Only files inside the "flash" folder survive a power-off.

=====================================================================
PART 1: MAKE THE EAP225 A DUMB ANTENNA
=====================================================================
1. Plug the EAP225 into a MikroTik LAN port (ether2 to ether5).
   NEVER into ether1 (that is the internet/WAN port).
2. Find the AP's address: in Winbox terminal run
       /ip dhcp-server lease print
   Open that address in a browser (example: http://192.168.88.253).
3. Run the Omada setup wizard. On "Configure wireless settings":
   - 2.4GHz: Enable, SSID = Oswagolink2, Password = EMPTY
   - 5GHz:   Enable, SSID = Oswagolink2 (same name), Password = EMPTY
   An empty password (open Wi-Fi) is required so the login page can
   pop up on phones.
4. Give the AP a fixed address: Management > Network:
   - Static
   - IP Address: 192.168.88.2
   - IP Mask: 255.255.255.0
   - Gateway: 192.168.88.1
   - Primary DNS: 192.168.88.1 (or 8.8.8.8)
   - Secondary DNS: 8.8.4.4
   Save. The page will stop responding. That is normal. Reconnect and
   open http://192.168.88.2.
5. Do NOT enable any captive portal/"Portal" feature on the Omada.
6. Optional: turn on client isolation (Wireless > Advanced) so guests
   cannot see each other.
7. If you ever lock yourself out of the AP: hold its reset button
   about 10 seconds. It returns to factory settings.

=====================================================================
PART 2: MIKROTIK BASICS
=====================================================================
Start from the factory default configuration (a new or reset router
that kept its defaults). It already has a bridge, DHCP server and
internet sharing (NAT). ether1 = internet, ether2-5 = LAN.

1. Open Winbox, connect (by MAC address if the IP does not work).
2. Set an admin password:
       /user set admin password=YOUR_STRONG_PASSWORD
3. Check internet from the router itself:
       /ping 8.8.8.8 count=3
   If this fails, fix ether1/ISP first. Nothing else will work.
4. Give the router its own DNS (needed for /tool fetch):
       /ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes
       /ping oswagolink.co.tz count=3
   Both must reply. "resolving error" later means this step failed.
5. Set the clock/time zone and automatic time (voucher timing needs
   the correct time, especially after power cuts):
       /system clock set time-zone-name=Africa/Dar_es_Salaam
       /system ntp client set enabled=yes servers=time.google.com

=====================================================================
PART 3: TURN ON THE HOTSPOT (LOGIN PAGE FOR GUESTS)
=====================================================================
1. Start the wizard:
       /ip hotspot setup
   Answers:
   - hotspot interface: bridge
   - local address of network: 192.168.88.1/24
   - masquerade network: yes
   - address pool: 192.168.88.10-192.168.88.254
   - SSL certificate: none
   - SMTP server: 0.0.0.0
   - DNS servers: 8.8.8.8,8.8.4.4
   - DNS name: (leave empty)
2. Let the AP skip the login (otherwise the AP itself is treated as a
   guest):
       /ip hotspot ip-binding add address=192.168.88.2 type=bypassed comment="EAP225"
3. Allow the portal BEFORE login (walled garden). Add any payment
   gateway domains (mobile money) the same way:
       /ip hotspot walled-garden add dst-host=oswagolink.co.tz
       /ip hotspot walled-garden ip add dst-address=69.62.105.119 action=accept
4. Use PAP login (needed so your portal can log the customer in):
       /ip hotspot profile set [find] login-by=http-pap
5. Check everything:
       /ip hotspot print
       /ip hotspot profile print
       /ip hotspot ip-binding print
       /ip hotspot walled-garden print
       /ip hotspot walled-garden ip print
6. TEST with the default MikroTik page first:
   - On a phone: forget Oswagolink2, reconnect, turn mobile data OFF,
     open http://neverssl.com. The MikroTik login page should show.
   - Make a test user:
         /ip hotspot user add name=test password=1234
     Log in with test / 1234. If websites open, the whole chain works.
   - Remove the test user AND kick its session (removing the user does
     not log out a running session):
         /ip hotspot user remove [find name=test]
         /ip hotspot active remove [find user=test]
         /ip hotspot active print

=====================================================================
PART 4: REDIRECT PAGE ON THE VPS (SERVER SIDE)
=====================================================================
On the VPS (SSH as user biliant):
1. Create the file (it must contain HTML only, never Nginx code):
       sudo nano /var/www/wifi-app/hotspot/mikrotik_login.html
   Paste this, with YOUR_ROUTER_ID replaced:

   <!doctype html>
   <html lang="en">
   <head>
     <meta charset="utf-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>Redirecting...</title>
   </head>
   <body>
     <p>Opening Wi-Fi login...</p>
     <script>
       const router = "YOUR_ROUTER_ID";
       const mac = "$(mac)";
       const login = "$(link-login-only)";
       const original = "$(link-orig)";
       const portal =
         "https://oswagolink.co.tz/portal/" +
         "?router=" + encodeURIComponent(router) +
         "&mac=" + encodeURIComponent(mac) +
         "&login=" + encodeURIComponent(login) +
         "&orig=" + encodeURIComponent(original);
       window.location.replace(portal);
     </script>
   </body>
   </html>

   Save in nano: Ctrl+O, Enter, Ctrl+X.
   The $(mac), $(link-login-only), $(link-orig) are filled in by the
   MikroTik when it serves the page. Do not change them.
2. Make Nginx serve it. Inside your HTTPS server block add (skip if
   you already have a working one):
       location = /mikrotik_login.html {
           alias /var/www/wifi-app/hotspot/mikrotik_login.html;
           default_type text/html;
       }
   Then:
       sudo nginx -t
       sudo systemctl reload nginx
3. Verify (you need "200" and the text line):
       curl -sI https://oswagolink.co.tz/mikrotik_login.html | head -3
       curl -s https://oswagolink.co.tz/mikrotik_login.html | grep "Opening Wi-Fi login"
   If grep prints nothing, Nginx is serving the wrong file (often the
   React index.html).

=====================================================================
PART 5: PUT THE REDIRECT PAGE ON THE MIKROTIK (PERMANENT)
=====================================================================
IMPORTANT LESSON: the HotSpot only reads its pages from the folder in
its profile (html-directory). On the hEX this is flash/hotspot, and
RouterOS rewrites any other value (such as "hotspot") back to
flash/hotspot. Using the plain "hotspot" folder does NOT work and is
lost on reboot. Always use flash/hotspot.

1. Check the folder name:
       /ip hotspot profile print
   hsprof1 should show html-directory=flash/hotspot.
2. If a rebuild said "copy failed", a 0-byte FILE named flash/hotspot
   is blocking the folder. Check and remove it:
       /file print where name~"flash/hotspot"
       /file remove [find name="flash/hotspot"]
3. Rebuild the default pages:
       /ip hotspot reset-html
   Type 0 for "numbers", then y. Then check:
       /file print where name~"flash/hotspot"
   You should see login.html, alogin.html, status.html, logout.html...
4. Replace the login page with your redirect:
       /file remove flash/hotspot/login.html
       /tool fetch url="https://oswagolink.co.tz/mikrotik_login.html" dst-path="flash/hotspot/login.html" check-certificate=no
       /file print where name="flash/hotspot/login.html"
   The size should be small (about 700 bytes). If it is about 4400
   bytes, that is still the default MikroTik page.
5. Reload the HotSpot:
       /ip hotspot disable 0
       /ip hotspot enable 0
   (use the number shown by /ip hotspot print if it is not 0)
6. TEST like a customer: phone > forget Oswagolink2 > reconnect >
   mobile data OFF > the sign-in popup opens your portal. If no popup,
   open http://neverssl.com in the browser.
7. Delete the useless test copy if it exists:
       /file remove [find name="hotspot/mikrotik_login.html"]

=====================================================================
PART 6: PORTAL RULES (WHAT YOUR CODE MUST DO)
=====================================================================
- The redirect gives your portal these values in the URL: router, mac,
  login (http://192.168.88.1/login), orig.
- After the voucher is accepted, the portal must send the WHOLE
  BROWSER to the MikroTik login URL, for example:
      window.location.href = login + "?username=" + encodeURIComponent(code)
        + "&password=" + encodeURIComponent(pass)
        + "&dst=" + encodeURIComponent("https://oswagolink.co.tz/");
  Do NOT call it with fetch()/background requests: an https page is
  blocked from calling an http address (mixed content). This was the
  cause of "portal says connected but no internet".
- Your backend creates the voucher as a hotspot user through the API
  (they appear in /ip hotspot user print). Code-only vouchers have no
  password; that is normal for your setup. Do not delete them.
- Add every payment gateway / CDN / font domain your portal page loads
  to the walled garden, or the page renders broken before login:
      /ip hotspot walled-garden add dst-host=GATEWAY_DOMAIN

=====================================================================
PART 7: WIREGUARD TUNNEL + BACKEND API (ONLY IF BUILDING FROM ZERO)
=====================================================================
MikroTik side:
1. Create the interface, address and read the router's public key:
       /interface wireguard add name=wg-vps listen-port=51820 mtu=1420
       /ip address add address=10.20.0.2/24 interface=wg-vps
       /interface wireguard print
   Copy the public-key. Send it to the VPS side (public keys are safe
   to share, private keys never).
2. Get the VPS public key (on the VPS): sudo wg show wg0 public-key
3. Add the VPS as a peer on the MikroTik:
       /interface wireguard peers add interface=wg-vps name=peer1 public-key="VPS_PUBLIC_KEY" endpoint-address=69.62.105.119 endpoint-port=51820 allowed-address=10.20.0.1/32 persistent-keepalive=25s comment="WI-FI VPS"
4. Allow ONLY the VPS to reach the API, through the tunnel, placed
   first in the input chain:
       /ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 in-interface=wg-vps src-address=10.20.0.1 place-before=0 comment="Allow VPS API through WireGuard"
5. Create a dedicated API user (do not use admin for the backend):
       /user group add name=apigroup policy=api,read,write,policy,test
       /user add name=wifiapi group=apigroup address=10.20.0.1 password=API_PASSWORD

VPS side (/etc/wireguard/wg0.conf, [Peer] section for the router):
       PublicKey = ROUTER_PUBLIC_KEY
       AllowedIPs = 10.20.0.2/32
   Apply: sudo systemctl restart wg-quick@wg0
   Keep the tunnel starting at boot:
       sudo systemctl enable wg-quick@wg0
   (UDP 51820 must be allowed in the VPS firewall. Restarting PM2 does
   not touch WireGuard.)

Tests (on the VPS):
       sudo wg show                      (recent handshake)
       ping -c 3 10.20.0.2
       nc -vz -w 5 10.20.0.2 8728
Tenant Panel router record: host 10.20.0.2, port 8728, user wifiapi,
its password, real mode ON (not mock mode).
If the MikroTik is offline, the backend cannot reach it until the
router reconnects and a new handshake appears.

=====================================================================
PART 8: SECURITY HARDENING (DO THIS)
=====================================================================
1. Guests are on the LAN, so they could reach router services. Limit
   them (keep Safe Mode on while doing this, Winbox may drop):
       /ip service set api address=10.20.0.1/32
       /ip service set winbox address=192.168.88.0/24
       /ip service disable telnet,ftp,www,ssh
   (use your admin PC's fixed IP instead of the whole LAN if possible)
2. Stop guests using the VPS tunnel:
       /ip firewall filter add chain=forward action=drop src-address=192.168.88.0/24 out-interface=wg-vps place-before=0 comment="guests cannot use VPS tunnel"
3. Stop USB sharing to the LAN:
       /disk settings set auto-media-sharing=no auto-smb-sharing=no
4. Remove any hotspot user you do not recognise:
       /ip hotspot user print
5. Never expose 8728, 5432 or 5001 publicly.

=====================================================================
PART 9: POWER-OFF PROTECTION AND BACKUPS
=====================================================================
SURVIVES A POWER-OFF:
- All RouterOS settings (HotSpot, walled garden, firewall, WireGuard,
  DNS, DHCP). They save automatically. There is no save button.
- Files in flash/, including flash/hotspot/login.html
- Hotspot users and their used time
- The EAP225's own settings (it stores them itself)
LOST ON POWER-OFF:
- Active customer sessions (customers must log in again; remaining
  time/data is kept)
- Files outside flash/ (for example the root hotspot/ folder)
- The log (it lives in memory)
- Any change made while Safe Mode was ON and the connection dropped

MAKE A BACKUP (save INSIDE flash so a reboot does not delete it):
       /system backup save name=flash/oswagolink-working
       /export file=flash/oswagolink-config
DOWNLOAD IT (a backup left on the router dies with the router):
1. Winbox > Files > click the + next to "flash".
2. Click oswagolink-working.backup > Download... > save to your PC.
3. Do the same for oswagolink-config.rsc.
4. Copy both to a flash drive or private cloud storage.
5. Keep them private: .backup contains passwords and keys.
Repeat after every important change and before every RouterOS update.

RESTORE:
- Same router/model: upload the .backup in Winbox Files, then
       /system backup load name=oswagolink-working
- From the text file: upload the .rsc, then
       /import file-name=oswagolink-config.rsc

REBOOT TEST (do once, when no customers are online):
       /system reboot
After about a minute:
       /file print where name="flash/hotspot/login.html"
       /ip hotspot print
       /ip hotspot profile print
       /interface wireguard peers print
login.html must still be there, hsprof1 must show
html-directory=flash/hotspot, and the WireGuard peer must show a
recent handshake. Then test a phone with a voucher.
After a power cut: power the hEX first (or both together). The tunnel
reconnects by itself within about 25 seconds. A small UPS protects the
flash storage and keeps customers online.

=====================================================================
PART 10: USING A NEW MIKROTIK (SAME MODEL hEX RB750Gr3)
=====================================================================
What the .rsc file does NOT hold: the WireGuard private key, the admin
password, the API user password, and the login.html file.
1. On your PC, copy oswagolink-config.rsc and edit the copy:
   - In the "/interface bridge" line remove admin-mac=... and
     auto-mac=no (that MAC belongs to the old router).
   - Optionally delete the "/ip hotspot user" lines (the backend
     creates the real vouchers).
2. Connect to the new router by MAC in Winbox and wipe it:
       /system reset-configuration no-defaults=yes skip-backup=yes
   Reconnect by MAC and set the password:
       /user set admin password=YOUR_STRONG_PASSWORD
3. Upload the edited .rsc in Files, then:
       /import file-name=oswagolink-config.rsc
   (if it stops with an error, read the message before going on)
4. Give the new router internet on ether1 and rebuild the login page
   (Part 5, steps 3 to 5).
5. Give the VPS the new router's key:
       (router)  /interface wireguard print        copy public-key
       (VPS)     sudo wg set wg0 peer OLD_ROUTER_PUBLIC_KEY remove
       (VPS)     sudo wg set wg0 peer NEW_ROUTER_PUBLIC_KEY allowed-ips 10.20.0.2/32
       (VPS)     sudo nano /etc/wireguard/wg0.conf   replace the
                 router PublicKey with the new one so it survives restarts
       (VPS)     sudo wg show   and   nc -vz -w 5 10.20.0.2 8728
6. Re-create the API user and the Part 8 hardening if they are not
   in the file, then update the Tenant Panel router record if the API
   user changed.
7. Plug the EAP225 into ether2-5 (its settings are already stored).
8. Switch off or factory-reset the OLD router. Two routers must never
   run with the same WireGuard key.
Alternative (same model only): load oswagolink-working.backup on the
new router. It restores the private key too, so the VPS needs no
change. The old router must stay off.
If the new router is a different model, use the .rsc and rename the
interfaces (ether1, bridge ports) to match the new one.

=====================================================================
PART 11: TROUBLESHOOTING (WHAT WE MET AND THE FIX)
=====================================================================
- Phone connects, no login page, internet works freely
  -> HotSpot not running or not on the bridge.
     /ip hotspot print must show interface=bridge, not disabled.
- Still the MikroTik default login page after uploading mine
  -> HotSpot reads the folder in its profile (flash/hotspot). Fix
     Part 5. Check hsprof1 html-directory. Forget the Wi-Fi, reconnect,
     and test in a normal browser at http://neverssl.com (the popup
     window caches pages).
- /tool fetch says "resolving error"
  -> router has no DNS or no internet. Part 2, steps 3 and 4.
- /ip hotspot reset-html says "copy failed"
  -> a 0-byte file named flash/hotspot is in the way. Remove it
     (Part 5, step 2).
- Browser on PC says "ERR_CONNECTION_TIMED_OUT" for 192.168.88.1
  -> the PC is not on the MikroTik LAN. Use a phone connected to
     Oswagolink2. (Winbox still works over MAC.)
- 404 Not Found on 192.168.88.1/mikrotik_login.html
  -> HotSpot only serves files from its html folder, and
     only login.html is the entry page. Test through the real flow.
- Portal opens, voucher "accepted", but no internet
  -> portal must navigate the whole browser to the login URL (Part 6),
     not fetch it. Check: /ip hotspot active print (is the phone in
     the list?), /ip hotspot user print (does the voucher exist?),
     /log print where topics~"hotspot" (login errors).
     Quick test: open on the phone
     http://192.168.88.1/login?username=VOUCHER&password=PASS&dst=http://neverssl.com
- Portal page loads broken before login
  -> missing walled-garden hosts (scripts, fonts, payment gateways).
- Session still active after removing a user
  -> /ip hotspot active remove [find user=NAME]
- Changes vanished
  -> Safe Mode was on and the connection dropped, or files were saved
     outside flash/.
- Backend cannot reach the router
  -> check on the VPS: sudo wg show, ping -c 3 10.20.0.2,
     nc -vz -w 5 10.20.0.2 8728; check the Tenant Panel record
     (host 10.20.0.2, port 8728, API user, real mode).
- Go back to the default MikroTik pages any time:
       /ip hotspot reset-html

=====================================================================
DAILY / WEEKLY HEALTH CHECK
=====================================================================
       /ip hotspot active print          who is online
       /ip hotspot user print            vouchers and used time
       /log print where topics~"hotspot" login problems
       /system resource print            CPU, memory, free storage
       /interface wireguard peers print  recent handshake
On the VPS: sudo wg show     pm2 status     sudo nginx -t
Update RouterOS only after a fresh backup, never while customers are
online.
=====================================================================