import {
  calcHourlyTotalMAD,
  parseHoursBetween,
  validateTimeRange,
} from "../../src/util/hourly";

describe("validateTimeRange", () => {
  it("allows both times missing", () => {
    expect(validateTimeRange(undefined, undefined)).toBeNull();
    expect(validateTimeRange("", "")).toBeNull();
  });

  it("requires both when one is set", () => {
    expect(validateTimeRange("9:00 AM", "")).toMatch(/Both/);
    expect(validateTimeRange(undefined, "17:00")).toMatch(/Both/);
  });

  it("rejects zero-duration bookings", () => {
    expect(validateTimeRange("10:00 AM", "10:00 AM")).toMatch(/after start/);
  });

  it("rejects end before start", () => {
    expect(validateTimeRange("5:00 PM", "9:00 AM")).toMatch(/after start/);
  });

  it("rejects slots shorter than the minimum", () => {
    expect(validateTimeRange("10:00", "10:15")).toMatch(/at least 30/);
  });

  it("accepts a valid range in either format", () => {
    expect(validateTimeRange("9:00 AM", "11:30 AM")).toBeNull();
    expect(validateTimeRange("09:00", "17:00")).toBeNull();
  });
});

describe("parseHoursBetween", () => {
  it("no longer turns equal times into a 24h job", () => {
    expect(parseHoursBetween("10:00 AM", "10:00 AM")).toBeNull();
    expect(calcHourlyTotalMAD(100, "10:00 AM", "10:00 AM")).toBe(100);
  });

  it("computes normal ranges", () => {
    expect(parseHoursBetween("9:00 AM", "11:30 AM")).toBe(2.5);
    expect(calcHourlyTotalMAD(80, "9:00 AM", "11:30 AM")).toBe(200);
  });
});
