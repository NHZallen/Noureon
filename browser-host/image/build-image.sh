#!/bin/bash
# Builds the browser image (Dockerfile next to this file) on top of the neko image named in BROWSER_IMAGE (or the latest one) and prints the name to put in host.env.
#   ./build-image.sh [tag]        default tag: noureon-browser-chromium:<date>
set -eu
cd "$(dirname "$0")"
BASE="${BROWSER_IMAGE_BASE:-ghcr.io/m1k1o/neko/chromium:latest}"
TAG="${1:-noureon-browser-chromium:$(date +%Y%m%d)}"
docker build --build-arg "BASE=$BASE" -t "$TAG" .
echo "built $TAG from $BASE"
docker run --rm --entrypoint sh "$TAG" -c 'ls /usr/lib/chromium/locales | tr "\n" " "; echo; ls /opt/noureon-tab-order'
echo "set BROWSER_IMAGE=$TAG in /etc/noureon-browser/host.env, then restart noureon-browser-host (browsers that run now keep the old image)"
