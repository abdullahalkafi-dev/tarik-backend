export interface TNotificationSettings {
  newUserRegistrations: boolean;
  successfulPayments: boolean;
  customerServiceTickets: boolean;
}

export type TLocalizedText = {
  en?: string;
  fr?: string;
  ar?: string;
  es?: string;
};

export interface TLegalSettings {
  /** Fallback text (used when a language has no translation). */
  termsOfService: string;
  privacyPolicy: string;
  /** Per-language versions. */
  translations?: {
    termsOfService?: TLocalizedText;
    privacyPolicy?: TLocalizedText;
  };
  /** Bumped by the API every time legal text changes; users accept a version. */
  version: number;
  effectiveDate?: Date;
}

export interface TPlatformSettings {
  platformName: string;
  supportEmail: string;
  contactPhone: string;
  supportWhatsapp?: string;
  platformFeePercentage: number;
  minimumServiceAmount: number;
  /** Oldest app build allowed to run; older builds are asked to update. */
  minAppVersion?: string;
  notifications: TNotificationSettings;
  legal: TLegalSettings;
  createdAt?: Date;
  updatedAt?: Date;
}
