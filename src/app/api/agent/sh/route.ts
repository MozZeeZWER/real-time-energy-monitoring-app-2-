export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || (url.protocol.replace(":", "") || "http");
  const endpoint = `${proto}://${host}/api/ingest`;

  const script = `#!/usr/bin/env bash
# =====================================================================
# ЭНЕРГОМОНИТОР · ГОМЕЛЬ — АГЕНТ СБОРА ДЛЯ LINUX / MACOS (BASH)
# Снимает загрузку CPU (/proc/stat), RAPL, батарею, nvidia-smi
# и отправляет замеры на сервер каждые 4 секунды.
# Запуск: bash <(curl -sSL "${proto}://${host}/api/agent/sh")
# =====================================================================

ENDPOINT="${endpoint}"
if [ -z "\${INGEST_SECRET}" ]; then
  echo "INGEST_SECRET is not set" >&2
  exit 1
fi
DEVICE_NAME="$(hostname -s 2>/dev/null || hostname)"
DEVICE_ID="nix-$(echo "$DEVICE_NAME" | tr '[:upper:]' '[:lower:]')-$USER"

echo -e "\\033[1;32m==========================================================\\033[0m"
echo -e "\\033[1;32m [Энергомонитор Гомель] Linux/macOS Агент запущен\\033[0m"
echo -e " Устройство : \\033[1;36m$DEVICE_NAME ($DEVICE_ID)\\033[0m"
echo -e " Сервер     : \\033[1;36m$ENDPOINT\\033[0m"
echo -e " Тариф      : \\033[1;33mГомель / РБ (пост. Совмина № 93 от 25.02.2026)\\033[0m"
echo -e " Нажмите Ctrl+C для выхода"
echo -e "\\033[1;32m==========================================================\\033[0m"

# Определение батареи
HAS_BATTERY="false"
BAT_PATH=""
if [ -d /sys/class/power_supply ]; then
    for b in /sys/class/power_supply/BAT*; do
        if [ -d "$b" ]; then
            HAS_BATTERY="true"
            BAT_PATH="$b"
            break
        fi
    done
fi

KIND="desktop"
CPU_TDP=65
GPU_TDP=20
DISPLAY_W=24
if [ "$HAS_BATTERY" = "true" ]; then
    KIND="laptop"
    CPU_TDP=28
    GPU_TDP=14
    DISPLAY_W=6
fi

CORES="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
MEM_GB="$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 8)"

read_cpu() {
    if [ -f /proc/stat ]; then
        awk 'NR==1 {u=$2+$4; t=$2+$4+$5; if (NR==1) {print u, t}}' /proc/stat
    else
        echo "0 100"
    fi
}

PREV_READ="$(read_cpu)"
PREV_U="$(echo "$PREV_READ" | cut -d' ' -f1)"
PREV_T="$(echo "$PREV_READ" | cut -d' ' -f2)"

while true; do
    sleep 4
    NOW_READ="$(read_cpu)"
    NOW_U="$(echo "$NOW_READ" | cut -d' ' -f1)"
    NOW_T="$(echo "$NOW_READ" | cut -d' ' -f2)"

    DIFF_U=$((NOW_U - PREV_U))
    DIFF_T=$((NOW_T - PREV_T))
    PREV_U=$NOW_U
    PREV_T=$NOW_T

    if [ "$DIFF_T" -gt 0 ]; then
        CPU_PCT=$(awk -v u="$DIFF_U" -v t="$DIFF_T" 'BEGIN {p=(u/t)*100; if (p>100) p=100; if (p<0) p=0; printf "%.1f", p}')
        CPU_LOAD=$(awk -v p="$CPU_PCT" 'BEGIN {printf "%.3f", p/100}')
    else
        CPU_PCT="10.0"
        CPU_LOAD="0.100"
    fi

    # Батарея
    BAT_LEVEL="null"
    CHARGING="false"
    BAT_WATTS="null"
    if [ "$HAS_BATTERY" = "true" ] && [ -n "$BAT_PATH" ]; then
        if [ -f "$BAT_PATH/capacity" ]; then
            CAP="$(cat "$BAT_PATH/capacity" 2>/dev/null || echo 100)"
            BAT_LEVEL=$(awk -v c="$CAP" 'BEGIN {printf "%.2f", c/100}')
        fi
        STATUS="$(cat "$BAT_PATH/status" 2>/dev/null || echo "Unknown")"
        if [ "$STATUS" = "Charging" ] || [ "$STATUS" = "Full" ]; then
            CHARGING="true"
        fi
        if [ -f "$BAT_PATH/power_now" ]; then
            P_NOW="$(cat "$BAT_PATH/power_now" 2>/dev/null || echo 0)"
            BAT_WATTS=$(awk -v p="$P_NOW" 'BEGIN {printf "%.1f", p/1000000}')
        fi
    fi

    # Расчет ватт
    if [ "$KIND" = "desktop" ]; then
        CPU_IDLE=12
        PLATFORM=36
    else
        CPU_IDLE=5
        PLATFORM=6
    fi

    GRID_WATTS=$(awk -v load="$CPU_LOAD" -v tdp="$CPU_TDP" -v idle="$CPU_IDLE" -v plat="$PLATFORM" -v disp="$DISPLAY_W" 'BEGIN {
        cpu = idle + (load ^ 1.35) * (tdp - idle);
        gpu = (load * 0.4) * 15;
        sys = cpu + gpu + plat + disp;
        psu = sys * 0.14;
        printf "%.1f", sys + psu;
    }')

    if [ "$HAS_BATTERY" = "true" ] && [ "$CHARGING" = "false" ]; then
        GRID_WATTS="0.0"
    fi

    PAYLOAD=$(cat <<JSON
{
  "deviceId": "$DEVICE_ID",
  "name": "$DEVICE_NAME (Linux)",
  "kind": "$KIND",
  "intervalMs": 4000,
  "watts": $GRID_WATTS,
  "batteryWatts": $BAT_WATTS,
  "cpuLoad": $CPU_LOAD,
  "gpuLoad": 0.05,
  "batteryLevel": $BAT_LEVEL,
  "charging": $CHARGING,
  "screenOn": true,
  "spec": {
    "cpuTdpW": $CPU_TDP,
    "gpuTdpW": $GPU_TDP,
    "displayW": $DISPLAY_W,
    "batteryWh": 50
  },
  "meta": {
    "userAgent": "Bash Agent ($DEVICE_NAME)",
    "cores": $CORES,
    "memoryGb": $MEM_GB,
    "timezone": "Europe/Minsk"
  }
}
JSON
)

    RESP=$(curl -s -X POST "$ENDPOINT" -H "Content-Type: application/json" -H "x-ingest-secret: \${INGEST_SECRET}" -d "$PAYLOAD" --max-time 4)
    RATE=$(echo "$RESP" | grep -o '"rate":[0-9.]*' | cut -d: -f2)
    ZONE=$(echo "$RESP" | grep -o '"zone":"[^"]*"' | cut -d: -f2 | tr -d '"')

    TS="$(date '+%H:%M:%S')"
    echo "[$TS] CPU: $CPU_PCT% | Мощность: $GRID_WATTS Вт | Ставка: $RATE BYN/кВт·ч ($ZONE)"
done
`;

  return new Response(script, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
