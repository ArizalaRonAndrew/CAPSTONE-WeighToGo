// One-off: make every BNS account's password match the Caloocan BNS account's.
// Passwords are bcrypt hashes, so "same password" is done by copying the
// Caloocan account's hash onto all other role='BNS' rows in tbl_users.
require("dotenv").config();

const supabase = require("../src/config/supabase");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const CALOOCAN_BARANGAY = "Caloocan";

async function main() {
  console.log("=== WeighToGo: sync all BNS passwords to Caloocan's ===\n");

  // 1. Find the Caloocan BNS account and grab its password hash.
  const { data: caloocanUsers, error: calErr } = await supabase
    .from("tbl_users")
    .select("id, email, role, assigned_barangay, password")
    .eq("role", "BNS")
    .ilike("assigned_barangay", CALOOCAN_BARANGAY);
  if (calErr) throw new Error(`Failed to look up Caloocan BNS: ${calErr.message}`);
  if (!caloocanUsers.length) throw new Error(`No BNS account found for barangay "${CALOOCAN_BARANGAY}".`);
  const caloocan = caloocanUsers[0];
  console.log(`Caloocan BNS account: ${caloocan.email} (hash ${caloocan.password.slice(0, 20)}...)`);

  // 2. Fetch every BNS account.
  const { data: bnsUsers, error: bnsErr } = await supabase
    .from("tbl_users")
    .select("id, email, assigned_barangay, password")
    .eq("role", "BNS");
  if (bnsErr) throw new Error(`Failed to list BNS accounts: ${bnsErr.message}`);

  // 3. Update every BNS account whose hash differs from Caloocan's.
  const targets = bnsUsers.filter((u) => u.password !== caloocan.password);
  console.log(`BNS accounts found: ${bnsUsers.length}; needing update: ${targets.length}\n`);

  const CHUNK = 200;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const ids = chunk.map((u) => u.id);
    const { error: updErr } = await supabase
      .from("tbl_users")
      .update({ password: caloocan.password })
      .in("id", ids);
    if (updErr) throw new Error(`Failed to update BNS passwords: ${updErr.message}`);
  }

  console.log("Updated accounts:");
  for (const u of targets) {
    console.log(`  ${u.assigned_barangay || "(no barangay)"} — ${u.email}`);
  }
  if (!targets.length) console.log("  (none — all BNS accounts already share Caloocan's password)");
  console.log(`\nEvery BNS account now logs in with the Caloocan account's password.`);
}

main().catch((err) => {
  console.error("\nScript failed:", err.message);
  process.exit(1);
});
