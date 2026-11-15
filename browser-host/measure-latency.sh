#!/bin/sh
# Run this on YOUR computer (not on the server): how long a round trip to the browser host takes. Taking over the browser (typing, moving the mouse)
# feels the round trip twice, so 150 ms or more is clearly noticeable. Usage:  sh measure-latency.sh <host-or-ip> [port=22] [count=30]
# It measures the time to open a TCP connection (works even when the host does not answer ping, as AWS does by default) and, if it can, ping.
set -u
HOST="${1:-}"; PORT="${2:-22}"; COUNT="${3:-30}"
[ -n "$HOST" ] || { echo "usage: sh measure-latency.sh <host-or-ip> [port=22] [count=30]"; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "curl is needed"; exit 2; }

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
echo "TCP connect time to $HOST:$PORT, $COUNT tries (milliseconds)"
i=0
while [ "$i" -lt "$COUNT" ]; do
  t=$(curl -s -m 5 -o /dev/null -w '%{time_connect}' "telnet://$HOST:$PORT" 2>/dev/null || echo 0)
  echo "$t" >> "$TMP"
  i=$((i + 1)); sleep 0.3
done
awk 'BEGIN{n=0;min=1e9;max=0;sum=0} $1>0{v=$1*1000;n++;sum+=v;if(v<min)min=v;if(v>max)max=v;a[n]=v}
  END{ if(n==0){print "no connection could be opened (is the port open?)"; exit}
       for(i=1;i<=n;i++)for(j=i+1;j<=n;j++)if(a[j]<a[i]){t=a[i];a[i]=a[j];a[j]=t}
       printf "tries answered: %d   min %.0f   median %.0f   average %.0f   worst %.0f\n",n,min,a[int((n+1)/2)],sum/n,max }' "$TMP"

if command -v ping >/dev/null 2>&1; then
  echo; echo "ping (may show 100% loss: AWS blocks it unless the security group allows ICMP)"
  ping -c 10 "$HOST" 2>&1 | tail -3
fi
echo
echo "Reading it: under 80 ms feels like local, 80-150 ms is fine for watching and usable for typing, over 150 ms makes typing and the mouse laggy."
echo "Do it on the networks that matter: home Wi-Fi, and the phone on mobile data."
