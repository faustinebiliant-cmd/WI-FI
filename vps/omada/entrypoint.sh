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

# Memory: Java and MongoDB each fill their memory up to a ceiling and keep it (that is
# normal: memory is faster than the disk). The ceilings are chosen so that both together
# fit in the box (1.75 GB), whatever the number of businesses.
# - MALLOC_ARENA_MAX=2: Linux gives a busy Java program many memory pools that grow and
#   are never returned; 2 pools is the standard cure for that slow climb (6 Nov 2026).
# - Network buffers and compiled-code space get sensible caps.
# - The heap (Java's main storage): 600 MB (700 MB until 7 Nov 2026; Java alone then
#   reached 1.41 GB and the box 1.60 of 1.75 GB with no business using it).
# - MongoDB's cache: 0.25 GB (MongoDB's own choice in this box was about 0.375 GB).
#   The controller starts MongoDB with the line eap.mongod.args in omada.properties; the
#   cache setting is added there on every start (the file is inside the box, so a change
#   by hand would be lost at the next rebuild).
export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"

JAVA_XMX="${OMADA_JAVA_XMX:-600m}"
case "$JAVA_XMX" in
    [1-9][0-9][0-9]m|[1-9][0-9][0-9][0-9]m) ;;
    *) echo "OMADA_JAVA_XMX must look like 600m (100m to 9999m), got: $JAVA_XMX" >&2; exit 1 ;;
esac

MONGO_CACHE_GB="${OMADA_MONGO_CACHE_GB:-0.25}"
case "$MONGO_CACHE_GB" in
    0.25|0.3|0.35|0.4|0.5|0.75|1|1.5|2) ;;
    *) echo "OMADA_MONGO_CACHE_GB must be one of 0.25 0.3 0.35 0.4 0.5 0.75 1 1.5 2, got: $MONGO_CACHE_GB" >&2; exit 1 ;;
esac
PROPS="$D/properties/omada.properties"
grep -q '^eap\.mongod\.args=' "$PROPS" || { echo "eap.mongod.args not found in $PROPS" >&2; exit 1; }
# Remove an older cache setting and a Windows line ending, then add the setting once
sed -i -e '/^eap\.mongod\.args=/ s/\r$//' \
       -e '/^eap\.mongod\.args=/ s/ --wiredTigerCacheSizeGB [0-9.]*//g' \
       -e "/^eap\.mongod\.args=/ s/\$/ --wiredTigerCacheSizeGB $MONGO_CACHE_GB/" "$PROPS"

exec java -server \
    -Xms128m -Xmx"$JAVA_XMX" \
    -XX:MaxDirectMemorySize=128m -XX:ReservedCodeCacheSize=96m \
    -XX:MaxHeapFreeRatio=60 -XX:MinHeapFreeRatio=30 \
    -Djava.awt.headless=true -Djdk.lang.Process.launchMechanism=vfork \
    -cp "$D/lib/*:$D/properties:" \
    "$(cat /opt/omada-defaults/main-class)"
