import { maskContactInfo } from "../../src/util/contactMask";

describe("maskContactInfo", () => {
  it("hides phone numbers in all common formats", () => {
    for (const t of ["call 0612345678", "+212 612 345 678 please", "06-12-34-56-78", "00212612345678"]) {
      const r = maskContactInfo(t);
      expect(r.masked).toBe(true);
      expect(r.text).not.toMatch(/\d{6}/);
    }
  });
  it("hides e-mail addresses and links", () => {
    expect(maskContactInfo("me: ali@example.com").masked).toBe(true);
    expect(maskContactInfo("https://wa.me/212612345678").masked).toBe(true);
    expect(maskContactInfo("www.example.com/x").masked).toBe(true);
  });
  it("leaves ordinary text and short numbers alone", () => {
    const r = maskContactInfo("I can come at 5 pm, it costs 150 MAD for 3 hours");
    expect(r.masked).toBe(false);
    expect(r.text).toBe("I can come at 5 pm, it costs 150 MAD for 3 hours");
  });
});
