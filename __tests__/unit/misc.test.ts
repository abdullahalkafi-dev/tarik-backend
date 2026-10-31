import { parseDurationMs } from "../../src/util/duration";
import { PERMISSIONS, ROLE_PRESETS, isValidPermission } from "../../src/config/permissions";
import { maskSensitive } from "../../src/logger/morgan";

describe("parseDurationMs", () => {
  it("parses the JWT style durations", () => {
    expect(parseDurationMs("30d", 1)).toBe(30 * 86_400_000);
    expect(parseDurationMs("15m", 1)).toBe(15 * 60_000);
    expect(parseDurationMs("2h", 1)).toBe(2 * 3_600_000);
    expect(parseDurationMs("garbage", 42)).toBe(42);
    expect(parseDurationMs(undefined, 7)).toBe(7);
  });
});

describe("staff permissions (AD-01)", () => {
  it("presets only use known permissions", () => {
    for (const preset of Object.values(ROLE_PRESETS)) {
      for (const p of preset.permissions) expect(isValidPermission(p)).toBe(true);
    }
  });
  it("support cannot change the commission or review KYC; finance can change settings", () => {
    expect(ROLE_PRESETS.support.permissions).not.toContain("settings.manage");
    expect(ROLE_PRESETS.support.permissions).not.toContain("helpers.review");
    expect(ROLE_PRESETS.finance.permissions).toContain("settings.manage");
    expect(ROLE_PRESETS.compliance.permissions).toContain("helpers.review");
    expect(ROLE_PRESETS.admin.permissions).toEqual(["*"]);
    expect(PERMISSIONS.length).toBeGreaterThan(8);
  });
});

describe("log masking (BE-12)", () => {
  it("masks passwords, codes and tokens at any depth", () => {
    const masked = maskSensitive({
      phone: "+212612345678",
      password: "secret123",
      nested: { otp: "123456", resetToken: "abc", refreshToken: "xyz", note: "ok" },
    }) as any;
    expect(masked.password).toBe("***");
    expect(masked.nested.otp).toBe("***");
    expect(masked.nested.resetToken).toBe("***");
    expect(masked.nested.refreshToken).toBe("***");
    expect(masked.nested.note).toBe("ok");
    expect(masked.phone).toBe("+212612345678");
  });
});
