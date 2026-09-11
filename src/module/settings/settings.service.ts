import { PlatformSettings } from "./settings.model";
import { TPlatformSettings } from "./settings.interface";

const getSettings = async (): Promise<TPlatformSettings> => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({
      platformName: "3awniNet",
      supportEmail: "support@3awninet.ma",
      contactPhone: "+212 522 00 00 00",
      platformFeePercentage: 20,
      minimumServiceAmount: 30,
      notifications: {
        newUserRegistrations: true,
        successfulPayments: true,
        customerServiceTickets: true,
      },
      legal: {
        termsOfService:
          "Terms of Service — update from Admin → Settings → Legal.",
        privacyPolicy:
          "Privacy Policy — update from Admin → Settings → Legal.",
      },
    });
  }
  // Backfill new notification/legal fields on older docs
  let dirty = false;
  if (!settings.legal) {
    settings.legal = {
      termsOfService:
        "Terms of Service — update from Admin → Settings → Legal.",
      privacyPolicy:
        "Privacy Policy — update from Admin → Settings → Legal.",
    } as any;
    dirty = true;
  }
  if (!settings.notifications) {
    settings.notifications = {
      newUserRegistrations: true,
      successfulPayments: true,
      customerServiceTickets: true,
    } as any;
    dirty = true;
  } else {
    const n = settings.notifications as any;
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

const updateSettings = async (
  payload: Partial<TPlatformSettings>
): Promise<TPlatformSettings> => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create(payload);
  } else {
    Object.assign(settings, payload);
    if (payload.notifications) {
      settings.notifications = {
        ...settings.notifications,
        ...payload.notifications,
      } as any;
    }
    if (payload.legal) {
      settings.legal = {
        ...(settings.legal as any),
        ...payload.legal,
      } as any;
    }
    await settings.save();
  }
  return settings;
};

export const SettingsService = {
  getSettings,
  updateSettings,
};
