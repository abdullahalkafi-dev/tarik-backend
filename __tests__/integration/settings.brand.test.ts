import { SettingsService } from "../../src/module/settings/settings.service";
import { PlatformSettings } from "../../src/module/settings/settings.model";

describe("platform settings carry the product name, not the client's", () => {
  it("a fresh install is called 3awniNet", async () => {
    const s: any = await SettingsService.getSettings();
    expect(s.platformName).toBe("3awniNet");
    expect(s.supportEmail).toBe("support@3awninet.ma");
  });

  it("a name saved by the owner is never rewritten on load", async () => {
    await SettingsService.getSettings();
    await PlatformSettings.updateOne({}, { $set: { platformName: "Tarik", supportEmail: "help@tarik.ma" } });
    const s: any = await SettingsService.getSettings();
    expect(s.platformName).toBe("Tarik");
    expect(s.supportEmail).toBe("help@tarik.ma");
  });

  it("the app config and the built-in legal texts use the configured name", async () => {
    await SettingsService.getSettings();
    await PlatformSettings.updateOne({}, { $set: { platformName: "3awniNet", supportEmail: "support@3awninet.ma" } });
    for (const lang of ["en", "fr", "ar", "es"]) {
      const cfg = await SettingsService.getPublicConfig(lang);
      expect(cfg.appName).toBe("3awniNet");
      expect(cfg.termsOfService).toContain("3awniNet");
      expect(cfg.privacyPolicy).toContain("support@3awninet.ma");
    }
  });
});
