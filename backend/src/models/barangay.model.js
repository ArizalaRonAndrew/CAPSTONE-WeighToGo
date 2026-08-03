const barangays = require("../data/barangays.json");

function getAll() {
  return barangays;
}

module.exports = { getAll };
