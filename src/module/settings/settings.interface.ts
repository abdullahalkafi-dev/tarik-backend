export interface TNotificationSettings {
  newUserRegistrations: boolean;
  successfulPayments: boolean;
  customerServiceTickets: boolean;
}

export interface TLegalSettings {
  termsOfService: string;
  privacyPolicy: string;
}

export interface TPlatformSettings {
  platformName: string;
  supportEmail: string;
  contactPhone: string;
  platformFeePercentage: number;
  minimumServiceAmount: number;
  notifications: TNotificationSettings;
  legal: TLegalSettings;
  createdAt?: Date;
  updatedAt?: Date;
}
