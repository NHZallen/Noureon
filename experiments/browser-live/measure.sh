#!/usr/bin/env bash
# Experiment: samples the CPU and the memory of the neko container every 2 seconds and prints the average and the highest values.
#   ./measure.sh [seconds=60] [container=neko-spike]
# docker stats counts one fully used core as 100%, so with 6 cores the most it can show is 600%.
set -euo pipefail
seconds="${1:-60}"
container="${2:-neko-spike}"
samples=$(( seconds / 2 ))
cpu_sum=0; cpu_max=0; mem_max=0
for _ in $(seq 1 "$samples"); do
  line=$(docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' "$container")
  cpu=$(echo "$line" | awk '{gsub("%","",$1); print $1}')
  mem=$(echo "$line" | awk '{print $2}' | sed 's/MiB//; s/GiB/*1024/' | bc -l)
  cpu_sum=$(echo "$cpu_sum + $cpu" | bc -l)
  cpu_max=$(echo "if ($cpu > $cpu_max) $cpu else $cpu_max" | bc -l)
  mem_max=$(echo "if ($mem > $mem_max) $mem else $mem_max" | bc -l)
done
printf 'samples: %s over %s s\naverage CPU: %.0f%% of one core\nhighest CPU: %.0f%% of one core\nhighest memory: %.0f MiB\n' "$samples" "$seconds" "$(echo "$cpu_sum / $samples" | bc -l)" "$cpu_max" "$mem_max"
