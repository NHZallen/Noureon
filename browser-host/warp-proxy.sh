#!/bin/sh
# shellcheck disable=SC1090,SC2015
# Puts Cloudflare WARP in PROXY mode: it then only carries what is sent to a local SOCKS5 port (the egress proxy sends the browsers' traffic there), and
# leaves the rest of this machine alone. Full-tunnel WARP carries everything: the live screen (WebRTC media leaves from the public address) breaks and a
# wrong change can cut off ssh. So:  keep a SECOND ssh session open while you run this, and have the instance snapshot (AMI) ready.
# Usage: warp-proxy.sh --yes        (without --yes it only shows what it would do)
# The warp-cli commands differ between versions; each step tries the newer form, then the older one. Check the output.
set -u
PORT=40000
YES=0
[ "${1:-}" = "--yes" ] && YES=1

command -v warp-cli >/dev/null 2>&1 || { echo "warp-cli is not installed. Install Cloudflare WARP for Linux first (https://pkg.cloudflareclient.com/), then run this again."; exit 1; }
w() { warp-cli --accept-tos "$@"; }

echo "Current state:"
w status 2>&1 | sed 's/^/  /'
cat <<TEXT

This will: disconnect WARP, set it to proxy mode on 127.0.0.1:$PORT, connect again, and test it.
If ssh stops answering, use the second session (or the instance console) and run:  warp-cli disconnect
TEXT
[ "$YES" = 1 ] || { echo "Nothing was changed (add --yes to do it)."; exit 0; }

w disconnect >/dev/null 2>&1 || true
w mode proxy 2>/dev/null || w set-mode proxy || { echo "could not set proxy mode"; exit 1; }
w proxy port "$PORT" 2>/dev/null || w set-proxy-port "$PORT" || { echo "could not set the proxy port"; exit 1; }
w connect || { echo "could not connect"; exit 1; }
sleep 4
w status 2>&1 | sed 's/^/  /'
echo "Test through the proxy (warp=on or warp=plus means it works):"
curl -s -m 10 --socks5-hostname "127.0.0.1:$PORT" https://www.cloudflare.com/cdn-cgi/trace | grep -E '^(ip|warp|loc|colo)=' | sed 's/^/  /' || echo "  no answer through the proxy"
echo "The rest of this machine should NOT go out through WARP any more:"
curl -s -m 10 https://www.cloudflare.com/cdn-cgi/trace | grep -E '^(ip|warp)=' | sed 's/^/  /'
echo "(warp=off above is the expected result.) Now run smoke-test.sh."
