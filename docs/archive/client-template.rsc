# ===== OSWAGOLINK CLIENT ROUTER TEMPLATE =====
/user set admin password="ADMIN_PASSWORD"
/system identity set name=CLIENT_NAME
/system clock set time-zone-autodetect=no time-zone-name=Africa/Dar_es_Salaam

/ip cloud set update-time=yes
/system ntp client set enabled=yes servers=time.google.com,pool.ntp.org,time.cloudflare.com

/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/disk settings set auto-media-sharing=no auto-smb-sharing=no

/interface wireguard add name=wg-vps listen-port=51820 mtu=1420
/ip address add address=TUNNEL_IP/24 interface=wg-vps comment="VPS API tunnel"
/interface wireguard peers add interface=wg-vps name=peer1 public-key="ge0I3cNGfsm5MuItotNBt5KDrSGeg3lhRThsDFc3byY=" endpoint-address=69.62.105.119 endpoint-port=51820 allowed-address=10.20.0.1/32 persistent-keepalive=25s comment="WI-FI VPS"

/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 in-interface=wg-vps src-address=10.20.0.1 place-before=0 comment="Allow VPS API through WireGuard"
/ip firewall filter add chain=forward action=drop src-address=192.168.88.0/24 out-interface=wg-vps place-before=0 comment="Guests cannot use VPS tunnel"

/ip hotspot profile set [find default=yes] login-by=http-pap
/ip hotspot profile add name=hsprof1 hotspot-address=192.168.88.1 html-directory=flash/hotspot login-by=http-pap
/ip hotspot add name=hotspot1 interface=bridge address-pool=default-dhcp profile=hsprof1 disabled=no
/ip hotspot ip-binding add address=192.168.88.2 type=bypassed comment="Access point"
/ip hotspot walled-garden add dst-host=oswagolink.co.tz
/ip hotspot walled-garden ip add dst-address=69.62.105.119 action=accept
/ip firewall nat add action=masquerade chain=srcnat comment="masquerade hotspot network" src-address=192.168.88.0/24 out-interface-list=WAN

/user group add name=apigroup policy=api,read,write,policy,test
/user add name=wifiapi group=apigroup address=10.20.0.1 password="API_PASSWORD"
/ip service set api address=10.20.0.1/32
/ip service set winbox address=192.168.88.0/24
/ip service disable telnet,ftp,www,ssh,api-ssl

# --- Speed Profiles (1 to 20 Mbps) ---
/ip hotspot user profile add name=spd-1024d-1024u rate-limit=1024k/1024k
/ip hotspot user profile add name=spd-2048d-2048u rate-limit=2048k/2048k
/ip hotspot user profile add name=spd-3072d-3072u rate-limit=3072k/3072k
/ip hotspot user profile add name=spd-4096d-4096u rate-limit=4096k/4096k
/ip hotspot user profile add name=spd-5120d-5120u rate-limit=5120k/5120k
/ip hotspot user profile add name=spd-6144d-6144u rate-limit=6144k/6144k
/ip hotspot user profile add name=spd-7168d-7168u rate-limit=7168k/7168k
/ip hotspot user profile add name=spd-8192d-8192u rate-limit=8192k/8192k
/ip hotspot user profile add name=spd-9216d-9216u rate-limit=9216k/9216k
/ip hotspot user profile add name=spd-10240d-10240u rate-limit=10240k/10240k
/ip hotspot user profile add name=spd-11264d-11264u rate-limit=11264k/11264k
/ip hotspot user profile add name=spd-12288d-12288u rate-limit=12288k/12288k
/ip hotspot user profile add name=spd-13312d-13312u rate-limit=13312k/13312k
/ip hotspot user profile add name=spd-14336d-14336u rate-limit=14336k/14336k
/ip hotspot user profile add name=spd-15360d-15360u rate-limit=15360k/15360k
/ip hotspot user profile add name=spd-16384d-16384u rate-limit=16384k/16384k
/ip hotspot user profile add name=spd-17408d-17408u rate-limit=17408k/17408k
/ip hotspot user profile add name=spd-18432d-18432u rate-limit=18432k/18432k
/ip hotspot user profile add name=spd-19456d-19456u rate-limit=19456k/19456k
/ip hotspot user profile add name=spd-20480d-20480u rate-limit=20480k/20480k

/system script add name=wg-boot policy=read,write,policy,test source={
    /interface wireguard peers disable [find name=peer1]
    :do {
        :local tries 0
        :while ($tries < 60 && [/ping 8.8.8.8 count=1] = 0) do={
            :delay 5s
            :set tries ($tries + 1)
        }
        :delay 90s
    } on-error={ :log warning "wg-boot: wait failed" }
    /interface wireguard peers enable [find name=peer1]
    :log info "wg-boot: peer1 enabled"
}
/system script add name=wg-watchdog policy=read,write,policy,test source={
    :if ([/system resource get uptime] > 00:08:00) do={
        :if ([/ping 8.8.8.8 count=2] > 0) do={
            :if ([/ping 10.20.0.1 count=3] = 0) do={
                :log warning "wg-watchdog: VPS not answering, restarting peer1"
                /interface wireguard peers disable [find name=peer1]
                :delay 5s
                /interface wireguard peers enable [find name=peer1]
            }
        }
    }
}
/system scheduler add name=wg-boot start-time=startup interval=0 on-event="/system script run wg-boot"
/system scheduler add name=wg-watchdog interval=2m on-event="/system script run wg-watchdog"