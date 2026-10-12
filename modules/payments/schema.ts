import { z } from "zod";

export const confirmPaymentSchema = z
  .object({
    orderId: z.string().uuid(),
    paymentKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_-]+$/),
    amount: z.number().int().positive().max(300_000_000),
  })
  .strict();

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
