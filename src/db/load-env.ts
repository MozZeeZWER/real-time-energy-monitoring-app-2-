import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function decodeEnvBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf);
    swapped.swap16();
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

function applyEnvText(text: string) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadOne(filePath: string) {
  if (!existsSync(filePath)) return;
  try {
    applyEnvText(decodeEnvBuffer(readFileSync(filePath)));
  } catch {
    // ignore unreadable env files
  }
}

const names = [".env", ".env.local", "connect.env", "connect.env.txt"];
for (const name of names) {
  loadOne(resolve(process.cwd(), name));
}

const current = process.env.DATABASE_URL;
if (!current || current === "undefined") {
  process.env.DATABASE_URL =
    "postgresql://postgres:1234@127.0.0.1:5432/app_db";
}
