import mongoose from "mongoose";
import { Auth } from "../../src/module/auth/auth.model";
import { User } from "../../src/module/user/user.model";
import { Category } from "../../src/module/category/category.model";
import { Wallet } from "../../src/module/wallet/wallet.model";
import { WalletRepository } from "../../src/module/wallet/wallet.repository";
import { AuthRole, AuthStatus } from "../../src/module/auth/auth.interface";

let counter = 0;
const nextPhone = () => `+2126${String(10000000 + ++counter)}`;

export const CASABLANCA = { lat: 33.5731, lon: -7.5898 };

export const createCategory = async (name = "Home Cleaning", extra: Record<string, unknown> = {}) =>
  (Category as any).create({ name, slug: name.toLowerCase().replace(/\W+/g, "_"), minHourlyRate: 50, ...extra });

export const createClient = async (name = "Client One") => {
  const auth: any = await (Auth as any).create({
    phone: nextPhone(),
    password: "Password1!",
    role: AuthRole.USER,
    status: AuthStatus.ACTIVE,
    isPhoneVerified: true,
  });
  const user: any = await (User as any).create({
    auth: auth._id,
    name,
    phone: auth.phone,
    location: { type: "Point", coordinates: [CASABLANCA.lon, CASABLANCA.lat] },
    address: "12 Rue Test, Maarif, Casablanca, Morocco",
  });
  return { auth, user, id: String(user._id) };
};

export const createHelper = async (
  categoryId: unknown,
  opts: {
    name?: string;
    balance?: number;
    lat?: number;
    lon?: number;
    radius?: number;
    approved?: boolean;
    available?: boolean;
  } = {},
) => {
  const auth: any = await (Auth as any).create({
    phone: nextPhone(),
    password: "Password1!",
    role: AuthRole.HELPER,
    status: AuthStatus.ACTIVE,
    isPhoneVerified: true,
  });
  const user: any = await (User as any).create({
    auth: auth._id,
    name: opts.name || "Helper One",
    phone: auth.phone,
    age: 30,
    city: "Casablanca",
    serviceType: categoryId,
    pricePerHour: 100,
    experience: 3,
    serviceRadius: opts.radius ?? 20,
    isHelperFormSubmitted: true,
    helperApplicationStatus: opts.approved === false ? "pending" : "approved",
    isAvailable: opts.available !== false,
    avatar: "images/x/avatar.webp",
    location: { type: "Point", coordinates: [opts.lon ?? CASABLANCA.lon, opts.lat ?? CASABLANCA.lat] },
  });
  if (opts.balance) await WalletRepository.topup(String(user._id), opts.balance, `seed_${user._id}`);
  return { auth, user, id: String(user._id) };
};

export const balanceOf = async (userId: string) => {
  const w = await Wallet.findOne({ user: userId }).lean();
  return w?.balance ?? 0;
};

export const tomorrow = (): string => {
  const d = new Date(Date.now() + 24 * 3_600_000);
  return d.toISOString().slice(0, 10);
};

export const objectId = () => new mongoose.Types.ObjectId().toString();
