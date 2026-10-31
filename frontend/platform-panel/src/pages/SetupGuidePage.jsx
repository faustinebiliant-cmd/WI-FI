import React from 'react';

// Technician guide: how to connect a new MikroTik and run the setup.
// Only shown in the platform panel. The setup commands themselves come from the
// business's Business Panel (Routers > Add Router, or "Setup Commands").

const Code = ({ children }) => <pre className="guide-code">{children}</pre>;

const NOTE_CLASS = { blue: 'notice-info', amber: 'notice-warning', red: 'notice-danger' };
const Note = ({ tone = 'blue', children }) => (
  <div className={`notice ${NOTE_CLASS[tone]}`} style={{ margin: '12px 0' }}>{children}</div>
);

const Section = ({ title, children }) => (
  <div className="card">
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

      <Section title="Before you start">
        <ul className="guide-list">
          <li>A <strong>new or factory-reset</strong> MikroTik hEX, a laptop with Winbox, and network cables.</li>
          <li><strong>Port 1 (ether1) = internet (WAN).</strong> Ports 2 to 5 (ether2 to ether5) = your laptop and the access point (LAN). Never plug the access point into port 1.</li>
          <li>The setup commands: open the business's Business Panel, go to <strong>Routers</strong>, press <strong>Add Router</strong> (or <strong>Setup Commands</strong> for a router that is not set up yet). They work for 12 hours.</li>
          <li>Winbox login on a factory router: user <strong>admin</strong>, password from the sticker on the router (empty if there is no password on the sticker).</li>
        </ul>
        <Note>
          Always connect Winbox <strong>by MAC address</strong> (pick the router in the Neighbors list, or type its MAC address in "Connect To").
          During setup the customer login system is switched on for ports 2 to 5, and a laptop connected by an IP address can be cut off as if it were a customer.
          A MAC connection is not affected.
        </Note>
      </Section>

      <Section title="Method A (normal): internet in port 1, laptop in port 2">
        <p className="guide-text">Use this whenever the business already has internet (a modem or another router).</p>
        <ol className="guide-list">
          <li>Plug the <strong>internet cable</strong> from the business's modem into <strong>port 1</strong>.</li>
          <li>Plug your <strong>laptop</strong> into <strong>port 2</strong> (or 3, 4, 5).</li>
          <li>Open Winbox, choose the router in the <strong>Neighbors</strong> list (by its MAC address), log in.</li>
          <li>Open <strong>New Terminal</strong> and check the router has internet:
            <Code>/ping 8.8.8.8 count=3</Code>
            You must see replies. If not, check the cable in port 1 and the business's modem.
          </li>
          <li>Run the <strong>3 setup steps</strong> from the Business Panel, in order. Step 2 must end with <strong>SETUP COMPLETE</strong>.</li>
          <li>Wait up to 5 minutes: the router must show <strong>ONLINE</strong> on the Business Panel's Routers page.</li>
          <li>Unplug your laptop. Plug the <strong>access point</strong> into port 2 (see "Access point" below) and test a voucher on a phone.</li>
        </ol>
        <Note>
          If your laptop has <strong>two network ports</strong> and is the internet source: share its internet on one port into <strong>port 1</strong>,
          and connect the other port to <strong>port 2</strong> for Winbox. Then follow the steps above.
        </Note>
      </Section>

      <Section title="Method B (one laptop port): your laptop gives the internet and runs Winbox on one cable">
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
            If not: turn sharing off and on again on the laptop, then run <strong>/ip dhcp-client renew [find]</strong>.
          </li>
        </ol>

        <h3 className="guide-step">4. Run the setup</h3>
        <p className="guide-text">Run the <strong>3 setup steps</strong> from the Business Panel, in order. Step 2 must end with <strong>SETUP COMPLETE</strong>.</p>

        <h3 className="guide-step">5. Close the door (never skip this)</h3>
        <Code>/tool mac-server mac-winbox set allowed-interface-list=LAN</Code>
        <p className="guide-text">Winbox disconnects at once. That is normal: the work is finished.</p>

        <h3 className="guide-step">6. Install at the business</h3>
        <p className="guide-text">
          Plug the business's internet into <strong>port 1</strong> and the access point into <strong>port 2</strong>. The router gets its internet
          from the business's modem by itself, and must show <strong>ONLINE</strong> in the Business Panel within about 5 minutes.
        </p>

        <Note tone="red">
          Never add the <strong>OWN-SETUP</strong> settings to a business's router: no fixed 192.168.137.x address, no Winbox firewall rule on port 1,
          no route through 192.168.137.1. Those are only for your own test router. Method B leaves nothing behind once step 5 is done.
        </Note>
      </Section>

      <Section title="Access point (TP-Link EAP225)">
        <ul className="guide-list">
          <li>Wi-Fi name of your choice, <strong>open</strong> (no password), so the customer login page can appear.</li>
          <li>DHCP <strong>off</strong>. Fixed address <strong>192.168.88.2</strong>, mask 255.255.255.0, gateway 192.168.88.1.</li>
          <li>Plug it into <strong>port 2 to 5</strong> of the hEX, never port 1.</li>
        </ul>
      </Section>

      <Section title="If something goes wrong">
        <ul className="guide-list">
          <li><strong>CLOCK NOT SET</strong> or <strong>CERTIFICATE CHECK FAILED</strong>: the router has no internet. Check the cable in port 1 and run <strong>/ping 8.8.8.8 count=3</strong>, then paste step 2 again.</li>
          <li><strong>SCHEDULER IS OFF</strong>: run the command in the orange box of the setup window, unplug the router's power and plug it back in within 5 minutes, then paste step 2 again.</li>
          <li><strong>ALREADY PROVISIONED</strong>: this router was set up before. Reset it to factory settings (<strong>/system reset-configuration</strong>, then confirm with y) and start again. Never repair a half-finished setup by hand.</li>
          <li><strong>The setup link has expired</strong>: press <strong>Setup Commands</strong> on the Business Panel's Routers page to get new commands.</li>
          <li><strong>Router stays OFFLINE</strong> after 5 minutes: on the router run <strong>{'/log print where message~"wg-"'}</strong> and send the result to support.</li>
        </ul>
      </Section>
    </div>
  );
}
