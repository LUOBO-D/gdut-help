import { z } from 'zod';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const creditOfficialModuleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  required: z.number().min(0).max(300),
  earned: z.number().min(0).max(300),
  missing: z.number().min(0).max(300),
});

export const creditPlanInputSchema = z.object({
  totalTarget: z.number().min(30, { error: '毕业总学分目标需在 30–300 之间' }).max(300),
  generalRequiredTarget: z.number().min(0).max(150),
  majorRequiredTarget: z.number().min(0).max(150),
  majorElectiveTarget: z.number().min(0).max(100),
  generalElectiveTarget: z.number().min(0).max(60),
  practiceTarget: z.number().min(0).max(80),
  majorName: optionalTrimmed(60),
  officialModules: z.array(creditOfficialModuleSchema).max(30).optional(),
});

export type CreditPlanInput = z.infer<typeof creditPlanInputSchema>;
