import z from "zod";

const syncDto = z.object({
  body: z
    .object({
      sessionId: z.string().trim().min(8).max(100),
    })
    .strict(),
});

export const DiditDto = { sync: syncDto };
