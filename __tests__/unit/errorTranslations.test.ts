import { checkInputMessage, errorLocaleFromHeader, translateErrorMessage } from "../../src/errors/errorTranslations";

describe("error translations", () => {
  it("reads the language from Accept-Language and falls back to English", () => {
    expect(errorLocaleFromHeader("ar-MA,ar;q=0.9")).toBe("ar");
    expect(errorLocaleFromHeader("es")).toBe("es");
    expect(errorLocaleFromHeader("fr-FR")).toBe("fr");
    expect(errorLocaleFromHeader("de")).toBe("en");
    expect(errorLocaleFromHeader(undefined)).toBe("en");
  });

  it("translates a known message and leaves unknown ones in English", () => {
    expect(translateErrorMessage("Job not found", "fr")).toBe("Mission introuvable.");
    expect(translateErrorMessage("Job not found", "en")).toBe("Job not found");
    expect(translateErrorMessage("Something unlisted", "es")).toBe("Something unlisted");
  });

  it("has a generic form message for every non-English language", () => {
    expect(checkInputMessage("en")).toBeNull();
    for (const l of ["fr", "ar", "es"] as const) expect(checkInputMessage(l)).toBeTruthy();
  });
});
