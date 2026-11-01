import { defaultLegalText } from "../../src/module/settings/legalDefaults";

describe("built-in legal texts", () => {
  it("exist in all four languages for both documents, with the app name and email filled in", () => {
    for (const kind of ["termsOfService", "privacyPolicy"] as const) {
      for (const lang of ["en", "fr", "ar", "es"]) {
        const text = defaultLegalText(kind, lang, { app: "3awniNet", email: "help@3awninet.ma" });
        expect(text.length).toBeGreaterThan(800);
        expect(text).toContain("3awniNet");
        expect(text).toContain("help@3awninet.ma");
        expect(text).not.toMatch(/\{app\}|\{email\}/);
      }
    }
  });

  it("falls back to English for an unknown language", () => {
    expect(defaultLegalText("termsOfService", "de", {})).toBe(defaultLegalText("termsOfService", "en", {}));
  });
});
