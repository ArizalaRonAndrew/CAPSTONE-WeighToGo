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

function getDueSupplements(ageInMonths, existingRecords = []) {
  const due = [];

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    const administeredDoseOrders = new Set(
      existingRecords.filter((r) => r.supplement_type === supplementType).map((r) => r.dose_order)
    );

    for (const window of windows) {
      if (ageInMonths < window.start_month) continue;
      if (administeredDoseOrders.has(window.dose_order)) continue;

      due.push({
        supplement_type: supplementType,
        dose_order: window.dose_order,
        window_start_month: window.start_month,
        window_end_month: window.end_month,
        overdue: ageInMonths > window.end_month,
      });
    }
  }

  return due;
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

module.exports = { getScheduleWindows, getDueSupplements, getSupplementSchedule };
