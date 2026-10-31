import { PlatformSettings, SettingsHistory } from "./settings.model";
import { TPlatformSettings } from "./settings.interface";

const LEGACY_DEFAULTS = {
  platformName: "3awniNet",
  supportEmail: "support@3awninet.ma",
  contactPhone: "+212 522 00 00 00",
};

const getSettings = async (): Promise<TPlatformSettings> => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({
      platformName: "Tarik",
      supportEmail: "support@tarik.ma",
      contactPhone: "",
      platformFeePercentage: 20,
      minimumServiceAmount: 30,
      notifications: {
        newUserRegistrations: true,
        successfulPayments: true,
        customerServiceTickets: true,
      },
      legal: {
        termsOfService: "Terms of Service — update from Admin → Settings → Legal.",
        privacyPolicy: "Privacy Policy — update from Admin → Settings → Legal.",
        version: 1,
      },
    });
  }

  // Backfill new fields on older documents and retire the old placeholder brand.
  let dirty = false;
  const s = settings as any;
  if (s.platformName === LEGACY_DEFAULTS.platformName) {
    s.platformName = "Tarik";
    dirty = true;
  }
  if (s.supportEmail === LEGACY_DEFAULTS.supportEmail) {
    s.supportEmail = "support@tarik.ma";
    dirty = true;
  }
  if (s.contactPhone === LEGACY_DEFAULTS.contactPhone) {
    s.contactPhone = "";
    dirty = true;
  }
  if (!s.legal) {
    s.legal = {
      termsOfService: "Terms of Service — update from Admin → Settings → Legal.",
      privacyPolicy: "Privacy Policy — update from Admin → Settings → Legal.",
      version: 1,
    };
    dirty = true;
  } else if (!s.legal.version) {
    s.legal.version = 1;
    dirty = true;
  }
  if (!s.notifications) {
    s.notifications = {
      newUserRegistrations: true,
      successfulPayments: true,
      customerServiceTickets: true,
    };
    dirty = true;
  } else {
    const n = s.notifications;
    if (n.successfulPayments === undefined) {
      n.successfulPayments = n.paymentIssues !== false;
      dirty = true;
    }
    if (n.customerServiceTickets === undefined) {
      n.customerServiceTickets = n.serviceCompletions !== false;
      dirty = true;
    }
  }
  if (dirty) {
    await settings.save();
  }
  return settings;
};

/** Commission percentage that applies right now (0–50). */
const getFeePercentage = async (): Promise<number> => {
  const s = await getSettings();
  const fee = Number(s.platformFeePercentage);
  return Number.isFinite(fee) && fee >= 0 && fee <= 50 ? fee : 20;
};

const flatten = (obj: any, prefix = ""): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
};

const updateSettings = async (
  payload: Partial<TPlatformSettings>,
  actor?: { userId?: string; name?: string },
): Promise<TPlatformSettings> => {
  const settings = await getSettings();
  const before = flatten((settings as any).toObject());

  const p: any = payload;
  const s: any = settings;

  for (const key of [
    "platformName",
    "supportEmail",
    "contactPhone",
    "supportWhatsapp",
    "platformFeePercentage",
    "minimumServiceAmount",
    "minAppVersion",
  ]) {
    if (p[key] !== undefined) s[key] = p[key];
  }

  if (p.notifications) {
    s.notifications = { ...(s.notifications?.toObject?.() ?? s.notifications), ...p.notifications };
  }

  if (p.legal) {
    const current = s.legal?.toObject?.() ?? s.legal ?? {};
    const next = { ...current };
    let legalChanged = false;
    for (const key of ["termsOfService", "privacyPolicy"] as const) {
      if (p.legal[key] !== undefined && p.legal[key] !== current[key]) {
        next[key] = p.legal[key];
        legalChanged = true;
      }
    }
    if (p.legal.translations) {
      next.translations = {
        termsOfService: {
          ...(current.translations?.termsOfService || {}),
          ...(p.legal.translations.termsOfService || {}),
        },
        privacyPolicy: {
          ...(current.translations?.privacyPolicy || {}),
          ...(p.legal.translations.privacyPolicy || {}),
        },
      };
      if (JSON.stringify(next.translations) !== JSON.stringify(current.translations || {})) {
        legalChanged = true;
      }
    }
    if (legalChanged) {
      next.version = (Number(current.version) || 1) + 1;
      next.effectiveDate = new Date();
    }
    s.legal = next;
  }

  await (settings as any).save();

  const after = flatten((settings as any).toObject());
  const shorten = (v: unknown) =>
    typeof v === "string" && v.length > 200 ? "[text]" : v;
  const changes = Object.keys({ ...before, ...after })
    .filter(
      (k) =>
        !["updatedAt", "createdAt", "__v", "_id"].includes(k) &&
        JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    )
    .map((field) => ({ field, oldValue: shorten(before[field]), newValue: shorten(after[field]) }));

  if (changes.length) {
    await SettingsHistory.create({
      changedBy: actor?.userId,
      changedByName: actor?.name,
      changes,
    }).catch(() => undefined);
  }

  return settings;
};

const getHistory = async (limit = 50) =>
  SettingsHistory.find().sort({ createdAt: -1 }).limit(Math.min(limit, 200)).lean();

const pickLegalText = (
  settings: any,
  kind: "termsOfService" | "privacyPolicy",
  lang: string,
) => {
  const hidden = (v?: string) => !v || /update from Admin/i.test(v);
  const localized = settings.legal?.translations?.[kind]?.[lang];
  const text = !hidden(localized) ? localized : settings.legal?.[kind];
  return hidden(text) ? "" : text;
};

/** Public values the mobile app may need (no secrets). */
const getPublicConfig = async (lang = "en") => {
  const s: any = await getSettings();
  const language = ["ar", "fr", "en", "es"].includes(lang) ? lang : "en";
  return {
    appName: s.platformName,
    supportEmail: s.supportEmail,
    supportPhone: s.contactPhone,
    supportWhatsapp: s.supportWhatsapp || "",
    platformFeePercentage: s.platformFeePercentage,
    minimumServiceAmount: s.minimumServiceAmount,
    minAppVersion: s.minAppVersion || "",
    legalVersion: s.legal?.version || 1,
    termsOfService: pickLegalText(s, "termsOfService", language),
    privacyPolicy: pickLegalText(s, "privacyPolicy", language),
  };
};

export const SettingsService = {
  getSettings,
  getFeePercentage,
  updateSettings,
  getHistory,
  getPublicConfig,
};
