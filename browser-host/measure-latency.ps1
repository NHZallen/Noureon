# Windows version of measure-latency.sh. Run it on YOUR computer (PowerShell, no administrator rights needed), not on the server.
# It opens a TCP connection to the host 30 times and prints how long each takes (milliseconds). Taking over the browser feels this round trip twice,
# so 150 ms or more is clearly noticeable, and the spread (best against worst) matters as much as the average.
#   .\measure-latency.ps1 -HostName 84.247.153.81 -Port 22 -Count 30
param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [int]$Port = 22,
  [int]$Count = 30
)
$times = @()
for ($i = 0; $i -lt $Count; $i++) {
  $client = New-Object System.Net.Sockets.TcpClient
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $pending = $client.BeginConnect($HostName, $Port, $null, $null)
    if ($pending.AsyncWaitHandle.WaitOne(5000)) {
      $client.EndConnect($pending)
      $watch.Stop()
      $times += $watch.Elapsed.TotalMilliseconds
    }
  } catch { } finally { $client.Close() }
  Start-Sleep -Milliseconds 300
}
if ($times.Count -eq 0) { Write-Output "no connection could be opened (is the port open?)"; exit 1 }
$sorted = $times | Sort-Object
$average = ($sorted | Measure-Object -Average).Average
$median = $sorted[[int][math]::Floor(($sorted.Count - 1) / 2)]
Write-Output ("TCP connect time to {0}:{1}, {2} tries (milliseconds)" -f $HostName, $Port, $Count)
Write-Output ("answered: {0}   min {1:N0}   median {2:N0}   average {3:N0}   worst {4:N0}" -f $sorted.Count, $sorted[0], $median, $average, $sorted[-1])
Write-Output ("all, sorted: " + (($sorted | ForEach-Object { '{0:N0}' -f $_ }) -join ' '))
