/**
 * Build version string: R/C + mmddyyhhmm + A|P (e.g. C0225261030A = Cursor, Feb 25 2026, 10:30 AM EST).
 * A = AM, P = PM. Set automatically at build time so each build reflects when it was built.
 */

function getVersionSource(): "R" | "C" {
  if (typeof __VERSION_SOURCE__ !== "undefined") {
    const s = String(__VERSION_SOURCE__).toUpperCase();
    return s === "R" ? "R" : "C";
  }
  return "C";
}

function getBuildLabel(): string {
  if (typeof __BUILD_VERSION_LABEL__ !== "undefined") {
    return String(__BUILD_VERSION_LABEL__);
  }
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPart["type"]) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const yy = get("year");
  const hh = get("hour").padStart(2, "0");
  const min = get("minute");
  const hour24 = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
  const ampm = hour24 >= 12 ? "P" : "A";
  return `${mm}${dd}${yy}${hh}${min}${ampm}`;
}

export function getAppVersion(): string {
  const source = getVersionSource();
  const label = getBuildLabel();
  return `${source}${label}`; // e.g. C0225261030A or R0225260230P
}
