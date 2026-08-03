const { createClient } = require("@supabase/supabase-js");

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn(
    "[supabase] SUPABASE_URL / SUPABASE_ANON_KEY are not set yet. " +
      "Add them to backend/.env once your Supabase project is created. " +
      "Routes that touch the database will fail until then."
  );
}

module.exports = supabase;
