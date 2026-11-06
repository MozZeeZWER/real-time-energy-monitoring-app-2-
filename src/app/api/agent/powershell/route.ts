import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCRIPT: string = String.raw`
# Energy Monitor Windows agent (ASCII only)
# Loads are sent as 0-1 fractions (site UI multiplies by 100)
# Stop: Ctrl+C

$ErrorActionPreference = "SilentlyContinue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Server = "__ORIGIN__"
if ($env:ENERGY_SERVER) { $Server = $env:ENERGY_SERVER.TrimEnd("/") }
$Server = $Server.TrimEnd("/")
$IntervalSec = 0.5
$IngestUrl = $Server + "/api/ingest"

if (-not ("NativeScreen" -as [type])) {
  Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class NativeScreen {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
  public static string Size() {
    return GetSystemMetrics(0).ToString() + "x" + GetSystemMetrics(1).ToString();
  }
}
"@
}

function Get-MachineId {
  $guid = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography").MachineGuid
  if (-not $guid) { $guid = $env:COMPUTERNAME }
  $clean = $guid -replace "[^A-Za-z0-9]", ""
  $n = [Math]::Min(16, $clean.Length)
  return "win-" + $clean.Substring(0, $n)
}

function Get-CpuSample {
  $pct = 0.0
  $total = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq "_Total" } | Select-Object -First 1
  if ($total -and $null -ne $total.PercentProcessorTime) {
    $pct = [double]$total.PercentProcessorTime
  } else {
    $avg = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
    if ($avg) { $pct = [double]$avg }
  }
  if ($pct -gt 100) { $pct = 100 }
  if ($pct -lt 0) { $pct = 0 }
  $cores = [int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
  if ($cores -lt 1) { $cores = 1 }
  return @{ Percent = [math]::Round($pct, 1); Cores = $cores }
}

function Get-MemorySample {
  $os = Get-CimInstance Win32_OperatingSystem
  $totalKb = [double]$os.TotalVisibleMemorySize
  $freeKb = [double]$os.FreePhysicalMemory
  if ($totalKb -le 0) { return @{ Percent = 0; UsedMb = 0; TotalMb = 0; UsedBytes = 0; TotalBytes = 0 } }
  $usedKb = $totalKb - $freeKb
  return @{
    Percent    = [math]::Round(100.0 * $usedKb / $totalKb, 1)
    UsedMb     = [math]::Round($usedKb / 1024.0, 0)
    TotalMb    = [math]::Round($totalKb / 1024.0, 0)
    UsedBytes  = [int64]($usedKb * 1024)
    TotalBytes = [int64]($totalKb * 1024)
  }
}

function Get-NetworkSample {
  $ifs = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object {
    $_.Name -and ($_.Name -notmatch "isatap|Teredo|Loopback|VPN|Virtual|vEthernet|Bluetooth")
  }
  $rx = 0.0
  $tx = 0.0
  foreach ($i in $ifs) {
    if ($i.BytesReceivedPersec) { $rx += [double]$i.BytesReceivedPersec }
    if ($i.BytesSentPersec) { $tx += [double]$i.BytesSentPersec }
  }
  $downMbps = ($rx * 8.0) / 1000000.0
  $upMbps = ($tx * 8.0) / 1000000.0
  $pct = [math]::Min(100.0, 100.0 * (($downMbps + $upMbps) / 100.0))
  return @{
    Percent  = [math]::Round($pct, 1)
    DownMbps = [math]::Round($downMbps, 2)
    UpMbps   = [math]::Round($upMbps, 2)
    RxKbps   = [math]::Round($rx * 8.0 / 1000.0, 1)
    TxKbps   = [math]::Round($tx * 8.0 / 1000.0, 1)
  }
}

function Get-GpuSample {
  $gpuPct = 0.0
  $gpuWatts = $null
  $nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($nvsmi) {
    try {
      $line = & nvidia-smi --query-gpu=utilization.gpu,power.draw --format=csv,noheader,nounits 2>$null | Select-Object -First 1
      if ($line) {
        $parts = $line -split ","
        if ($parts.Count -ge 1) { $gpuPct = [double]($parts[0].Trim()) }
        if ($parts.Count -ge 2) { $gpuWatts = [double]($parts[1].Trim()) }
      }
    } catch {}
  }
  if ($gpuPct -gt 100) { $gpuPct = 100 }
  if ($gpuPct -lt 0) { $gpuPct = 0 }
  return @{ Percent = [math]::Round($gpuPct, 1); Watts = $gpuWatts }
}

function Get-BatterySample {
  $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $bat) {
    return @{ Present = $false; Level01 = $null; Charging = $false; OnBattery = $false }
  }
  $status = [int]$bat.BatteryStatus
  $charging = ($status -eq 2) -or (($status -ge 6) -and ($status -le 9))
  $onBattery = ($status -eq 1) -or ($status -eq 4) -or ($status -eq 5)
  $level01 = $null
  if ($null -ne $bat.EstimatedChargeRemaining) {
    $level01 = [math]::Max(0.0, [math]::Min(1.0, ([double]$bat.EstimatedChargeRemaining) / 100.0))
  }
  return @{ Present = $true; Level01 = $level01; Charging = $charging; OnBattery = $onBattery }
}

function Estimate-Watts($cpuPct, $gpu, $memPct, $battery) {
  if ($battery.OnBattery -and -not $battery.Charging) { return 0.0 }
  $isLaptop = [bool]$battery.Present
  $tdp = 65.0; $idle = 22.0; $board = 18.0; $monitor = 18.0; $psu = 0.88
  if ($isLaptop) { $tdp = 45.0; $idle = 7.0; $board = 6.0; $monitor = 3.5; $psu = 0.92 }
  $load = [math]::Min(1.0, [math]::Max(0.0, $cpuPct / 100.0))
  $cpuW = $idle + ($tdp - $idle) * [math]::Pow($load, 1.25)
  if ($null -ne $gpu.Watts -and $gpu.Watts -gt 0) { $gpuW = [double]$gpu.Watts } else { $gpuW = 18.0 * ($gpu.Percent / 100.0) }
  $ramW = 3.0 + 5.0 * ($memPct / 100.0)
  return [math]::Round(($cpuW + $gpuW + $ramW + $board + $monitor) / $psu, 1)
}

$deviceId = Get-MachineId
$osObj = Get-CimInstance Win32_OperatingSystem
$osName = "Windows"
if ($osObj.Caption) { $osName = $osObj.Caption.Trim() }
$hostName = $env:COMPUTERNAME
$screen = "unknown"
try { $screen = [NativeScreen]::Size() } catch {}
$bat0 = Get-BatterySample
$kind = "desktop"
if ($bat0.Present) { $kind = "laptop" }

Write-Host ""
Write-Host "  Energy Monitor - Windows agent v3 (0.5s)"
Write-Host ("  Server: {0}" -f $Server)
Write-Host ("  Device: {0} ({1})" -f $hostName, $deviceId)
Write-Host ("  OS: {0}  screen {1}" -f $osName, $screen)
Write-Host ("  Interval: {0}s   Stop: Ctrl+C" -f $IntervalSec)
Write-Host ""

while ($true) {
  try {
    $cpu = Get-CpuSample
    $mem = Get-MemorySample
    $net = Get-NetworkSample
    $gpu = Get-GpuSample
    $bat = Get-BatterySample
    $watts = Estimate-Watts $cpu.Percent $gpu $mem.Percent $bat

    $cpu01 = [math]::Round($cpu.Percent / 100.0, 4)
    $gpu01 = [math]::Round($gpu.Percent / 100.0, 4)
    $mem01 = [math]::Round($mem.Percent / 100.0, 4)
    $net01 = [math]::Round($net.Percent / 100.0, 4)

    $netType = "ethernet"
    if ($kind -eq "laptop") { $netType = "wifi" }
    $memoryGb = [int][math]::Round($mem.TotalMb / 1024.0, 0)
    if ($memoryGb -lt 1) { $memoryGb = 1 }
    $cpuTdp = 65
    $gpuTdp = 20
    $displayW = 18
    $batteryWh = 0
    if ($kind -eq "laptop") {
      $cpuTdp = 45
      $gpuTdp = 15
      $displayW = 4
      $batteryWh = 52
    }

    $payload = @{
      deviceId     = $deviceId
      name         = ($hostName + " (Windows)")
      kind         = $kind
      spec         = @{
        cpuTdpW   = $cpuTdp
        gpuTdpW   = $gpuTdp
        displayW  = $displayW
        batteryWh = $batteryWh
      }
      meta         = @{
        userAgent = "EnergyAgent-PowerShell/2.0 Windows NT 10.0"
        cores     = [int]$cpu.Cores
        memoryGb  = [int]$memoryGb
        screen    = $screen
        timezone  = "Europe/Minsk"
      }
      watts        = $watts
      batteryWatts = 0
      cpuLoad      = $cpu01
      gpuLoad      = $gpu01
      heapMb       = [double]$mem.UsedMb
      batteryLevel = $bat.Level01
      charging     = [bool]$bat.Charging
      screenOn     = $true
      netType      = $netType
      downlinkMbps = [double]$net.DownMbps
      rttMs        = 0
      intervalMs   = ($IntervalSec * 1000)
    }

    $json = $payload | ConvertTo-Json -Compress -Depth 4
    $ok = $false
    try {
      $resp = Invoke-RestMethod -Uri $IngestUrl -Method POST -Body $json -ContentType "application/json; charset=utf-8" -TimeoutSec 8
      $ok = $true
    } catch {
      $now = Get-Date -Format "HH:mm:ss"
      Write-Host ("[{0}] send error: {1}" -f $now, $_.Exception.Message) -ForegroundColor Red
    }

    if ($ok) {
      $now = Get-Date -Format "HH:mm:ss"
      $line = "[{0}] CPU: {1}% | RAM: {2}% ({3}/{4} MB) | NET: {5} Mbps | GPU: {6}% | {7} W" -f $now, $cpu.Percent, $mem.Percent, $mem.UsedMb, $mem.TotalMb, $net.DownMbps, $gpu.Percent, $watts
      Write-Host $line
    }
  } catch {
    $now = Get-Date -Format "HH:mm:ss"
    Write-Host ("[{0}] sample error: {1}" -f $now, $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds $IntervalSec
}
`.slice(1);

function getOrigin(req: NextRequest): string {
  const xfHost = req.headers.get("x-forwarded-host");
  const host = (xfHost || req.headers.get("host") || "").split(",")[0].trim();
  const xfProto = req.headers.get("x-forwarded-proto");
  if (host) {
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = xfProto || (isLocal ? "http" : "https");
    return (proto + "://" + host).replace(/\/$/, "");
  }
  return (req.nextUrl?.origin || "http://127.0.0.1:3000").replace(/\/$/, "");
}

function buildScript(origin: string): string {
  const base = (origin || "http://127.0.0.1:3000").replace(/\/$/, "");
  return SCRIPT.split("__ORIGIN__").join(base);
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);
  const script = buildScript(origin);
  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="energy-agent.ps1"',
    },
  });
}