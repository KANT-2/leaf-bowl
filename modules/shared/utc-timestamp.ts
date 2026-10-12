import { z } from "zod";
import { normalizeUTC } from "@/modules/shared/time";

/** Accept explicit offsets for compatibility; return only canonical UTC ISO. */
export const utcTimestampSchema = z
  .string()
  .refine((value) => normalizeUTC(value) !== null, "시간대를 포함한 올바른 시각을 입력해주세요.")
  .transform((value) => normalizeUTC(value)!);
