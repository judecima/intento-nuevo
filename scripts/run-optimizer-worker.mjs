const url = process.env.OPTIMIZER_WORKER_URL;
const secret = process.env.OPTIMIZER_WORKER_SECRET;
const idleMs = positiveInt(process.env.OPTIMIZER_WORKER_IDLE_MS, 1000);
const errorMs = positiveInt(process.env.OPTIMIZER_WORKER_ERROR_MS, 5000);
const once = /^(1|true|yes)$/i.test(process.env.OPTIMIZER_WORKER_ONCE ?? "");

if (!url || !secret) {
  console.error("OPTIMIZER_WORKER_URL and OPTIMIZER_WORKER_SECRET are required");
  process.exit(1);
}

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json"
      },
      body: "{}"
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`${response.status} ${JSON.stringify(payload)}`);
    }

    const status = payload?.outcome?.status ?? "unknown";
    if (status !== "idle") {
      console.log(new Date().toISOString(), status, payload?.outcome?.jobId ?? "");
    }

    if (once) break;
    if (status === "idle" || status === "contended") await sleep(idleMs);
  } catch (error) {
    console.error(new Date().toISOString(), error instanceof Error ? error.message : String(error));
    if (once) process.exit(1);
    await sleep(errorMs);
  }
}

function positiveInt(raw, fallback) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
