// One-off script: geocodes Balayan, Batangas's 48 official barangays via the
// free OpenStreetMap Nominatim API and writes the result to
// backend/src/data/barangays.json. Respects Nominatim's usage policy
// (1 request/sec, identifying User-Agent). Re-run only if the barangay list
// changes.
const fs = require("fs");
const path = require("path");

const BARANGAYS = [
  "Baclaran", "Barangay 1 (Poblacion)", "Barangay 2 (Poblacion)", "Barangay 3 (Poblacion)",
  "Barangay 4 (Poblacion)", "Barangay 5 (Poblacion)", "Barangay 6 (Poblacion)", "Barangay 7 (Poblacion)",
  "Barangay 8 (Poblacion)", "Barangay 9 (Poblacion)", "Barangay 10 (Poblacion)", "Barangay 11 (Poblacion)",
  "Barangay 12 (Poblacion)", "Calan", "Caloocan", "Calzada", "Canda", "Carenahan", "Caybunga", "Cayponce",
  "Dalig", "Dao", "Dilao", "Duhatan", "Durungao", "Gimalas", "Gumamela", "Lagnas", "Lanatan", "Langgangan",
  "Lucban Pook", "Lucban Putol", "Magabe", "Malalay", "Munting Tubig", "Navotas", "Palikpikan", "Patugo",
  "Pooc", "Sambat", "Sampaga", "San Juan", "San Piro", "Santol", "Sukol", "Tactac", "Taludtud", "Tanggoy",
];

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "WeighToGo-Capstone/1.0 (one-off barangay geocoding script)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poblacionQuery(name) {
  // Nominatim can't resolve the 12 "Barangay N (Poblacion)" entries
  // individually, so this used to fall back to one shared Poblacion town
  // center coordinate for all of them — which collapsed every Poblacion
  // marker on the map into a single stacked point. Their entries in
  // barangays.json have since been hand-corrected with distinct per-barangay
  // centroids from PhilAtlas; re-running this script would silently
  // reintroduce that bug, so it now just passes the plain query through.
  return `${name}, Balayan, Batangas, Philippines`;
}

async function geocode(name) {
  const query = poblacionQuery(name);
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ph`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim request failed for ${name}: ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

async function main() {
  const results = [];
  for (const name of BARANGAYS) {
    process.stdout.write(`Geocoding ${name}... `);
    try {
      const coords = await geocode(name);
      if (coords) {
        results.push({ name, ...coords });
        console.log(`${coords.lat}, ${coords.lng}`);
      } else {
        console.log("NOT FOUND");
        results.push({ name, lat: null, lng: null });
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ name, lat: null, lng: null });
    }
    await sleep(1100);
  }

  const outPath = path.join(__dirname, "..", "src", "data", "barangays.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} barangays to ${outPath}`);
}

main();
