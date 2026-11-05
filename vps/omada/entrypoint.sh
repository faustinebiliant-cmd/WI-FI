#!/bin/sh
# ============================================================
# Oswagolink - starts the Omada controller inside its box.
# Runs as the unprivileged user "omada" (never root).
# ============================================================
set -eu

D=/opt/tplink/EAPController

# The data folder lives on the VPS (/opt/omada/data) so it survives updates.
# - TP-Link's own program files (web pages, pictures: html, pdf, static) are refreshed
#   from the image on every start, so an update always brings its matching files.
# - Everything else (db = the database, keystore, cluster) is copied only if missing
#   (first start) and never overwritten afterwards.
for src in /opt/omada-defaults/data/*; do
    f="$(basename "$src")"
    case "$f" in
        html|pdf|static)
            rm -rf "$D/data/$f"
            cp -a "$src" "$D/data/$f"
            ;;
        *)
            [ -e "$D/data/$f" ] || cp -a "$src" "$D/data/$f"
            ;;
    esac
done

# MongoDB refuses to start without its database folder (seen on the laptop test)
mkdir -p "$D/data/db" "$D/logs" "$D/work"

cd "$D/lib"
exec java -server \
    -Xms128m -Xmx"${OMADA_JAVA_XMX:-700m}" \
    -XX:MaxHeapFreeRatio=60 -XX:MinHeapFreeRatio=30 \
    -Djava.awt.headless=true -Djdk.lang.Process.launchMechanism=vfork \
    -cp "$D/lib/*:$D/properties:" \
    "$(cat /opt/omada-defaults/main-class)"
