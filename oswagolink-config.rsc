# ============================================================
# OSWAGOLink Client Router Blueprint
# ============================================================
# WARNING: THIS FILE DOES NOT CONTAIN THE WIREGUARD PRIVATE KEY.
# After importing this file into a new router, you MUST do the following:
# 1. Open WinBox -> WireGuard -> double-click "wg-vps" -> click "Generate Key".
# 2. Run: /ip cloud set update-time=yes
# 3. Copy the new Public Key to your VPS: /etc/wireguard/wg0.conf
# 4. On the VPS, run: sudo systemctl restart wg-quick@wg0
# 5. The router's watchdog scripts will then take over and self-heal.
# ============================================================

/interface bridge
add admin-mac=D0:EA:11:7F:16:2B auto-mac=no comment=defconf name=bridge
/interface wireguard
add listen-port=51820 mtu=1420 name=wg-vps
/interface list
add comment=defconf name=WAN
add comment=defconf name=LAN

/ip hotspot profile
set [ find default=yes ] login-by=http-pap
add hotspot-address=192.168.88.1 html-directory=flash/hotspot login-by=http-pap name=hsprof1

/ip pool
add name=default-dhcp ranges=192.168.88.10-192.168.88.254
/ip dhcp-server
add address-pool=default-dhcp interface=bridge name=defconf

/ip hotspot
add address-pool=default-dhcp disabled=no interface=bridge name=hotspot1 profile=hsprof1

/interface bridge port
add bridge=bridge comment=defconf interface=ether2
add bridge=bridge comment=defconf interface=ether3
add bridge=bridge comment=defconf interface=ether4
add bridge=bridge comment=defconf interface=ether5

/ip neighbor discovery-settings
set discover-interface-list=LAN
/interface list member
add comment=defconf interface=bridge list=LAN
add comment=defconf interface=ether1 list=WAN

/interface wireguard peers
add allowed-address=10.20.0.1/32 comment="WI-FI VPS" endpoint-address=69.62.105.119 endpoint-port=51820 interface=wg-vps name=peer1 persistent-keepalive=25s public-key="ge0I3cNGfsm5MuItotNBt5KDrSGeg3lhRThsDFc3byY="

/ip address
add address=192.168.88.1/24 comment=defconf interface=bridge network=192.168.88.0
add address=10.20.0.2/24 comment="VPS API tunnel" interface=wg-vps network=10.20.0.0

/ip dhcp-client
add comment=defconf interface=ether1

/ip dhcp-server network
add address=192.168.88.0/24 comment=defconf dns-server=192.168.88.1 gateway=192.168.88.1

/ip dns
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/ip dns static
add address=192.168.88.1 comment=defconf name=router.lan type=A

/ip firewall filter
add action=passthrough chain=unused-hs-chain comment="place hotspot rules here" disabled=yes
add action=accept chain=input comment="Allow VPS API through WireGuard" dst-port=8728 in-interface=wg-vps protocol=tcp src-address=10.20.0.1
add action=accept chain=input comment="defconf: accept established,related,untracked" connection-state=established,related,untracked
add action=drop chain=input comment="defconf: drop invalid" connection-state=invalid
add action=accept chain=input comment="defconf: accept ICMP" protocol=icmp
add action=accept chain=input comment="defconf: accept to local loopback (for CAPsMAN)" dst-address=127.0.0.1
add action=drop chain=input comment="defconf: drop all not coming from LAN" in-interface-list=!LAN
add action=accept chain=forward comment="defconf: accept in ipsec policy" ipsec-policy=in,ipsec
add action=accept chain=forward comment="defconf: accept out ipsec policy" ipsec-policy=out,ipsec
add action=fasttrack-connection chain=forward comment="defconf: fasttrack" connection-state=established,related hw-offload=yes
add action=accept chain=forward comment="defconf: accept established,related, untracked" connection-state=established,related,untracked
add action=drop chain=forward comment="defconf: drop invalid" connection-state=invalid
add action=drop chain=forward comment="defconf: drop all from WAN not DSTNATed" connection-nat-state=!dstnat connection-state=new in-interface-list=WAN

/ip firewall nat
add action=passthrough chain=unused-hs-chain comment="place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat comment="defconf: masquerade" ipsec-policy=out,none out-interface-list=WAN
add action=masquerade chain=srcnat comment="masquerade hotspot network" src-address=192.168.88.0/24

/ip hotspot ip-binding
add address=192.168.88.2 comment=EAP225 type=bypassed

/ip hotspot walled-garden
add comment="place hotspot rules here" disabled=yes
add dst-host=oswagolink.co.tz
/ip hotspot walled-garden ip
add action=accept disabled=no dst-address=69.62.105.119

/system clock
set time-zone-autodetect=no time-zone-name=Africa/Dar_es_Salaam
/system ntp client
set enabled=yes
/system ntp client servers
add address=time.google.com
add address=pool.ntp.org
add address=time.cloudflare.com

/system scheduler
add name=wg-boot on-event="/system script run wg-boot" policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon start-time=startup
add interval=2m name=wg-watchdog on-event="/system script run wg-watchdog" policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon start-date=2026-10-29 start-time=11:10:16

/system script
add dont-require-permissions=no name=wg-boot owner=admin policy=read,write,policy,test source="\
    \n    /interface wireguard peers disable [find name=peer1]\
    \n    :do {\
    \n        :local tries 0\
    \n        :while (\$tries < 60 && [/ping 8.8.8.8 count=1] = 0) do={\
    \n            :delay 5s\
    \n            :set tries (\$tries + 1)\
    \n        }\
    \n        :delay 90s\
    \n    } on-error={ :log warning \"wg-boot: wait failed\" }\
    \n    /interface wireguard peers enable [find name=peer1]\
    \n    :log info \"wg-boot: peer1 enabled\"\
    \n"
add dont-require-permissions=no name=wg-watchdog owner=admin policy=read,write,policy,test source="\
    \n    :if ([/system resource get uptime] > 00:08:00) do={\
    \n        :if ([/ping 8.8.8.8 count=2] > 0) do={\
    \n            :if ([/ping 10.20.0.1 count=3] = 0) do={\
    \n                :log warning \"wg-watchdog: VPS not answering, restarting peer1\"\
    \n                /interface wireguard peers disable [find name=peer1]\
    \n                :delay 5s\
    \n                /interface wireguard peers enable [find name=peer1]\
    \n            }\
    \n        }\
    \n    }\
    \n"

/tool mac-server
set allowed-interface-list=LAN
/tool mac-server mac-winbox
set allowed-interface-list=LAN