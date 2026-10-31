import {
  approximateAddress,
  approximateCoordinates,
  haversineKm,
  isCoordinateInAllowedRegion,
  roundKm,
} from "../../src/util/geo";

describe("haversineKm", () => {
  it("Casablanca to Rabat is about 87 km", () => {
    const km = haversineKm(33.5731, -7.5898, 34.0209, -6.8416);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(95);
  });
  it("same point is zero", () => {
    expect(haversineKm(33.5, -7.5, 33.5, -7.5)).toBe(0);
  });
  it("rounds to one decimal", () => {
    expect(roundKm(2.449)).toBe(2.4);
  });
});

describe("isCoordinateInAllowedRegion (Morocco only by default)", () => {
  it("accepts Moroccan cities", () => {
    expect(isCoordinateInAllowedRegion(33.5731, -7.5898)).toBe(true); // Casablanca
    expect(isCoordinateInAllowedRegion(31.6295, -7.9811)).toBe(true); // Marrakech
    expect(isCoordinateInAllowedRegion(27.1536, -13.2033)).toBe(true); // Laayoune
  });
  it("rejects other countries and junk", () => {
    expect(isCoordinateInAllowedRegion(51.5074, -0.1278)).toBe(false); // London
    expect(isCoordinateInAllowedRegion(23.8103, 90.4125)).toBe(false); // Dhaka
    expect(isCoordinateInAllowedRegion(0, 0)).toBe(false);
    expect(isCoordinateInAllowedRegion(NaN, 1)).toBe(false);
  });
});

describe("approximateCoordinates / approximateAddress (privacy)", () => {
  it("blurs by 300-500 m, always the same for the same job", () => {
    const exact: [number, number] = [-7.6, 33.58];
    const a = approximateCoordinates(exact, "job-1");
    const b = approximateCoordinates(exact, "job-1");
    const c = approximateCoordinates(exact, "job-2");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const km = haversineKm(exact[1], exact[0], a[1], a[0]);
    expect(km).toBeGreaterThan(0.25);
    expect(km).toBeLessThan(0.55);
  });
  it("drops the street from an address", () => {
    expect(approximateAddress("12 Rue Ibn Tofail, Maarif, Casablanca, Morocco")).toBe("Maarif, Casablanca");
    expect(approximateAddress("Maarif, Casablanca")).toBe("Maarif, Casablanca");
    expect(approximateAddress(undefined)).toBe("");
  });
});
