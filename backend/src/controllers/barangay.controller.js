const barangayModel = require("../models/barangay.model");
const childrenModel = require("../models/children.model");

async function listBarangays(req, res, next) {
  try {
    const children = await childrenModel.findAll({});
    const counts = new Map();
    for (const child of children) {
      counts.set(child.barangay, (counts.get(child.barangay) || 0) + 1);
    }

    const barangays = barangayModel.getAll().map((b) => ({ ...b, childCount: counts.get(b.name) || 0 }));
    res.json(barangays);
  } catch (err) {
    next(err);
  }
}

module.exports = { listBarangays };
