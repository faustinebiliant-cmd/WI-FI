import React from 'react';
import CopyButton from '../shared/components/CopyButton';

// Technician guide: how to connect a new MikroTik and run the setup.
// Only shown in the platform panel. The setup commands themselves come from the
// business's Business Panel (Routers > Add Router, or "Setup Commands").

// A command box with a copy button in its corner
const Code = ({ children }) => (
  <div className="guide-code-box">
    <pre className="guide-code">{children}</pre>
    <CopyButton text={String(children)} toastMessage="Command copied" className="guide-code-copy" />
  </div>
);

// A short command inside a sentence, with its own copy button
const Cmd = ({ children }) => (
  <span className="code-with-copy">
    <code className="guide-inline-code">{children}</code>
    <CopyButton text={String(children)} toastMessage="Command copied" />
  </span>
);

const NOTE_CLASS = { blue: 'notice-info', amber: 'notice-warning', red: 'notice-danger' };
const Note = ({ tone = 'blue', children }) => (
  <div className={`notice ${NOTE_CLASS[tone]}`} style={{ margin: '12px 0' }}>{children}</div>
);

const Section = ({ id, title, children }) => (
  <div className="card" id={id}>
    <h2 className="section-title">{title}</h2>
    {children}
  </div>
);

export default function SetupGuidePage() {
  return (
    <div className="guide-page">
      <div className="page-header">
        <div>
          <h1>Router Setup Guide</h1>
          <p>How to connect a new MikroTik hEX and set it up for a business. For Oswagolink technicians only.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">On this page</h2>
        <ul className="guide-toc">
          <li><a href="#before">Before you start</a></li>
          <li><a href="#method-a">Method A (normal)</a></li>
          <li><a href="#method-b">Method B (one laptop port)</a></li>
          <li><a href="#setup-problems">If the setup goes wrong</a></li>
          <li><a href="#reused-router">Reusing a router</a></li>
          <li><a href="#access-points">Access points</a></li>
          <li><a href="#more-access-points">More than one access point</a></li>
          <li><a href="#staff-door">Staff door: Winbox after setup</a></li>
          <li><a href="#emergency-key">Emergency key</a></li>
          <li><a href="#tplink-only">TP-Link only business (no MikroTik)</a></li>
          <li><a href="#device-passes">Admin panel device passes</a></li>
        </ul>
      </div>

      <Section id="before" title="Before you start">
        <ul className="guide-list">
          <li>A <strong>new or factory-reset</strong> MikroTik hEX, a laptop with Winbox, and network cables.</li>
          <li><strong>Port 1 (ether1) = internet (WAN).</strong> Ports 2 to 5 (ether2 to ether5) = your laptop and the access points (LAN). Never plug an access point into port 1.</li>
          <li>The setup commands: open the business's Business Panel, go to <strong>Routers</strong>, press <strong>Add Router</strong> (or <strong>Setup Commands</strong> for a router that is not set up yet). They work for <strong>30 minutes</strong>: get them when you are at the router, ready to start. Expired: press Setup Commands again for new ones.</li>
          <li>Winbox login on a factory router: user <strong>admin</strong>, password from the sticker on the router (empty if there is no password on the sticker).</li>
        </ul>
        <Note>
          Always connect Winbox <strong>by MAC address</strong> (pick the router in the Neighbors list, or type its MAC address in "Connect To").
          During setup the customer login system is switched on for ports 2 to 5, and a laptop connected by an IP address can be cut off as if it were a customer.
          A MAC connection is not affected.
        </Note>
      </Section>

      <Section id="method-a" title="Method A (normal): internet in port 1, laptop in port 2">
        <p className="guide-text">Use this whenever the business already has internet (a modem or another router).</p>
        <ol className="guide-list">
          <li>Plug the <strong>internet cable</strong> from the business's modem into <strong>port 1</strong>.</li>
          <li>Plug your <strong>laptop</strong> into <strong>port 2</strong> (or 3, 4, 5).</li>
          <li>Open Winbox, choose the router in the <strong>Neighbors</strong> list (by its MAC address), log in. On a new or reset router Winbox first asks you to set a new password: choose a strong one and give it to the business owner.</li>
          <li>Open <strong>New Terminal</strong> and check the router has internet:
            <Code>/ping 8.8.8.8 count=3</Code>
            You must see replies. If not, check the cable in port 1 and the business's modem.
          </li>
          <li>Run the <strong>2 setup steps</strong> from the Business Panel, in order. Step 1 must end with <strong>SETUP COMPLETE</strong>.</li>
          <li>Wait up to 5 minutes: the router must show <strong>ONLINE</strong> on the Business Panel's Routers page.</li>
          <li>Unplug your laptop. Plug the <strong>access point</strong> into port 2 (see "Access points" below; for more than one, see "More than one access point") and test a voucher on a phone.</li>
          <li>Within about a minute the router blocks Winbox on the access point's port (see "Staff door"). Your laptop works on any other free port.</li>
        </ol>
        <Note>
          If your laptop has <strong>two network ports</strong> and is the internet source: share its internet on one port into <strong>port 1</strong>,
          and connect the other port to <strong>port 2</strong> for Winbox. Then follow the steps above.
        </Note>
      </Section>

      <Section id="method-b" title="Method B (one laptop port): your laptop gives the internet and runs Winbox on one cable">
        <p className="guide-text">
          Use this only when there is no other internet and your laptop has a single network port (for example the USB network adapter),
          while the laptop itself is on Wi-Fi. It opens the "MAC door" on port 1 for the time of the setup, and you close it again at the end.
        </p>

        <h3 className="guide-step">1. Turn on internet sharing on the laptop (Windows)</h3>
        <ol className="guide-list">
          <li>Press <strong>Windows + R</strong>, type <strong>ncpa.cpl</strong>, press Enter.</li>
          <li>Right-click your <strong>Wi-Fi</strong> connection, choose <strong>Properties</strong>, open the <strong>Sharing</strong> tab.</li>
          <li>Tick <strong>"Allow other network users to connect through this computer's Internet connection"</strong>, choose your <strong>Ethernet</strong> (USB adapter) in the list, press OK.</li>
        </ol>

        <h3 className="guide-step">2. Prepare the router (cable in port 2)</h3>
        <ol className="guide-list">
          <li>Plug the cable into <strong>port 2</strong>. Open Winbox, choose the router in <strong>Neighbors</strong>, log in.</li>
          <li>Open New Terminal and paste these two lines:
            <Code>{'/tool mac-server mac-winbox set allowed-interface-list=all\n:put [/interface ethernet get ether1 mac-address]'}</Code>
            The second line shows the <strong>MAC address of port 1</strong> (looks like D0:EA:11:7F:16:2A). <strong>Write it down.</strong>
          </li>
        </ol>

        <h3 className="guide-step">3. Move the cable to port 1 and reconnect</h3>
        <ol className="guide-list">
          <li>Close Winbox. Move the cable from port 2 to <strong>port 1</strong>.</li>
          <li>In the laptop's sharing settings, turn sharing <strong>off and on again</strong> (this makes the router get its address).</li>
          <li>Open Winbox, type the <strong>MAC address you wrote down</strong> in "Connect To" (the router may not appear in Neighbors on port 1; that is normal), log in.</li>
          <li>Check the router has internet:
            <Code>{'/ip dhcp-client print\n/ping 8.8.8.8 count=3'}</Code>
            The first line must show ether1 as <strong>bound</strong> with an address starting 192.168.137. The ping must get replies.
            If not: turn sharing off and on again on the laptop, then run <Cmd>/ip dhcp-client renew [find]</Cmd>.
          </li>
        </ol>

        <h3 className="guide-step">4. Run the setup</h3>
        <p className="guide-text">Run the <strong>2 setup steps</strong> from the Business Panel, in order. Step 1 must end with <strong>SETUP COMPLETE</strong>.</p>

        <h3 className="guide-step">5. Close the door (never skip this)</h3>
        <Code>/tool mac-server mac-winbox set allowed-interface-list=LAN</Code>
        <p className="guide-text">Winbox disconnects at once. That is normal: the work is finished.</p>
        <Note tone="amber">
          Testing at home, where port 1 is plugged only into your own laptop: you may leave the door open while you keep testing.
          But run this line <strong>before the router goes to any business</strong>. There, port 1 faces the business's modem, and an
          open door would let others try the router's password.
        </Note>

        <h3 className="guide-step">6. Install at the business</h3>
        <p className="guide-text">
          Plug the business's internet into <strong>port 1</strong> and the access point(s) into <strong>port 2</strong> (and 3, 4, or a switch). The router gets its internet
          from the business's modem by itself, and must show <strong>ONLINE</strong> in the Business Panel within about 5 minutes.
        </p>

        <Note tone="red">
          Never add the <strong>OWN-SETUP</strong> settings to a business's router: no fixed 192.168.137.x address, no Winbox firewall rule on port 1,
          no route through 192.168.137.1. Those are only for your own test router. Method B leaves nothing behind once step 5 is done.
        </Note>
      </Section>

      <Section id="setup-problems" title="If the setup goes wrong">
        <ul className="guide-list">
          <li><strong>CLOCK NOT SET</strong>, or a <strong>failure</strong> line from step 1: the router has no internet. Check the cable in port 1 and run <Cmd>/ping 8.8.8.8 count=3</Cmd>, then paste step 1 again.</li>
          <li><strong>ROUTEROS TOO OLD</strong>: the router's software is too old for the secure setup. Update it (System &gt; Packages &gt; Check For Updates, then Download &amp; Install; the router restarts), then paste step 1 again.</li>
          <li><strong>SOME FEATURES ARE OFF</strong> (normal once on a new router): step 1 has already asked the router to switch them on. Unplug the router's power, plug it back in, log in again and paste step 1 again. If it then says <strong>THE POWER WAS NOT UNPLUGGED IN TIME</strong>, paste step 1 again and unplug within 5 minutes.</li>
          <li><strong>A download fails</strong> (step 1 or step 2): check in this order: the router can reach the internet and names (<Cmd>/ping 8.8.8.8 count=3</Cmd> and <Cmd>/ping oswagolink.co.tz count=3</Cmd>); the login page goes to <strong>flash/hotspot/login.html</strong> (not hotspot/…); and <Cmd>{'/file print where name~"flash/hotspot"'}</Cmd> shows a folder, not an empty file (step 2 part 1 removes such a file by itself).</li>
          <li><strong>ALREADY PROVISIONED</strong>: this router was set up before. Reset it to factory settings (<Cmd>/system reset-configuration</Cmd>, then confirm with y) and start again (see "Reusing a router"). Never repair a half-finished setup by hand.</li>
          <li><strong>The setup link has expired</strong>: press <strong>Setup Commands</strong> on the Business Panel's Routers page to get new commands.</li>
          <li><strong>Router stays OFFLINE</strong> after 5 minutes: on the router run <Cmd>{'/log print where message~"wg-"'}</Cmd> and send the result to support.</li>
        </ul>
      </Section>

      <Section id="reused-router" title="Reusing a router (it was set up before)">
        <p className="guide-text">
          A router that was used before, for testing or for another business, must be reset and set up fresh for the new business.
        </p>
        <ol className="guide-list">
          <li>Reset it to factory settings: <Cmd>/system reset-configuration</Cmd>, then confirm with y. Keep the default configuration:
            on the first login press <strong>OK</strong>, never "Remove Configuration".</li>
          <li>On the new business's Business Panel, use <strong>Add Router</strong> (or <strong>Setup Commands</strong> for an entry
            that is not set up yet), then follow Method A or B.</li>
          <li><strong>A reset keeps the router's files.</strong> After the setup, remove what is left from before. The backup made by the
            reset holds the old passwords and keys:
            <Code>{'/file remove [find where name~"auto-before-reset"]\n/file print'}</Code>
            Remove any other old file too (for example an old <strong>.rsc</strong> file):
            <Cmd>/file remove flash/FILE-NAME</Cmd>. Keep <strong>flash</strong>, <strong>flash/hotspot</strong> (the customer login
            pages) and <strong>flash/skins</strong>.</li>
          <li>Delete the router's <strong>old entry</strong> on the old business's panel, if it still exists (its tunnel is removed
            automatically).</li>
        </ol>
      </Section>

      <Section id="access-points" title="Access points (TP-Link EAP225)">
        <ul className="guide-list">
          <li>Wi-Fi name of your choice, <strong>open</strong> (no password), so the customer login page can appear.</li>
          <li>DHCP <strong>off</strong>: choose <strong>Static</strong> (fixed address) in the access point's network settings and enter:
            <ul className="guide-list">
              <li>IP address: <strong>192.168.88.2</strong> (the first access point; more access points: .3 to .9)</li>
              <li>IP mask: <strong>255.255.255.0</strong></li>
              <li>Gateway: <strong>192.168.88.1</strong> (the MikroTik)</li>
              <li>Primary DNS: <strong>192.168.88.1</strong> (the MikroTik)</li>
              <li>Secondary DNS: <strong>8.8.4.4</strong> (optional)</li>
            </ul>
            Then press <strong>Save</strong>.
          </li>
          <li>A new access point often comes with its own address (for example <strong>192.168.0.254</strong>). Never keep it: it is in a different network, so the router could not reach it. Always change it to an address from the list above.</li>
          <li>Plug it into <strong>port 2 to 5</strong> of the hEX, never port 1.</li>
          <li><strong>Its own settings page shows the customer login</strong>: its address is not from 192.168.88.2 to .9. Give it one from the list.</li>
        </ul>
        <Note>
          The fixed address matters twice: the access point's own traffic skips the customer login, and the router recognises
          its port as an access-point port and keeps customers away from Winbox there (see "Staff door").
        </Note>
      </Section>

      <Section id="more-access-points" title="More than one access point">
        <p className="guide-text">One router can serve up to <strong>8 access points</strong>, for a bigger place or several rooms.</p>
        <ol className="guide-list">
          <li>Give every access point its <strong>own fixed address</strong>: the first <strong>192.168.88.2</strong>, the second <strong>192.168.88.3</strong>, then .4, .5 up to <strong>192.168.88.9</strong>. Never two with the same address. Write on each access point which address it has.</li>
          <li>Same settings on each (see "Access points" above): Static, mask 255.255.255.0, gateway 192.168.88.1, primary DNS 192.168.88.1, secondary DNS 8.8.4.4 (optional), Wi-Fi <strong>open</strong>. Only the IP address is different.</li>
          <li>Use the <strong>same Wi-Fi name</strong> on all of them: phones move from one to the next by themselves, and a customer logs in only once.</li>
          <li>Give neighbouring access points <strong>different channels</strong> (on 2.4 GHz use 1, 6 and 11), so they do not disturb each other.</li>
          <li>Plug each into a <strong>free port 2 to 5</strong>. More access points than free ports: plug a <strong>network switch</strong> into one port (a PoE switch also powers the access points) and the access points into the switch.</li>
          <li>Leave <strong>one port free</strong> for staff, or use the switch for access points only: Winbox works on any port without an access point.</li>
          <li>Test: connect a phone to each access point in turn and log in with a voucher.</li>
        </ol>
        <Note tone="amber">
          An access point with a wrong address (outside 192.168.88.2 to .9) still gives Wi-Fi, but its own settings page may land on the
          customer login, and its port is only recognised once 3 or more devices are behind it. Always use an address from the list.
        </Note>
      </Section>

      <Section id="staff-door" title="Staff door: Winbox after setup">
        <p className="guide-text">
          After setup, customers on the Wi-Fi <strong>cannot see the router</strong> in Winbox's Neighbors list and cannot log in to it.
          Staff still can, from any LAN port <strong>without an access point</strong>.
        </p>
        <ul className="guide-list">
          <li>Every minute the router checks ports 2 to 5. A port with an access point (a device at 192.168.88.2 to .9), or with 3 or more devices behind it (for example a switch), becomes an <strong>access-point port</strong>: Winbox and Neighbors are blocked there.</li>
          <li>To work on the router: plug your laptop with a cable into a <strong>free port</strong> and open Winbox <strong>by MAC address</strong> (Neighbors list), as during setup. Same router password.</li>
          <li>All ports in use by access points: unplug one access point, wait <strong>5 minutes</strong> (the router forgets the old devices), then use that port. Plug the access point back in afterwards.</li>
          <li>Customers' Wi-Fi, vouchers and the connection to the Oswagolink server are not affected by any of this.</li>
          <li><strong>Locked out on every port:</strong> support uses the <a href="#emergency-key">Emergency key</a>.</li>
        </ul>
      </Section>

      <Section id="emergency-key" title="Emergency key: open a router's staff door from the VPS">
        <p className="guide-text">
          A remote unlock button for <strong>one</strong> router's Winbox, for when staff are locked out on every port (a broken port,
          every port taken by access points, or the router's check judged a staff port wrongly). It works through the tunnel the VPS
          already uses for vouchers: <strong>nobody has to go to the router</strong> and no reset is needed. Oswagolink support only.
        </p>
        <ol className="guide-list">
          <li>First the normal way: the staff plug the laptop into a port <strong>without</strong> an access point and open Winbox by MAC address.</li>
          <li>Still locked out: find the router's <strong>tunnel address</strong> in the admin panel's Routers page (it looks like 10.20.0.3; the router's name oswagolink-10-20-0-3 contains it too).</li>
          <li>On the VPS, open the door:
            <Code>{'cd ~/WI-FI/backend\nnode scripts/routerStaffDoor.js open 10.20.X.Y'}</Code>
            It answers <strong>OPEN: Winbox now works on every LAN port of "…" (business name)</strong>. The staff can now get in from any port.
          </li>
          <li>When the staff are done, <strong>always close it again</strong> (while it is open, customers' ports are open too):
            <Code>node scripts/routerStaffDoor.js close 10.20.X.Y</Code>
            It answers <strong>CLOSED: … blocks Winbox on access-point ports again within 1 minute.</strong>
          </li>
        </ol>
        <Note>
          Safe to use: it changes only that one router's Winbox door. Wi-Fi, vouchers and customers keep working the whole time, and no other
          router is touched. A wrong or unknown address, an address shared by two routers, a typo, or a router that is offline: it says so
          and changes nothing.
        </Note>
      </Section>

      <Section id="tplink-only" title="TP-Link only business (no MikroTik)">
        <p className="guide-text">
          The business has only a TP-Link Omada access point (EAP). The Omada controller on the VPS lets customers in and out;
          vouchers work as usual. With the Open API key every package has a speed (1-20 Mbps), as on MikroTik: each phone
          gets it at login. The WiFi itself has a hidden 20 Mbps safety limit per phone. The Routers page shows each access point's status (checked every
          5 minutes). Full background: <strong>TPLINK-CONTROLLER-GUIDE.md</strong>.
        </p>
        <p className="guide-text">
          <strong>Automatic (with the Open API key, since 7 November 2026):</strong> Add Router also asks for the WiFi name and
          speed, and Oswagolink makes the whole site itself (it shows "made by Oswagolink" here). The business's
          <strong> Connect</strong> window gives the technician the Inform URL and a one-time setup login, and Oswagolink adopts
          the access point with the registered MAC within 1 to 3 minutes. Delete Router removes the site again. Steps 2 and 3
          below are then not needed; they stay for sites made by hand.
        </p>

        <h3 className="guide-step">1. The business adds it (Business Panel)</h3>
        <p className="guide-text">
          Routers → <strong>Add Router</strong> → <strong>TP-Link only</strong> → name, location and the access point's MAC from its
          sticker. Here (admin panel → Routers) it then shows <strong>Needs site ID</strong>.
        </p>

        <h3 className="guide-step">2. You create its site in the controller (about 10 minutes)</h3>
        <ol className="guide-list">
          <li>Open the controller through the tunnel (PowerShell on your PC, leave it open):
            <Code>ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 8043:127.0.0.1:8043 biliant@69.62.105.119</Code>
            then <Cmd>https://127.0.0.1:8043</Cmd> and log in.</li>
          <li><strong>Global View → Add New Site</strong>: name = business + router name, Tanzania, (UTC+03:00) Nairobi.</li>
          <li>In the new site, <strong>Site Settings → Device Account</strong>: <strong>eap-admin</strong> and the device account password
            (password manager).</li>
          <li><strong>Network Config → Rate Limit</strong>: a profile with the business's speed (for example Speed-5M, 5 down / 2 up).</li>
          <li><strong>Network Config → WLAN → Create</strong>: the business's WiFi name, Security <strong>None</strong>, Advanced Settings →
            Client Rate Limit Profile = that speed profile.</li>
          <li><strong>Network Config → Authentication → Portal → Create</strong>: that WiFi only, <strong>External Portal Server</strong>,
            URL <Cmd>https://oswagolink.co.tz/portal/</Cmd>, HTTPS Redirection on. Tab <strong>Access Control</strong>: Pre-Authentication
            Access on, IP Range <Cmd>69.62.105.119</Cmd> / 32. Authentication-Free Client off.</li>
          <li><strong>Hotspot → Operators</strong>: edit the portal operator (the one in the VPS .env) → Site Privileges: also tick the
            new site → Apply. (Without this, vouchers on this site get "not reachable".)</li>
          <li>The site ID: <strong>Site Settings → Inform URL</strong> shows <code>…&amp;omadacId=XXXXXXXXXXXXXXXXXXXXXXXX</code>: those
            24 characters are the site ID. Admin panel → <strong>Routers → Set site ID</strong> → paste → Save.</li>
        </ol>

        <h3 className="guide-step">3. The technician at the business (about 15 minutes)</h3>
        <ol className="guide-list">
          <li>Plug the access point (PoE adapter) into the business's <strong>own internet box</strong>. Reset it first if it was used before
            (Reset button 10 seconds).</li>
          <li>Phone → the access point's factory WiFi → <Cmd>omadaeap.net</Cmd> → it asks for a new login: choose a temporary one and
            remember it for 30 minutes.</li>
          <li><strong>System → Controller Settings → Controller Inform URL</strong>: paste exactly (small letters, no spaces):
            <Code>oswagolink.co.tz?dPort=29810&amp;mPort=29814&amp;omadacId=cd94399be58321df0d45c1ff32d49f95</Code>
            Save. If the access point never shows up (step 4), use the number instead of the name:
            <Code>69.62.105.119?dPort=29810&amp;mPort=29814&amp;omadacId=cd94399be58321df0d45c1ff32d49f95</Code>
          </li>
          <li>Switch off the internet box's own WiFi (or give it a password), so customers cannot skip paying.</li>
        </ol>

        <h3 className="guide-step">4. You adopt it</h3>
        <ol className="guide-list">
          <li>Controller → the business's site → <strong>Devices</strong>: within 1 to 2 minutes the access point shows <strong>Pending</strong>.
            <strong> Check its MAC is the one the business typed</strong> (never adopt an access point you do not recognise).</li>
          <li><strong>Adopt</strong>. "Username or password is incorrect": <strong>Retry</strong> and type the technician's temporary login.</li>
          <li>Wait for <strong>Connected</strong>. The access point gets the WiFi, the portal and the speed by itself.</li>
          <li>Test: create a package and a voucher (Business Panel), connect a phone to the WiFi, use the voucher.</li>
        </ol>
        <Note tone="amber">
          Still being confirmed with several sites: in which site a new Pending access point appears. If it is not in the business's site,
          look in Global View → Devices and adopt it into the business's site.
        </Note>
        <Note tone="red">
          Never open ports 8043, 8088, 8843 or 27217 on the VPS. The controller's admin page is only for you, through the tunnel.
        </Note>
      </Section>

      <Section id="device-passes" title="Admin panel device passes: add, remove or renew a device">
        <p className="guide-text">
          The admin panel only opens on devices that hold a <strong>device pass</strong> (a key installed in the device). Any other
          device gets <strong>403 Forbidden</strong>, even with the right password. Each pass has a name (today: <strong>laptop</strong> and
          <strong> phone</strong>) and works for 2 years. Only the owner does this. All commands run on the VPS.
        </p>

        <h3 className="guide-step">See which devices are allowed</h3>
        <Code>sudo wifi-admin-device list</Code>
        <p className="guide-text">Shows each device name and the date its pass stops working.</p>

        <h3 className="guide-step">Add a device (new phone, new laptop)</h3>
        <ol className="guide-list">
          <li>Choose a name: small letters, numbers and - only, for example <Cmd>phone2</Cmd> or <Cmd>office-laptop</Cmd>. Then on the VPS:
            <Code>sudo wifi-admin-device add phone2</Code>
            It shows the <strong>file</strong> (admin-pass-phone2.p12 in your VPS home folder) and a <strong>password</strong>.
            Write the password down now: it is shown only once.
          </li>
          <li>Copy the file to your PC. In PowerShell <strong>on your PC</strong> (not on the VPS):
            <Code>scp biliant@oswagolink.co.tz:admin-pass-phone2.p12 $HOME/Downloads/</Code>
          </li>
          <li><strong>Laptop (Windows, Chrome or Edge):</strong> double-click the file in Downloads → Current User → Next → type the
            password → "Automatically select the certificate store" → Finish. Close and reopen the browser.</li>
          <li><strong>Phone (Android):</strong> copy the file to the phone with a USB cable (do not send it by WhatsApp or e-mail).
            Settings → Security → Encryption &amp; credentials → Install a certificate → <strong>VPN &amp; app user certificate</strong> →
            pick the file → type the password. When Chrome opens the admin panel it asks which certificate to use: choose the
            Oswagolink one.</li>
          <li>Check it: open <Cmd>https://admin.oswagolink.co.tz/device-check</Cmd> on that device. It must say
            <strong> Device pass: OK (phone2)</strong>.</li>
          <li><strong>Delete every copy of the file</strong>: on the VPS <Cmd>rm ~/admin-pass-phone2.p12</Cmd>, and from the PC's
            Downloads folder and the phone's Downloads folder. The device keeps its installed pass; the file and password are no longer needed.</li>
        </ol>

        <h3 className="guide-step">Remove a device (lost, stolen, sold or replaced)</h3>
        <Code>sudo wifi-admin-device remove phone</Code>
        <p className="guide-text">
          Works at once: that pass no longer opens the admin panel, even if someone knows your admin password. Do it the same day a
          device is lost. Then <strong>change your admin password</strong> too, to be safe.
        </p>

        <h3 className="guide-step">Renew passes before they expire (before 31 October 2028)</h3>
        <ol className="guide-list">
          <li>Add a new pass with a <strong>new name</strong> (for example <Cmd>laptop2028</Cmd>) and install it, as in "Add a device".</li>
          <li>Check <Cmd>https://admin.oswagolink.co.tz/device-check</Cmd> says OK with the new name.</li>
          <li>Only then remove the old one: <Cmd>sudo wifi-admin-device remove laptop</Cmd>. Do the same for the phone.</li>
        </ol>
        <Note tone="amber">
          Never remove a device's old pass before its new one works: you would lock yourself out of the admin panel on that device.
        </Note>

        <h3 className="guide-step">Locked out on every device</h3>
        <p className="guide-text">
          Log in to the VPS (SSH, or the VNC console in Hostinger's hPanel) and switch the check off for a moment:
        </p>
        <Code>sudo wifi-admin-device mode off</Code>
        <p className="guide-text">
          The admin panel now opens with just your password. Add a new pass for your device, check it, then switch the check back on
          straight away:
        </p>
        <Code>sudo wifi-admin-device mode enforce</Code>
        <Note tone="red">
          Never leave the mode on <strong>off</strong>: while it is off, anyone on the internet can reach your admin login page.
          Never share a .p12 file or its password, and never put it on GitHub.
        </Note>
      </Section>

    </div>
  );
}
