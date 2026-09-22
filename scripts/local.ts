/**
 * One command for a fully local stack, no Supabase:
 *
 *   bun run local
 *
 * 1. starts Postgres in Docker (docker-compose.yml) on a free host port
 * 2. applies the Drizzle migrations
 * 3. seeds demo data (idempotent, existing rows are kept)
 * 4. runs `next dev` on a free port, with CVs stored on disk (apps/app/.storage)
 *
 * Every value below can be overridden from the shell, e.g. `PORT=4000 bun run local`.
 * Stop the database with `docker compose down` (add `-v` to wipe its data).
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "..");
const app = path.join(repo, "apps/app");

function isFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, "0.0.0.0");
  });
}

async function freePort(start: number) {
  for (let port = start; port < start + 100; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`No free port in ${start}-${start + 99}`);
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: opts.cwd ?? repo, env: opts.env ?? process.env });
  if (result.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(" ")} failed`);
    process.exit(result.status ?? 1);
  }
}

// Reuse the port of an already-running container so it is not recreated.
function runningPostgresPort() {
  const out = spawnSync("docker", ["compose", "port", "postgres", "5432"], { cwd: repo, encoding: "utf8" });
  const port = Number(out.stdout?.trim().split(":").pop());
  return out.status === 0 && port ? port : null;
}

const pgPort = Number(process.env.POSTGRES_PORT) || runningPostgresPort() || (await freePort(5432));
const appPort = Number(process.env.PORT) || (await freePort(3000));
const appUrl = `http://localhost:${appPort}`;
const dbUrl = `postgresql://docket:docket@127.0.0.1:${pgPort}/docket`;

const env: NodeJS.ProcessEnv = {
  ...process.env,
  POSTGRES_PORT: String(pgPort),
  DATABASE_URL: dbUrl,
  DIRECT_URL: dbUrl,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: process.env.LOCAL_STORAGE_DIR ?? path.join(app, ".storage"),
  SUPABASE_STORAGE_BUCKET: "cv",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "local-dev-secret-not-for-production-use",
  BETTER_AUTH_URL: appUrl,
  NEXT_PUBLIC_APP_URL: appUrl,
  NOTIFICATIONS_ENABLED: "false",
  RESEND_API_KEY: "",
};
// Never let hosted-Supabase settings leak into the local stack.
delete env.NEXT_PUBLIC_SUPABASE_URL;
delete env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`→ Postgres on 127.0.0.1:${pgPort}`);
run("docker", ["compose", "up", "-d", "--wait", "postgres"], { env });

console.log("→ applying migrations");
run("bunx", ["drizzle-kit", "migrate"], { cwd: app, env });

console.log("→ seeding demo data");
run("bun", ["run", "db:seed"], { cwd: app, env });

console.log(`→ starting Next.js on ${appUrl}  (sign in as hr@example.com / hr@example.com)`);
const next = spawn("bunx", ["next", "dev", "--port", String(appPort)], { cwd: app, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => next.kill(signal));
}
next.on("exit", (code) => process.exit(code ?? 0));
