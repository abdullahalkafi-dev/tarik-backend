import { Auth } from "../module/auth/auth.model";
import { User } from "../module/user/user.model";
import { AuthProvider, AuthRole, AuthStatus } from "../module/auth/auth.interface";
import { logger } from "../logger/logger";
import config from "../config";

export const runSeed = async (): Promise<void> => {
  const email = config.admin_seed_email;
  const password = config.admin_seed_password;

  if (!email || !password) {
    logger.info("Admin seed skipped: no credentials configured");
    return;
  }

  try {
    const existingAuth = await Auth.findOne({ email });
    if (existingAuth) {
      logger.info(`Admin seed skipped: ${email} already exists`);
      return;
    }

    const auth = await Auth.create({
      email,
      password,
      loginProvider: AuthProvider.EMAIL,
      role: AuthRole.SUPER_ADMIN,
      status: AuthStatus.ACTIVE,
      isEmailVerified: true,
      isSuperAdmin: true,
    });

    await User.create({
      auth: auth._id,
      name: "Admin",
      email,
    });

    logger.info(`Admin seeded successfully: ${email}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Admin seed failed", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    } else {
      logger.error("Admin seed failed", { error: String(error) });
    }
  }
};
