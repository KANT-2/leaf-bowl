/** Shared by the server, React UI and standalone preview. Instants are UTC; calendars are KST. */
(function (root) {
  const DAY = 86400000;
  const OFFSET = 9 * 3600000;

  function normalizeUTC(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return null;
    const wall = new Date(match[1] + "Z");
    const instant = new Date(value);
    // Date.parse rolls impossible calendar days into the next month: reject them.
    if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 19) !== match[1] || !Number.isFinite(instant.getTime())) return null;
    return instant.toISOString();
  }

  function kstDate(ms, days = 0) {
    return new Date(ms + OFFSET + days * DAY).toISOString().slice(0, 10);
  }

  function kstDateTime(ms) {
    const iso = new Date(ms + OFFSET).toISOString();
    return iso.slice(0, 10).replaceAll("-", ".") + " " + iso.slice(11, 16);
  }

  /** Legacy wall-clock strings have a KST calendar, never the machine's local zone. */
  function legacyKSTUTC(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})[.-](\d{2})[.-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?$/.exec(value);
    if (!match) return null;
    return normalizeUTC(`${match[1]}-${match[2]}-${match[3]}T${match[4] ?? "12"}:${match[5] ?? "00"}:${match[6] ?? "00"}${match[7] ?? ""}+09:00`);
  }

  function kstSlotStart(day, time) {
    return normalizeUTC(`${day}T${time}:00+09:00`);
  }

  function isAtLeast30MinAhead(day, time, now = Date.now()) {
    const start = kstSlotStart(day, time);
    return start !== null && Date.parse(start) > now + 30 * 60000;
  }

  function reviewDateTime(review) {
    const instant = normalizeUTC(review.createdAt);
    return instant ? kstDateTime(Date.parse(instant)) : review.date;
  }

  const api = { normalizeUTC, kstDate, kstDateTime, legacyKSTUTC, kstSlotStart, isAtLeast30MinAhead, reviewDateTime };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LeafBowlTime = api;
})(globalThis);
