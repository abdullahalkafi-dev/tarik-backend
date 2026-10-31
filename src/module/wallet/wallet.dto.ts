import z from "zod";

const topupDto = z.object({
  body: z
    .object({
      amount: z
        .number()
        .min(20, "Minimum top-up is 20 MAD")
        .max(10000, "Maximum top-up is 10 000 MAD"),
    })
    .strict(),
});

export const WalletDto = {
  topup: topupDto,
};
