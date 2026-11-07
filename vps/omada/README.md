# Omada controller box (TP-Link-only billing)

The TP-Link controller runs in a Docker box on the VPS. Everything here is for the VPS
(`~/WI-FI/vps/omada`). Plain-English owner instructions are in `VPS-HANDBOOK.md`.

| Setting | Value | Why |
|---|---|---|
| Network | `host` | No Docker networking; the UFW firewall stays in full control |
| Memory | 1.75 GB (+0.5 GB swap); raised from 1.5 GB on 6 Nov 2026 with `sudo docker update --memory 1.75g --memory-swap 2.25g omada` | Can never starve billing |
| Java main storage (heap) | 600 MB: `-e OMADA_JAVA_XMX=600m` (700 MB until 7 Nov 2026) | Java and MongoDB each fill their memory up to a ceiling and keep it; with these two ceilings both fit in the box |
| MongoDB cache | 0.25 GB: `-e OMADA_MONGO_CACHE_GB=0.25` (MongoDB chose about 0.375 GB by itself until 7 Nov 2026). The starter adds `--wiredTigerCacheSizeGB` to `eap.mongod.args` in `omada.properties` on every start | same |
| CPU | at most 0.6 of the core | Billing always keeps at least 40% |
| User | `omada` (uid 508), no extra rights | Never root |
| Data | `/opt/omada/data`, logs `/opt/omada/logs` | Survives updates and rebuilds |
| Open to internet | 29810/udp, 19810/udp, 29811-29817/tcp (EAPs); 8880/tcp (portal entrance) | Admin page 8043 stays closed (SSH tunnel) |
| Never open | 8043, 8044, 8088, 8843, 27001, 19810/tcp, 27217 (MongoDB, listens on 127.0.0.1 only) | |

Controller setting required: **System Settings → HTTP Portal Port = 8880** (default 8088 is also
the management port). Phones go to `http://<controller>:8880/portal/entry` first, which forwards
them to the external portal. Owner guide: `TPLINK-CONTROLLER-GUIDE.md` in the project root.

Firewall (done 5 Nov 2026):
```bash
sudo ufw allow 29810/udp comment 'Omada EAPs'
sudo ufw allow 19810/udp comment 'Omada EAPs'
sudo ufw allow 29811:29817/tcp comment 'Omada EAPs'
sudo ufw allow 8880/tcp comment 'Omada portal entrance'
```

Docker itself is set (`/etc/docker/daemon.json`) to never touch the firewall or turn on forwarding:
`{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"},"iptables":false,"ip6tables":false,"ip-forward":false,"bridge":"none"}`

## Build (first time and after an update)
```bash
cd ~/WI-FI/vps/omada
sudo docker build --network host -t oswagolink/omada:6.3.0.45 .
```

## Run (first time)
```bash
sudo mkdir -p /opt/omada/data /opt/omada/logs
sudo chown -R 508:508 /opt/omada
sudo docker run -d --name omada --init --network host --restart unless-stopped \
  --memory 1.75g --memory-swap 2.25g --cpus 0.6 --stop-timeout 120 \
  --cap-drop ALL --security-opt no-new-privileges \
  -e OMADA_JAVA_XMX=600m -e OMADA_MONGO_CACHE_GB=0.25 \
  -v /opt/omada/data:/opt/tplink/EAPController/data \
  -v /opt/omada/logs:/opt/tplink/EAPController/logs \
  oswagolink/omada:6.3.0.45
```

## Change the memory ceilings (no rebuild of the controller download, same data)
The values are read when the box starts, so the box is made again with new values:
```bash
sudo docker stop omada && sudo docker rm omada
```
then the **Run** command above with other values (`OMADA_JAVA_XMX` like `600m`; `OMADA_MONGO_CACHE_GB` one of
0.25 0.3 0.35 0.4 0.5 0.75 1 1.5 2; anything else is refused and the box does not start: `sudo docker logs omada`).
`/opt/omada` is never touched. The controller is off about 10 minutes. Check the values in use:
```bash
sudo docker top omada -o args | grep -oE 'Xmx[0-9]+m|wiredTigerCacheSizeGB [0-9.]+'
```
The values used until 7 Nov 2026: `-e OMADA_JAVA_XMX=700m -e OMADA_MONGO_CACHE_GB=0.4` (0.4 is close to
MongoDB's own choice then).

## Everyday
| What | Command |
|---|---|
| Running? | `sudo docker ps` (look for `omada ... Up`) |
| Memory/CPU | `sudo docker stats --no-stream` |
| Restart | `sudo docker restart omada` |
| Errors | `sudo docker logs omada --tail 30` and `sudo tail -n 30 /opt/omada/logs/server.log` |

## Update (only on purpose)
1. Hostinger snapshot. 2. Read TP-Link's release notes. 3. Change `OMADA_VERSION`, `OMADA_URL`,
`OMADA_SHA256` in the Dockerfile (and the tag below). 4. Build with the new tag.
5. `sudo docker stop omada && sudo docker rm omada`, then the Run command with the new tag
(the data in `/opt/omada` is kept). 6. Test one EAP.

## Remove completely
```bash
sudo docker stop omada; sudo docker rm omada; sudo docker rmi oswagolink/omada:6.3.0.45
sudo ufw delete allow 29810/udp; sudo ufw delete allow 19810/udp
sudo ufw delete allow 29811:29817/tcp; sudo ufw delete allow 8880/tcp
sudo rm -rf /opt/omada
```
