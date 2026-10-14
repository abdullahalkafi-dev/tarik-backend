import { Auth } from "../module/auth/auth.model";
import { User } from "../module/user/user.model";
import { Category } from "../module/category/category.model";
import { AuthProvider, AuthRole, AuthStatus } from "../module/auth/auth.interface";
import { HelperApplicationStatus } from "../module/user/user.interface";
import { logger } from "../logger/logger";
import config from "../config";

// Official production categories matching https://tarikappapi.joura.info/api/v1/categories
export const PRD_CATEGORIES = [
  { name: "Home Cleaning", icon: "cleaning_icon.svg" },
  { name: "Furniture Assembly & DIY", icon: "furniture_assembly_icon.svg" },
  { name: "Gardening & Plant Care", icon: "garden_icon.svg" },
  { name: "Tech Support & Devices", icon: "tech_support_icon.svg" },
  { name: "Tutoring & Education", icon: "tutoring_icon.svg" },
  { name: "Pet Care & Walking", icon: "pet_care_icon.svg" },
  { name: "Tailoring & Alterations", icon: "tailoring_icon.svg" },
  { name: "Event & Hospitality", icon: "event_helper_icon.svg" },
];

export const seedCategories = async (): Promise<Map<string, any>> => {
  logger.info("📦 [SEED CATEGORIES] Starting category sync with official PRD categories...");
  const categoryMap = new Map<string, any>();

  for (const cat of PRD_CATEGORIES) {
    let existing = await Category.findOne({ name: cat.name });
    if (!existing) {
      existing = await Category.create({
        name: cat.name,
        icon: cat.icon,
        isActive: true,
      });
      logger.info(`  ✅ Created category: "${cat.name}" | ID: ${existing._id}`);
    } else {
      logger.info(`  ℹ️ Found existing category: "${cat.name}" | ID: ${existing._id}`);
    }
    categoryMap.set(cat.name, existing);
  }

  // Also index any existing categories in the DB so helpers can find them
  const allDbCategories = await Category.find({ isActive: true });
  for (const c of allDbCategories) {
    categoryMap.set(c.name, c);
  }

  try {
    const cacheService = (await import("../redis/cacheService")).default;
    const { buildCachePattern } = await import("../redis/cache.utils");
    await cacheService.invalidateByPattern(buildCachePattern("categories", "*"));
    logger.info("  🧹 Cleared Redis category cache");
  } catch (_) {
    // Redis optional in local dev
  }

  return categoryMap;
};

export const seedAdmin = async (): Promise<void> => {
  const email = config.admin_seed_email;
  const password = config.admin_seed_password;

  if (!email || !password) {
    logger.info("👑 [SEED ADMIN] Admin seed skipped: no credentials configured");
    return;
  }

  try {
    const existingAuth = await Auth.findOne({ email });
    if (existingAuth) {
      logger.info(`👑 [SEED ADMIN] Admin account already exists: ${email}`);
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

    logger.info(`👑 [SEED ADMIN] Admin seeded successfully: ${email} | ID: ${auth._id}`);
  } catch (error) {
    logger.error("Admin seed failed", { error: String(error) });
  }
};

export const seedHelpersAndUsers = async (categoryMap: Map<string, any>): Promise<void> => {
  const defaultPassword = "Test@1234";

  logger.info("\n=======================================================");
  logger.info("👷 [SEED HELPERS] Seeding 3 Approved Helper Accounts...");
  logger.info("=======================================================");

  // Resolve category ObjectIds from real PRD categories
  const cleaningCategory = categoryMap.get("Home Cleaning") || categoryMap.get("Cleaning");
  const furnitureCategory = categoryMap.get("Furniture Assembly & DIY") || categoryMap.get("Carrying");
  const techCategory = categoryMap.get("Tech Support & Devices") || categoryMap.get("Electrician");

  const helperDefs = [
    {
      phone: "+212612345671",
      email: "karim.cleaning@tarik.test",
      name: "Karim Bennani",
      category: cleaningCategory,
      categoryName: cleaningCategory?.name || "Home Cleaning",
      age: 29,
      city: "London",
      language: "English",
      pricePerHour: 120,
      experience: 6,
      serviceRadius: 40,
      bio: "Professional home and office cleaning specialist with 6+ years of experience. Providing deep sanitization, eco-friendly cleaning, and move-in/out services across London.",
      coordinates: [-0.1419, 51.5014], // Westminster, London
      address: "Westminster, London, UK",
      rating: 4.9,
      reviewCount: 24,
    },
    {
      phone: "+212612345672",
      email: "youssef.diy@tarik.test",
      name: "Youssef Amrani",
      category: furnitureCategory,
      categoryName: furnitureCategory?.name || "Furniture Assembly & DIY",
      age: 34,
      city: "London",
      language: "English",
      pricePerHour: 140,
      experience: 8,
      serviceRadius: 40,
      bio: "Expert handyman and furniture assembly professional. Flat-pack assembly (IKEA, Wayfair), wall mounting, shelf installation, and general home repairs.",
      coordinates: [-0.1426, 51.539], // Camden, London
      address: "Camden, London, UK",
      rating: 4.8,
      reviewCount: 19,
    },
    {
      phone: "+212612345673",
      email: "amina.tech@tarik.test",
      name: "Amina Mansouri",
      category: techCategory,
      categoryName: techCategory?.name || "Tech Support & Devices",
      age: 27,
      city: "London",
      language: "English",
      pricePerHour: 110,
      experience: 5,
      serviceRadius: 40,
      bio: "Certified smart home & device setup specialist. Wi-Fi network configuration, smart TV mounting, security camera installation, and troubleshooting.",
      coordinates: [-0.1932, 51.5007], // Kensington, London
      address: "Kensington, London, UK",
      rating: 5.0,
      reviewCount: 32,
    },
  ];

  for (const h of helperDefs) {
    if (!h.category) {
      logger.error(`❌ [SEED ERROR] Category "${h.categoryName}" not found in database!`);
      continue;
    }

    let auth = await Auth.findOne({ phone: h.phone });

    if (!auth) {
      auth = await Auth.create({
        phone: h.phone,
        email: h.email,
        password: defaultPassword,
        loginProvider: AuthProvider.PHONE,
        role: AuthRole.HELPER,
        status: AuthStatus.ACTIVE,
        isPhoneVerified: true,
        isEmailVerified: true,
      });

      const user = await User.create({
        auth: auth._id,
        name: h.name,
        email: h.email,
        phone: h.phone,
        age: h.age,
        city: h.city,
        language: h.language,
        serviceType: h.category._id,
        pricePerHour: h.pricePerHour,
        experience: h.experience,
        serviceRadius: h.serviceRadius,
        bio: h.bio,
        location: {
          type: "Point",
          coordinates: h.coordinates,
        },
        address: h.address,
        isHelperFormSubmitted: true,
        helperApplicationStatus: HelperApplicationStatus.APPROVED,
        diditStatus: "Approved",
        diditDecisionReason: "Automated KYC Verification Passed",
        rating: h.rating,
        reviewCount: h.reviewCount,
        applicationHistory: [
          {
            appliedAt: new Date(),
            status: HelperApplicationStatus.APPROVED,
            reviewedAt: new Date(),
          },
        ],
      });

      logger.info(`  ✅ [CREATED HELPER] ${h.name}`);
      logger.info(`     • Phone: ${h.phone} (login with digits after +212)`);
      logger.info(`     • Email: ${h.email} | Pass: ${defaultPassword}`);
      logger.info(`     • Category: "${h.categoryName}" (ID: ${h.category._id})`);
      logger.info(`     • Location: ${h.address} [${h.coordinates.join(", ")}]`);
      logger.info(`     • Status: approved | Role: helper | UserId: ${user._id}`);
    } else {
      // Ensure category, role, and approval are active
      await Auth.updateOne(
        { _id: auth._id },
        {
          $set: {
            role: AuthRole.HELPER,
            status: AuthStatus.ACTIVE,
            isPhoneVerified: true,
            isEmailVerified: true,
          },
        },
      );

      const existingUser = await User.findOne({ auth: auth._id });
      if (existingUser) {
        await User.updateOne(
          { _id: existingUser._id },
          {
            $set: {
              serviceType: h.category._id,
              isHelperFormSubmitted: true,
              helperApplicationStatus: HelperApplicationStatus.APPROVED,
              diditStatus: "Approved",
              location: {
                type: "Point",
                coordinates: h.coordinates,
              },
              address: h.address,
              pricePerHour: h.pricePerHour,
              experience: h.experience,
              serviceRadius: h.serviceRadius,
              bio: h.bio,
            },
          },
        );
        logger.info(`  🔄 [UPDATED HELPER] ${h.name} (${h.phone}) linked to Category: "${h.categoryName}"`);
      }
    }
  }

  logger.info("\n=======================================================");
  logger.info("👤 [SEED CLIENTS] Seeding 2 Active Client Accounts...");
  logger.info("=======================================================");

  const userDefs = [
    {
      phone: "+212698765431",
      email: "omar.client@tarik.test",
      name: "Omar Tazi",
      coordinates: [-0.1365, 51.5136], // Soho, London
      address: "Soho, London, UK",
    },
    {
      phone: "+212698765432",
      email: "sara.client@tarik.test",
      name: "Sara El Fassi",
      coordinates: [-0.124, 51.5117], // Covent Garden, London
      address: "Covent Garden, London, UK",
    },
  ];

  for (const u of userDefs) {
    let auth = await Auth.findOne({ phone: u.phone });
    if (!auth) {
      auth = await Auth.create({
        phone: u.phone,
        email: u.email,
        password: defaultPassword,
        loginProvider: AuthProvider.PHONE,
        role: AuthRole.USER,
        status: AuthStatus.ACTIVE,
        isPhoneVerified: true,
        isEmailVerified: true,
      });

      const user = await User.create({
        auth: auth._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        location: {
          type: "Point",
          coordinates: u.coordinates,
        },
        address: u.address,
      });

      logger.info(`  ✅ [CREATED CLIENT] ${u.name}`);
      logger.info(`     • Phone: ${u.phone} (login with digits after +212)`);
      logger.info(`     • Email: ${u.email} | Pass: ${defaultPassword}`);
      logger.info(`     • Location: ${u.address} [${u.coordinates.join(", ")}] | UserId: ${user._id}`);
    } else {
      await User.updateOne(
        { auth: auth._id },
        {
          $set: {
            location: {
              type: "Point",
              coordinates: u.coordinates,
            },
            address: u.address,
          },
        },
      );
      logger.info(`  ℹ️ [CLIENT EXISTS] ${u.name} (${u.phone}) location verified at ${u.address}`);
    }
  }
};

export const runSeed = async (): Promise<void> => {
  try {
    logger.info("🌱 [SEED START] Executing complete Tarik seed routine...");
    await seedAdmin();
    const categoryMap = await seedCategories();
    await seedHelpersAndUsers(categoryMap);
    logger.info("🎉 [SEED COMPLETE] All seed routines finished successfully!\n");
  } catch (error) {
    logger.error("❌ [SEED FATAL ERROR] Seed execution failed:", error);
    throw error;
  }
};
