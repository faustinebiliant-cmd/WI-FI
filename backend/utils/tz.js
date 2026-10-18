// ============================================================
// OSWAGOTech WiFi - Timezone Helper (EAT)
// ------------------------------------------------------------
// EAT = Africa/Dar_es_Salaam = UTC+3, no DST.
//
// Supabase stores all timestamptz columns in UTC. Business
// logic ("today", "yesterday", "this day") is computed in
// EAT, then the DB query uses the resulting UTC range.
//
// Only the exports the WiFi project actually uses are here.
// Reporting helpers (weeks, months, custom ranges, Excel) are
// added later when the WiFi project needs them.
// ============================================================

const TZ = 'Africa/Dar_es_Salaam';
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
// getYesterdayRangeEAT()
// ------------------------------------------------------------
const getYesterdayRangeEAT = (referenceDate = new Date()) => {
  const today = getTodayRangeEAT(referenceDate);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return {
    start: new Date(today.start.getTime() - oneDayMs),
    end:   new Date(today.end.getTime()   - oneDayMs),
  };
};

// ------------------------------------------------------------
// getDayRangeEAT('YYYY-MM-DD')
// A specific EAT calendar day as a UTC { start, end }.
// ------------------------------------------------------------
const getDayRangeEAT = (yyyyMmDd) => {
  if (typeof yyyyMmDd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    throw new Error('getDayRangeEAT expects a date string like "2025-01-31"');
  }
  const [y, m, d] = yyyyMmDd.split('-').map((n) => parseInt(n, 10));
  return {
    start: eatToUTC(y, m - 1, d, 0, 0, 0, 0),
    end:   eatToUTC(y, m - 1, d, 23, 59, 59, 999),
  };
};

// ------------------------------------------------------------
// nowEAT()
// Returns the current time as a Date (same instant as now()).
// Included for symmetry; use Date for actual logic.
// ------------------------------------------------------------
const nowEAT = () => new Date();

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

// ------------------------------------------------------------
// formatTimeEAT(input)
// UTC Date/string → "HH:MM" (24h) in EAT.
// ------------------------------------------------------------
const formatTimeEAT = (input) => {
  const utc = input instanceof Date ? input : new Date(input);
  const p = eatParts(utc);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

module.exports = {
  TZ,
  EAT_OFFSET_MS,
  getTodayRangeEAT,
  getYesterdayRangeEAT,
  getDayRangeEAT,
  nowEAT,
  formatDateEAT,
  formatDateTimeEAT,
  formatTimeEAT,
};