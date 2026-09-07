const baseUrl = new URL(process.env.SMOKE_BASE_URL || process.argv[2] || "http://localhost:3000");

const checks = [
  { path: "/", type: "ok" },
  { path: "/jadsi", type: "redirect", targetPath: "/jadsi/login" },
  { path: "/jadsi/login", type: "ok" },
  { path: "/projects", type: "root_redirect" },
  { path: "/jadsi/projects", type: "protected", loginPath: "/jadsi/login" },
  { path: "/jadsi/admin/organizations", type: "protected", loginPath: "/jadsi/login" }
];

const failures = [];

for (const check of checks) {
  try {
    const response = await fetch(new URL(check.path, baseUrl), { redirect: "manual" });
    const location = response.headers.get("location") ?? "";

    if (check.type === "ok" && response.status !== 200) {
      failures.push(`${check.path}: expected 200, got ${response.status}`);
      continue;
    }

    if (check.type === "root_redirect") {
      const isRedirect = response.status >= 300 && response.status < 400;
      const locationPath = location ? new URL(location, baseUrl).pathname : "";
      if (!isRedirect || locationPath !== "/") {
        failures.push(`${check.path}: expected redirect to /, got ${response.status} ${location}`);
      }
    }

    if (check.type === "redirect") {
      const isRedirect = response.status >= 300 && response.status < 400;
      const locationPath = location ? new URL(location, baseUrl).pathname : "";
      if (!isRedirect || locationPath !== check.targetPath) {
        failures.push(`${check.path}: expected redirect to ${check.targetPath}, got ${response.status} ${location}`);
      }
    }

    if (check.type === "protected") {
      const isRedirect = response.status >= 300 && response.status < 400;
      if (!isRedirect || !location.includes(check.loginPath)) {
        failures.push(`${check.path}: expected redirect to ${check.loginPath}, got ${response.status} ${location}`);
      }
    }
  } catch (error) {
    failures.push(`${check.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error("Route smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Start the app with `npm run dev` or set SMOKE_BASE_URL to a running deployment.");
  process.exit(1);
}

console.log(`Route smoke OK (${checks.length} checks at ${baseUrl.origin})`);
