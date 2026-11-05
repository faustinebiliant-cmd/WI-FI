# ============================================================
# Oswagolink - Omada Network Application (TP-Link controller) in a sealed box
#
# Why a box: the VPS runs Ubuntu 26.04, which TP-Link's Linux controller does not
# support. Inside the box it gets Ubuntu 24.04, which TP-Link does support.
# Every part comes from its official maker:
#   - Ubuntu 24.04 base image (official)
#   - OpenJDK 21 from Ubuntu (TP-Link: Java 17 or 21 for v5.15.20 up to v6.4)
#   - MongoDB 8.0 from MongoDB's own repository (TP-Link: up to v8 from v5.15.20)
#   - the controller from static.tp-link.com, checked against its SHA256 fingerprint
#
# Build and run commands: see README.md in this folder.
# ============================================================
FROM ubuntu:24.04

ARG OMADA_VERSION=6.3.0.45
ARG OMADA_URL=https://static.tp-link.com/upload/software/2026/202609/20260904/Omada_Network_Application_v6.3.0.45_linux_x64_20260903171900.tar.gz
# Fingerprint of the file above (downloaded and measured 5 Nov 2026, 332,630,251 bytes)
ARG OMADA_SHA256=dadf7e187fa2b21892a3f26475ae15360f41d64f578a70f0801d2ae19da9eb6a

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Africa/Dar_es_Salaam

# Java, time zone data, and MongoDB 8.0 (key and repository from mongodb.org)
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg tzdata openjdk-21-jre-headless; \
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg; \
    echo "deb [ arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends mongodb-org-server; \
    apt-get purge -y gnupg; apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*

# The controller itself: download, check the fingerprint, unpack
RUN set -eux; \
    cd /tmp; \
    curl -fsSL -o omada.tar.gz "$OMADA_URL"; \
    echo "$OMADA_SHA256  omada.tar.gz" | sha256sum -c -; \
    tar xzf omada.tar.gz; \
    S="$(dirname "$(dirname "$(find /tmp -path '*/bin/control.sh' | head -n 1)")")"; \
    D=/opt/tplink/EAPController; \
    mkdir -p "$D/logs" "$D/work"; \
    cp -r "$S/bin" "$S/data" "$S/lib" "$S/properties" "$D/"; \
    ln -sf /usr/bin/mongod "$D/bin/mongod"; \
    chmod 755 "$D"/bin/*; \
    mkdir -p /opt/omada-defaults; \
    cp -r "$S/data" /opt/omada-defaults/; \
    grep -oE 'com\.tplink\.[A-Za-z0-9_.]+Main' "$S/bin/control.sh" | head -n 1 > /opt/omada-defaults/main-class; \
    test -s /opt/omada-defaults/main-class; \
    echo "$OMADA_VERSION" > /opt/omada-defaults/version; \
    rm -rf /tmp/*

# Runs as an ordinary user, never root (uid 508 = owner of /opt/omada on the VPS)
RUN set -eux; \
    groupadd -r -g 508 omada; \
    useradd -r -u 508 -g omada -d /opt/tplink/EAPController -s /usr/sbin/nologin omada; \
    chown -R omada:omada /opt/tplink /opt/omada-defaults

COPY --chmod=755 entrypoint.sh /usr/local/bin/omada-entrypoint

USER omada
WORKDIR /opt/tplink/EAPController/lib
ENTRYPOINT ["/usr/local/bin/omada-entrypoint"]
