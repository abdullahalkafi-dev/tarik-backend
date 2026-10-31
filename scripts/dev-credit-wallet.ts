/**
 * DEVELOPMENT ONLY. Puts test money into a user's wallet so a helper can accept
 * cash jobs (the commission is prepaid from the wallet) without the payment simulator.
 *
 *   npx ts-node-dev --transpile-only -r tsconfig-paths/register scripts/dev-credit-wallet.ts <phone> [amount]
 *   e.g. npx ts-node-dev --transpile-only -r tsconfig-paths/register scripts/dev-credit-wallet.ts 0612345671 500
 *
 * It writes a normal ledger entry (type "topup"), so history and totals stay correct.
 * (ts-node-dev stays open after printing the result: press Ctrl+C.)
 * It refuses to run when NODE_ENV=production.
 */
import mongoose from "mongoose";
import ConnectDB from "../src/db";
import { User } from "../src/module/user/user.model";
import { Auth } from "../src/module/auth/auth.model";
import { WalletRepository } from "../src/module/wallet/wallet.repository";

const run = async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run in production.");
    process.exit(1);
  }
  const rawPhone = process.argv[2];
  const amount = Number(process.argv[3] || 500);
  if (!rawPhone || !Number.isFinite(amount) || amount <= 0) {
    console.error("Usage: dev-credit-wallet.ts <phone> [amount]");
    process.exit(1);
  }
  const digits = rawPhone.replace(/\D/g, "").replace(/^212/, "").replace(/^0/, "");
  await ConnectDB();
  const auth: any = await Auth.findOne({ phone: { $regex: `${digits}$` } });
  const user: any = auth ? await User.findOne({ auth: auth._id }) : null;
  if (!user) {
    console.error(`No account found for ${rawPhone}`);
    process.exit(1);
  }
  const wallet = await WalletRepository.topup(String(user._id), amount, `dev_topup_${Date.now()}`);
  console.log(`${user.name}: +${amount} MAD, balance now ${wallet.balance} MAD`);
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
