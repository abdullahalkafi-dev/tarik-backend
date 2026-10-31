import { commissionFor, computePricing, helperNetFor } from "../../src/util/pricing";

describe("computePricing", () => {
  it("fixed price: the typed number is the total", () => {
    expect(computePricing({ priceType: "fixed", amount: 250 })).toEqual({ total: 250 });
    expect(computePricing({ priceType: "fixed", amount: 99.6 }).total).toBe(100);
  });

  it("hourly price: total = rate x hours (FJ-01)", () => {
    const p = computePricing({ priceType: "hourly", amount: 100, startTime: "9:00 AM", endTime: "2:00 PM" });
    expect(p.total).toBe(500);
    expect(p.hourlyRate).toBe(100);
    expect(p.hours).toBe(5);
  });

  it("hourly price with half hours", () => {
    expect(computePricing({ priceType: "hourly", amount: 80, startTime: "9:00", endTime: "11:30" }).total).toBe(200);
  });

  it("hourly price across midnight", () => {
    const p = computePricing({ priceType: "hourly", amount: 60, startTime: "8:00 PM", endTime: "1:00 AM" });
    expect(p.hours).toBe(5);
    expect(p.total).toBe(300);
  });

  it("hourly price without times is refused (the total would be unknown)", () => {
    expect(() => computePricing({ priceType: "hourly", amount: 100 })).toThrow(/Start and end time/);
  });

  it("refuses non-positive amounts", () => {
    expect(() => computePricing({ priceType: "fixed", amount: 0 })).toThrow();
    expect(() => computePricing({ priceType: "fixed", amount: -5 })).toThrow();
    expect(() => computePricing({ priceType: "fixed", amount: NaN })).toThrow();
  });
});

describe("commission", () => {
  it("20% commission and the helper's net always add up to the total", () => {
    for (const total of [30, 99, 101, 333, 1000, 1234]) {
      expect(commissionFor(total, 20) + helperNetFor(total, 20)).toBe(total);
    }
  });

  it("0% fee leaves everything to the helper; 50% splits in half", () => {
    expect(commissionFor(200, 0)).toBe(0);
    expect(helperNetFor(200, 0)).toBe(200);
    expect(helperNetFor(200, 50)).toBe(100);
  });
});
