# Omada controller box (TP-Link-only billing)

The TP-Link controller runs in a Docker box on the VPS. Everything here is for the VPS
(`~/WI-FI/vps/omada`). Plain-English owner instructions are in `VPS-HANDBOOK.md`.

| Setting | Value | Why |
|---|---|---|
| Network | `host` | No Docker networking; the UFW firewall stays in full control |
| Memory | 1.5 GB (+0.5 GB swap) | Can never starve billing |
| CPU | at most 0.6 of the core | Billing always keeps at least 40% |
| User | `omada` (uid 508), no extra rights | Never root |
| Data | `/opt/omada/data`, logs `/opt/omada/logs` | Survives updates and rebuilds |
| Open to internet | 29810/udp, 29811-29817/tcp (EAPs only) | Admin page 8043 stays closed (SSH tunnel) |
| Never open | 8043, 8044, 8088, 8843, 27001, 19810, 27217 (MongoDB, listens on 127.0.0.1 only) | |

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
  --memory 1.5g --memory-swap 2g --cpus 0.6 --stop-timeout 120 \
  --cap-drop ALL --security-opt no-new-privileges \
  -e OMADA_JAVA_XMX=700m \
  -v /opt/omada/data:/opt/tplink/EAPController/data \
  -v /opt/omada/logs:/opt/tplink/EAPController/logs \
  oswagolink/omada:6.3.0.45
```

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
sudo ufw delete allow 29810/udp; sudo ufw delete allow 29811:29817/tcp
sudo rm -rf /opt/omada
```
