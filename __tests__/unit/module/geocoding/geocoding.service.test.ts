import { GeocodingService } from "module/geocoding/geocoding.service";

describe("GeocodingService (HERE Map v7)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("reverseGeocode", () => {
    it("should correctly map HERE revgeocode response to standard ReverseGeocodeResult", async () => {
      const mockHereResponse = {
        items: [
          {
            title: "Avenue Hassan II, Casablanca, Morocco",
            id: "here:pds:place:123",
            resultType: "place",
            address: {
              label: "Avenue Hassan II, 20000 Casablanca, Morocco",
              countryCode: "MAR",
              countryName: "Morocco",
              state: "Casablanca-Settat",
              county: "Casablanca",
              city: "Casablanca",
              district: "Sidi Belyout",
              postalCode: "20000",
            },
            position: {
              lat: 33.5731,
              lng: -7.5898,
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHereResponse,
      } as any);

      const result = await GeocodingService.reverseGeocode(33.5731, -7.5898);

      expect(result).toEqual({
        address: "Avenue Hassan II, 20000 Casablanca, Morocco",
        city: "Casablanca",
        postcode: "20000",
        state: "Casablanca-Settat",
        country: "Morocco",
        lat: 33.5731,
        lon: -7.5898,
      });
    });

    it("tells the app when the geocoder is down instead of returning an empty address (FH-05)", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      await expect(GeocodingService.reverseGeocode(33.57, -7.58)).rejects.toMatchObject({
        statusCode: 502,
        code: "GEOCODER_UNAVAILABLE",
      });
    });

    it("refuses coordinates outside the service area (GE-03)", async () => {
      global.fetch = jest.fn();
      await expect(GeocodingService.reverseGeocode(0, 0)).rejects.toMatchObject({
        statusCode: 422,
        code: "OUTSIDE_SERVICE_AREA",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("forwardGeocode", () => {
    it("should correctly map HERE geocode response to ForwardGeocodeResult array", async () => {
      const mockHereResponse = {
        items: [
          {
            title: "Casablanca, Morocco",
            id: "here:cm:namedplace:24228332",
            resultType: "locality",
            address: {
              label: "Casablanca, Casablanca-Settat, Morocco",
              countryCode: "MAR",
              countryName: "Morocco",
              state: "Casablanca-Settat",
              county: "Casablanca",
              city: "Casablanca",
              postalCode: "20000",
            },
            position: {
              lat: 33.5731,
              lng: -7.5898,
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHereResponse,
      } as any);

      const results = await GeocodingService.forwardGeocode("Casablanca", 5);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        displayName: "Casablanca, Casablanca-Settat, Morocco",
        lat: 33.5731,
        lon: -7.5898,
        city: "Casablanca",
        postcode: "20000",
        state: "Casablanca-Settat",
        country: "Morocco",
      });
    });

    it("reports an API failure as an error the app can show", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
      } as any);

      await expect(GeocodingService.forwardGeocode("Invalid Query", 5)).rejects.toMatchObject({
        statusCode: 502,
        code: "GEOCODER_UNAVAILABLE",
      });
    });

    it("drops results outside Morocco", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { title: "London", address: { label: "London, UK" }, position: { lat: 51.5, lng: -0.12 } },
            { title: "Fes", address: { label: "Fes, Morocco", city: "Fes" }, position: { lat: 34.03, lng: -5.0 } },
          ],
        }),
      } as any);

      const results = await GeocodingService.forwardGeocode("city", 5);
      expect(results.map((r) => r.displayName)).toEqual(["Fes, Morocco"]);
    });
  });
});
