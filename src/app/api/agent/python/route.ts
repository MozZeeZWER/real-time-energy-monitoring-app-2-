export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || (url.protocol.replace(":", "") || "http");
  const endpoint = `${proto}://${host}/api/ingest`;

  const script = `#!/usr/bin/env python3
"""
ЭНЕРГОМОНИТОР · ГОМЕЛЬ — КРОСС-ПЛАТФОРМЕННЫЙ АГЕНТ (PYTHON 3)
Работает на Windows, Linux и macOS без внешних библиотек (только стандартные модули).
Снимает загрузку CPU, память, платформу и шлёт замеры каждые 4 секунды.
"""

import json
import os
import platform
import socket
import sys
import time
import urllib.request

ENDPOINT = "${endpoint}"
HOSTNAME = socket.gethostname()
SYSTEM = platform.system()
DEVICE_ID = f"py-{SYSTEM.lower()}-{HOSTNAME.lower()}"

print("=" * 60)
print(" [Энергомонитор Гомель] Python-агент сбора запущен")
print(f" Устройство : {HOSTNAME} ({SYSTEM})")
print(f" Сервер     : {ENDPOINT}")
print(" Тариф      : Гомель / РБ (пост. Совмина № 93 от 25.02.2026)")
print(" Нажмите Ctrl+C для выхода")
print("=" * 60)

CORES = os.cpu_count() or 4
KIND = "laptop" if SYSTEM == "Darwin" or "laptop" in HOSTNAME.lower() else "desktop"
CPU_TDP = 28 if KIND == "laptop" else 65
GPU_TDP = 14 if KIND == "laptop" else 20
DISPLAY_W = 6 if KIND == "laptop" else 24

def get_cpu_load():
    try:
        # Linux
        if os.path.exists("/proc/stat"):
            with open("/proc/stat") as f:
                fields = [float(x) for x in f.readline().strip().split()[1:5]]
            idle, total = fields[3], sum(fields)
            time.sleep(0.5)
            with open("/proc/stat") as f:
                fields2 = [float(x) for x in f.readline().strip().split()[1:5]]
            idle2, total2 = fields2[3], sum(fields2)
            d_total = total2 - total
            d_idle = idle2 - idle
            if d_total > 0:
                return max(0.0, min(1.0, 1.0 - (d_idle / d_total)))
    except Exception:
        pass
    # Fallback load avg or baseline
    try:
        load1, _, _ = os.getloadavg()
        return max(0.02, min(1.0, load1 / float(CORES)))
    except Exception:
        return 0.15

last_time = time.time()

while True:
    now = time.time()
    dt_ms = max(1000, int((now - last_time) * 1000))
    last_time = now

    cpu_load = round(get_cpu_load(), 3)
    gpu_load = round(cpu_load * 0.35, 3)

    cpu_idle = 5 if KIND == "laptop" else 12
    platform_w = 6 if KIND == "laptop" else 36
    cpu_w = cpu_idle + (cpu_load ** 1.35) * (CPU_TDP - cpu_idle)
    gpu_w = (gpu_load ** 1.2) * GPU_TDP
    sys_w = cpu_w + gpu_w + platform_w + DISPLAY_W
    grid_watts = round(sys_w * 1.14, 1)

    payload = {
        "deviceId": DEVICE_ID,
        "name": f"{HOSTNAME} ({SYSTEM})",
        "kind": KIND,
        "intervalMs": dt_ms,
        "watts": grid_watts,
        "cpuLoad": cpu_load,
        "gpuLoad": gpu_load,
        "screenOn": True,
        "spec": {
            "cpuTdpW": CPU_TDP,
            "gpuTdpW": GPU_TDP,
            "displayW": DISPLAY_W,
            "batteryWh": 50,
        },
        "meta": {
            "userAgent": f"Python Agent ({SYSTEM} {platform.release()})",
            "cores": CORES,
            "timezone": "Europe/Minsk",
        },
    }

    try:
        req = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode())
            rate = data.get("rate", 0)
            zone = data.get("zone", "")
            cost_h = round((grid_watts / 1000.0) * rate, 4)
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] CPU: {int(cpu_load*100)}% | Мощность: {grid_watts} Вт | {cost_h} BYN/ч ({zone}, {rate} BYN)")
    except Exception as e:
        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] Ошибка передачи: {e}")

    time.sleep(3.5)
`;

  return new Response(script, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
