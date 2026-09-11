import z from "zod";

const topupDto = z.object({
  body: z
    .object({
      amount: z.number().positive("Top-up amount must be positive"),
    })
    .strict(),
});

export const WalletDto = {
  topup: topupDto,
};
