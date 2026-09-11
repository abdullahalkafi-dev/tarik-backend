import z from "zod";

const initPaymentDto = z.object({
  body: z
    .object({
      amount: z.number().positive("Amount must be positive"),
      orderId: z.string().trim().min(1, "Order ID is required"),
      orderType: z.enum(["job", "offer", "wallet_topup"]),
      returnUrl: z.string().url().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    })
    .strict(),
});

export const PaymentDto = {
  initPayment: initPaymentDto,
};
