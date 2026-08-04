/**
 * Standard DOH (Garantisadong Pambata) schedule:
 * - Vitamin A: dose 1 at 6-11mo (100,000 IU), then every 6 months from
 *   12-59mo (200,000 IU).
 * - Deworming: every 6 months from 12-59mo.
 */

function buildSixMonthWindows(startMonth, endMonth, firstDoseOrder = 1) {
  const windows = [];
  let doseOrder = firstDoseOrder;
  for (let start = startMonth; start < endMonth; start += 6) {
    windows.push({ dose_order: doseOrder, start_month: start, end_month: Math.min(start + 5, endMonth) });
    doseOrder += 1;
  }
  return windows;
}

function getScheduleWindows(supplementType) {
  if (supplementType === "Vitamin A") {
    return [{ dose_order: 1, start_month: 6, end_month: 11 }, ...buildSixMonthWindows(12, 59, 2)];
  }
  if (supplementType === "Deworming") {
    return buildSixMonthWindows(12, 59, 1);
  }
  throw new Error(`Unknown supplement type: ${supplementType}`);
}

// `ageAtRegistration` is the child's age (in months) when they were added to
// this system. Defaults to their current age, which grandfathers every dose
// window that isn't the one currently in progress — the right assumption for
// callers that don't track registration age separately.
function getDueSupplements(ageInMonths, existingRecords = [], ageAtRegistration = ageInMonths) {
  const due = [];

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    const administeredDoseOrders = new Set(
      existingRecords.filter((r) => r.supplement_type === supplementType).map((r) => r.dose_order)
    );

    for (const window of windows) {
      // Windows are in ascending order, so once one hasn't opened yet,
      // none after it have either — a dose appears the exact day the
      // child's age reaches window.start_month, not before.
      if (ageInMonths < window.start_month) break;
      if (administeredDoseOrders.has(window.dose_order)) continue;

      // A window that had already fully closed before this child was
      // registered is assumed to have been handled before this system
      // existed to record it, so it isn't resurfaced as a backlog item.
      if (window.end_month < ageAtRegistration) continue;

      // First outstanding, trackable dose for this supplement type: it
      // stays due — no matter how much further the child ages — until BNS
      // records it as given.
      due.push({
        supplement_type: supplementType,
        dose_order: window.dose_order,
        window_start_month: window.start_month,
        window_end_month: window.end_month,
        overdue: ageInMonths > window.end_month,
      });
      break;
    }
  }

  return due;
}

// Per-type compliance snapshot: the single next dose a child needs (or
// whether they're not yet age-eligible / already up to date).
function getComplianceStatus(ageInMonths, existingRecords = []) {
  const result = {};

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    const administeredDoseOrders = new Set(
      existingRecords.filter((r) => r.supplement_type === supplementType).map((r) => r.dose_order)
    );
    const eligibleWindows = windows.filter((w) => ageInMonths >= w.start_month);

    if (eligibleWindows.length === 0) {
      result[supplementType] = { status: "not_eligible" };
      continue;
    }

    const nextWindow = eligibleWindows.find((w) => !administeredDoseOrders.has(w.dose_order));
    if (!nextWindow) {
      result[supplementType] = { status: "complete" };
      continue;
    }

    result[supplementType] = {
      status: "due",
      dose_order: nextWindow.dose_order,
      overdue: ageInMonths > nextWindow.end_month,
    };
  }

  return result;
}

// Full dose-by-dose timeline for one child, merging the standard schedule
// windows with whatever has actually been recorded in tbl_supplements, so the
// UI can show every dose's state instead of only the ones still outstanding.
function getSupplementSchedule(ageInMonths, existingRecords = []) {
  const schedule = {};

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    const recordsByDose = new Map(
      existingRecords
        .filter((r) => r.supplement_type === supplementType)
        .map((r) => [r.dose_order, r])
    );

    schedule[supplementType] = windows.map((window) => {
      const record = recordsByDose.get(window.dose_order);
      let status;
      if (record) {
        status = "given";
      } else if (ageInMonths < window.start_month) {
        status = "upcoming";
      } else if (ageInMonths > window.end_month) {
        status = "overdue";
      } else {
        status = "due";
      }

      return {
        supplement_type: supplementType,
        dose_order: window.dose_order,
        window_start_month: window.start_month,
        window_end_month: window.end_month,
        status,
        date_administered: record ? record.date_administered : null,
        record_id: record ? record.id : null,
      };
    });
  }

  return schedule;
}

module.exports = { getScheduleWindows, getDueSupplements, getComplianceStatus, getSupplementSchedule };
