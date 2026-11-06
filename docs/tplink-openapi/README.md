# TP-Link Omada Open API document

`omada-openapi-6.3.0.45.json` is TP-Link's own list of every command its Omada controller
understands (1,894 commands), for **Omada Network Application 6.3.0.45**, the version in our
Docker box on the VPS.

- Saved on **6 November 2026** from our controller (`https://127.0.0.1:8043/v3/api-docs`,
  through the SSH tunnel).
- It contains **no passwords, keys or IDs of ours**: it is TP-Link's general description
  (checked before saving).
- It is a reference for building the automation. The backend does **not** read this file.

## When the controller is updated
A new controller version can add or change commands. After an update, save the new document
the same way (tunnel open, then on the laptop in PowerShell), and keep the old file:

```
curl.exe -k -o omada-openapi-<new version>.json https://127.0.0.1:8043/v3/api-docs
```

Do **not** open the document page (`/doc.html`) in the browser: the controller builds the whole
4.6 MB document every time, which costs it a lot of memory.

## The commands Oswagolink uses or will use

How to call them: first get a token, then send it with every command.

```
POST /openapi/authorize/token?grant_type=client_credentials
     body: { "omadacId": ..., "client_id": ..., "client_secret": ... }
then every call has the header   Authorization: AccessToken=<token>
```

The key lives only in the VPS `.env` (`OMADA_OPENAPI_CLIENT_ID`, `OMADA_OPENAPI_CLIENT_SECRET`).
The code is in `backend/services/routers/omadaOpenApi.js`.

| What | Command | Used since |
|---|---|---|
| List sites | `GET /openapi/v1/{omadacId}/sites?page=1&pageSize=100` | V2-0 (test tool) |
| One site's settings | `GET /openapi/v1/{omadacId}/sites/{siteId}` | V2-0 |
| Create a site | `POST /openapi/v1/{omadacId}/sites` (name, region, timeZone, scenario, deviceAccountSetting) | V2-0 test, V2-2 |
| Delete a site | `DELETE /openapi/v1/{omadacId}/sites/{siteId}` | V2-0 test, V2-4 |
| Access points of a site + status | `GET /openapi/v1/{omadacId}/sites/{siteId}/devices?page=1&pageSize=200` | V2-1 |
| Waiting (pending) access points | `GET /openapi/v1/{omadacId}/sites/{siteId}/grid/devices/pending?page=1&pageSize=100` | V2-0, V2-3 |
| Adopt an access point | `POST /openapi/v1/{omadacId}/sites/{siteId}/devices/{mac}/start-adopt` then `GET .../adopt-result` | V2-3 |
| Forget an access point | `POST /openapi/v1/{omadacId}/sites/{siteId}/devices/{mac}/forget` | V2-4 |
| Speed of one phone | `PATCH /openapi/v1/{omadacId}/sites/{siteId}/clients/{phoneMac}/ratelimit` | V2-1 |
| One phone's details | `GET /openapi/v1/{omadacId}/sites/{siteId}/clients/{phoneMac}` | V2-0 (test tool) |
| Device account of a site | `PUT /openapi/v1/{omadacId}/sites/{siteId}/device-account` | V2-2 |
| WiFi names (SSIDs) | `GET/POST /openapi/v2/{omadacId}/sites/{siteId}/wireless-network/ssids` | V2-2 |
| WiFi speed (business speed) | `PATCH /openapi/v1/{omadacId}/sites/{siteId}/wireless-network/ssids/{ssidId}/rate-limit` | V2-2 |
| Portal | `GET /openapi/v1/{omadacId}/sites/{siteId}/portals`, `POST .../portal` | V2-2 |
| Allowed before login (pre-auth) | `GET/PATCH /openapi/v1/{omadacId}/sites/{siteId}/setting/access-control` | V2-2 |
| Hotspot operator's sites | `GET /openapi/v1/{omadacId}/sites/{siteId}/hotspot/operators`, `PATCH .../hotspot/operators/{id}` (name, password, selectedSites) | V2-2, V2-4 |

The code for V2-2 to V2-4 is in `backend/services/routers/omadaSites.js` and
`backend/scripts/omadaAdopt.js`. Test on the VPS: `node scripts/omadaOpenApiTest.js trial-full`
(builds a complete site, shows it next to the hand-made one, removes it) and `... waiting`.

Not used, on purpose: `hotspot/clients/{clientMac}/auth` (lets a phone in, but without a time;
Oswagolink keeps the tested `extPortal/auth` with the voucher's time).

## Rules TP-Link checks (learned by testing)
- **Device account password:** 10 to 64 characters, with uppercase, lowercase, number **and**
  symbol (`! # $ % & * @ ^`), and **never the same character twice in a row**.
- **MAC addresses** in commands are written with dashes: `AA-BB-CC-DD-EE-FF`.
- **Phone speed:** `upUnit` / `downUnit` 1 = Kbps, 2 = Mbps; limit 1 to 1024.
