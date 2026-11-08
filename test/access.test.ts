import assert from "node:assert/strict";
import test from "node:test";
import { denyUnless } from "../src/lib/auth";
import { plugWriteForbidden } from "../src/lib/plug-write";

test("dashboard secret is required on its own", async () => {
  const prev = process.env.ADMIN_SECRET;
  delete process.env.ADMIN_SECRET;
  try {
    const res = denyUnless(new Request("http://local/api/devices"), "ADMIN_SECRET");
    if (!res) throw new Error("expected deny");
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: string }).error, "admin_secret_unconfigured");
  } finally {
    if (prev === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = prev;
  }
});

test("ingest secret does not open the dashboard routes", () => {
  process.env.ADMIN_SECRET = "admin-one";
  process.env.INGEST_SECRET = "ingest-one";
  try {
    const res = denyUnless(
      new Request("http://local/api/devices", { headers: { "x-admin-secret": "ingest-one" } }),
      "ADMIN_SECRET",
    );
    if (!res) throw new Error("expected deny");
    assert.equal(res.status, 401);
    assert.equal(
      denyUnless(
        new Request("http://local/api/devices", { headers: { "x-admin-secret": "admin-one" } }),
        "ADMIN_SECRET",
      ),
      null,
    );
  } finally {
    delete process.env.ADMIN_SECRET;
    delete process.env.INGEST_SECRET;
  }
});

test("agent secret is a different header", () => {
  process.env.INGEST_SECRET = "ingest-one";
  try {
    const missing = denyUnless(new Request("http://local/api/ingest"), "INGEST_SECRET");
    if (!missing) throw new Error("expected deny");
    assert.equal(missing.status, 401);
    assert.equal(
      denyUnless(
        new Request("http://local/api/ingest", { headers: { "x-ingest-secret": "ingest-one" } }),
        "INGEST_SECRET",
      ),
      null,
    );
    assert.equal(
      denyUnless(
        new Request("http://local/api/ingest", { headers: { "x-admin-secret": "ingest-one" } }),
        "INGEST_SECRET",
      )?.status,
      401,
    );
  } finally {
    delete process.env.INGEST_SECRET;
  }
});

test("only the poller may write a plug sample", () => {
  assert.equal(plugWriteForbidden("plug", undefined), true);
  assert.equal(plugWriteForbidden("plug", "poller"), false);
  assert.equal(plugWriteForbidden("agent", undefined), false);
  assert.equal(plugWriteForbidden(undefined, undefined), false);
});
