import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
  throw new Error("Missing SUPABASE_DB_URL");
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const res = await client.query(
    "select id from public.members limit 1"
  );

  console.log(
    `[keepalive] OK - members rows: ${res.rowCount}`
  );
} catch (err) {
  console.error("[keepalive] ERROR", err);
  process.exit(1);
} finally {
  await client.end();
}
