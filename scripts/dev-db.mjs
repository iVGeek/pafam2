import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = 5433;
const USER = "postgres";
const PASSWORD = "postgres";
const DB_NAME = "pafam2";

export const DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}?schema=public`;

export function createDb({ quiet = true } = {}) {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: quiet ? () => {} : (m) => process.stdout.write(`[pg] ${m}`),
    onError: (e) => console.error("[pg]", e?.message ?? e),
  });
}

/**
 * Initialise (first run only), start the cluster and ensure the app database
 * exists. Safe to call repeatedly against a persistent data directory.
 */
export async function startDb({ log = () => {} } = {}) {
  const pg = createDb();
  const initialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (!initialised) {
    log(`Initialising Postgres cluster in ${DATA_DIR} ...`);
    await pg.initialise();
  }
  log(`Starting Postgres on port ${PORT} ...`);
  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
    log(`Created database "${DB_NAME}".`);
  } catch {
    log(`Database "${DB_NAME}" already exists.`);
  }
  return pg;
}

const isMain =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const command = process.argv[2] ?? "start";
  if (command === "start") {
    startDb({ log: console.log })
      .then(() => {
        console.log("");
        console.log("Local Postgres ready.");
        console.log(`DATABASE_URL=${DATABASE_URL}`);
        console.log("Press Ctrl+C to stop.");
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
    // The spawned Postgres keeps this process alive until Ctrl+C.
  } else {
    console.error(`Unknown command "${command}". Use: start`);
    process.exit(1);
  }
}
