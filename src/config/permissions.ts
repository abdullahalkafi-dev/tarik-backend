/**
 * Staff permissions. A staff account stores a list of these strings
 * (or "*" for everything). Super Admins always pass every check.
 */
export const PERMISSIONS = [
  "stats.view",
  "helpers.view",
  "helpers.review", // approve / reject / ban / unban helper applications
  "users.view",
  "users.manage", // block / unblock customers
  "jobs.view",
  "jobs.manage", // cancel / force-complete bookings
  "payments.view",
  "settings.manage", // commission, minimum amount, legal text
  "support.manage",
  "reviews.manage",
  "categories.manage",
  "map.view",
  "notifications.manage",
] as const;

export type TPermission = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, { label: string; permissions: string[] }> = {
  support: {
    label: "Support agent",
    permissions: [
      "stats.view",
      "helpers.view",
      "users.view",
      "jobs.view",
      "support.manage",
      "reviews.manage",
    ],
  },
  compliance: {
    label: "Compliance (KYC & safety)",
    permissions: [
      "stats.view",
      "helpers.view",
      "helpers.review",
      "users.view",
      "users.manage",
      "jobs.view",
      "map.view",
      "reviews.manage",
    ],
  },
  finance: {
    label: "Finance",
    permissions: [
      "stats.view",
      "helpers.view",
      "users.view",
      "jobs.view",
      "jobs.manage",
      "payments.view",
      "settings.manage",
    ],
  },
  admin: {
    label: "Administrator (full access)",
    permissions: ["*"],
  },
};

export const isValidPermission = (p: string): boolean =>
  p === "*" || (PERMISSIONS as readonly string[]).includes(p);
