import { buildSchedule, extractDateParts, parseClockMinutes, zonedToUtc } from "../../src/util/schedule";

describe("parseClockMinutes", () => {
  it("parses 12 and 24 hour clocks", () => {
    expect(parseClockMinutes("5:00 PM")).toBe(17 * 60);
    expect(parseClockMinutes("12:00 AM")).toBe(0);
    expect(parseClockMinutes("12:30 PM")).toBe(12 * 60 + 30);
    expect(parseClockMinutes("17:45")).toBe(17 * 60 + 45);
  });
  it("rejects garbage", () => {
    expect(parseClockMinutes("25:00")).toBeNull();
    expect(parseClockMinutes("abc")).toBeNull();
    expect(parseClockMinutes("")).toBeNull();
    expect(parseClockMinutes("13:00 PM")).toBeNull();
  });
});

describe("extractDateParts", () => {
  it("takes the calendar day the user picked", () => {
    expect(extractDateParts("2026-03-05")).toEqual({ year: 2026, month: 3, day: 5 });
    expect(extractDateParts("2026-03-05T23:30:00.000Z")).toEqual({ year: 2026, month: 3, day: 5 });
  });
  it("returns null for nonsense", () => {
    expect(extractDateParts("not a date")).toBeNull();
    expect(extractDateParts(undefined)).toBeNull();
  });
});

describe("zonedToUtc (Africa/Casablanca)", () => {
  it("is UTC+1 in a normal month", () => {
    expect(zonedToUtc(2026, 6, 10, 9 * 60).toISOString()).toBe("2026-06-10T08:00:00.000Z");
  });
  it("converts back to the same local clock time", () => {
    const utc = zonedToUtc(2026, 11, 3, 14 * 60 + 30);
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Casablanca",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(utc);
    expect(local).toBe("14:30");
  });
});

describe("buildSchedule", () => {
  it("builds start and end instants", () => {
    const s = buildSchedule("2026-06-10", "9:00 AM", "11:00 AM");
    expect(s.startAt?.toISOString()).toBe("2026-06-10T08:00:00.000Z");
    expect(s.endAt?.toISOString()).toBe("2026-06-10T10:00:00.000Z");
  });
  it("a shift that ends before it starts finishes the next day", () => {
    const s = buildSchedule("2026-06-10", "8:00 PM", "1:00 AM");
    expect(s.startAt?.toISOString()).toBe("2026-06-10T19:00:00.000Z");
    expect(s.endAt?.toISOString()).toBe("2026-06-11T00:00:00.000Z");
  });
  it("no start time: no instants", () => {
    expect(buildSchedule("2026-06-10", undefined, undefined)).toEqual({});
  });
});
