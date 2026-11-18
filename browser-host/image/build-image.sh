#!/bin/bash
# Builds the browser image (Dockerfile next to this file) on top of the neko image named in BROWSER_IMAGE (or the latest one) and prints the name to put in host.env.
#   ./build-image.sh [tag]        default tag: noureon-browser-chromium:<date>
set -eu
cd "$(dirname "$0")"
BASE="${BROWSER_IMAGE_BASE:-ghcr.io/m1k1o/neko/chromium:latest}"
TAG="${1:-noureon-browser-chromium:$(date +%Y%m%d)}"
docker build --build-arg "BASE=$BASE" -t "$TAG" .
echo "built $TAG from $BASE"
docker run --rm --entrypoint sh "$TAG" -c 'chromium --version; ls /usr/lib/chromium/locales | tr "\n" " "; echo; dpkg -l | grep -i chromium | awk "{print \$2, \$3}"'
echo "set BROWSER_IMAGE=$TAG in /etc/noureon-browser/host.env, then restart noureon-browser-host (browsers that run now keep the old image); run e2e-test.sh before keeping it. To go back: take the line out of host.env and restart"
