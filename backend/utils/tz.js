// ============================================================
// Oswagolink - Timezone Helper (EAT)
// ------------------------------------------------------------
// EAT = Africa/Dar_es_Salaam = UTC+3, no DST.
//
// PostgreSQL stores all timestamptz columns in UTC. "Today" is
// computed in EAT, then the DB query uses the resulting UTC range.
// Only the helpers the project uses are here.
// ============================================================

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT = UTC+3, no DST

// ------------------------------------------------------------
// Internal: extract EAT calendar parts from a UTC Date
// ------------------------------------------------------------
const eatParts = (referenceDate) => {
  const eat = new Date(referenceDate.getTime() + EAT_OFFSET_MS);
  return {
    year: eat.getUTCFullYear(),
    month: eat.getUTCMonth(),      // 0-indexed
    day: eat.getUTCDate(),
    hour: eat.getUTCHours(),
    minute: eat.getUTCMinutes(),
    second: eat.getUTCSeconds(),
  };
};

// ------------------------------------------------------------
// Build a UTC Date from EAT wall-clock (EAT = UTC+3)
// ------------------------------------------------------------
const eatToUTC = (year, monthIndex, day, hour = 0, minute = 0, second = 0, ms = 0) => {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms) - EAT_OFFSET_MS);
};

// ------------------------------------------------------------
// getTodayRangeEAT()
// Returns { start, end } as UTC Date objects covering "today"
// in EAT: 00:00:00.000 EAT → 23:59:59.999 EAT.
// ------------------------------------------------------------
const getTodayRangeEAT = (referenceDate = new Date()) => {
  const p = eatParts(referenceDate);
  return {
    start: eatToUTC(p.year, p.month, p.day, 0, 0, 0, 0),
    end:   eatToUTC(p.year, p.month, p.day, 23, 59, 59, 999),
  };
};

// ------------------------------------------------------------
// formatDateEAT(input)
// UTC Date/string → "YYYY-MM-DD" in EAT.
// ------------------------------------------------------------
const formatDateEAT = (input) => {
  const utc = input instanceof Date ? input : new Date(input);
  const p = eatParts(utc);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

// ------------------------------------------------------------
// formatDateTimeEAT(input)
// UTC Date/string → "YYYY-MM-DD HH:MM" (24h) in EAT.
// ------------------------------------------------------------
const formatDateTimeEAT = (input) => {
  const utc = input instanceof Date ? input : new Date(input);
  const p = eatParts(utc);
  return (
    `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ` +
    `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  );
};

module.exports = {
  getTodayRangeEAT,
  formatDateEAT,
  formatDateTimeEAT,
};