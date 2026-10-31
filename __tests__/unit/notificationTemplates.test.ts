import { hasTemplate, normalizeLocale, renderTemplate } from "../../src/util/notificationTemplates";

describe("notification templates (I18N-02)", () => {
  it("renders in all four languages with parameters", () => {
    for (const locale of ["ar", "fr", "en", "es"]) {
      const t = renderTemplate("job.new_nearby", locale, { title: "Menage", budget: 300 });
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.body).toContain("Menage");
      expect(t.body).toContain("300");
    }
  });
  it("falls back to French for unknown locales", () => {
    expect(normalizeLocale("de")).toBe("fr");
    expect(normalizeLocale(undefined)).toBe("fr");
    expect(normalizeLocale("AR-MA")).toBe("ar");
  });
  it("Arabic texts are Arabic and unknown keys do not crash", () => {
    expect(renderTemplate("job.accepted", "ar", { title: "x" }).title).toMatch(/[؀-ۿ]/);
    expect(renderTemplate("does.not.exist", "en").body).toBe("");
    expect(hasTemplate("job.accepted")).toBe(true);
  });
  it("every template exists in every language and leaves no placeholder behind", () => {
    const keys = [
      "job.new_nearby", "job.accepted", "job.on_the_way", "job.arrived", "job.finished_confirm", "job.completed_client",
      "job.completed_helper", "job.auto_completed", "job.cancelled", "job.expired", "job.cash_received",
      "job.dispute_opened", "job.reminder_soon", "commission.deducted", "commission.refunded", "commission.refund_failed",
      "offer.new", "offer.updated", "offer.accepted", "offer.rejected", "offer.cancelled", "offer.expired",
      "review.new", "helper.approved", "helper.rejected", "helper.revoked", "helper.banned", "account.blocked",
      "account.unblocked", "kyc.in_review", "kyc.declined", "kyc.profile_incomplete", "support.reply",
      "support.status_resolved", "support.status_in_progress", "support.status_open",
    ];
    const params = {
      title: "T", reason: "R", name: "N", amount: 1, hours: 2, price: 3, preview: "P",
      code: "C", rating: 5, time: "10:00", budget: 9, what: "W",
    };
    for (const key of keys) {
      expect(hasTemplate(key)).toBe(true);
      for (const l of ["ar", "fr", "en", "es"]) {
        const t = renderTemplate(key, l, params);
        expect(t.title.length + t.body.length).toBeGreaterThan(0);
        expect(`${t.title}${t.body}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
