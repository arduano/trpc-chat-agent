import { z } from 'zod';

export const chatBranchZod = z.array(
  z.object({
    humanMessageIndex: z.number(),
    aiMessageIndex: z.number(),
  })
);
export type ChatTree = z.infer<typeof chatBranchZod>;

export type ChatBranchState = {
  index: number;
  count: number;
};
