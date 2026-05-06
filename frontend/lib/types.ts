import { z } from 'zod';

export interface Machine {
  id: number;
  name: string;
  uuid: string;
  ip: string;
  mac: string;
  port: number;
  use_wowlan: boolean;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  ping_ms: number | null;
}

export interface MachineForm {
  name: string;
  ip: string;
  mac: string;
  port: number;
  use_wowlan: boolean;
}

export const MetricsSchema = z.object({
  ram: z
    .object({
      total_in_mb: z.number().nullable().optional(),
      in_use_in_mb: z.number().nullable().optional(),
      free_in_mb: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  cpu: z
    .object({
      name: z.string().nullable().optional(),
      cores: z.number().nullable().optional(),
      threads: z.number().nullable().optional(),
      usage_percentage: z.number().nullable().optional(),
      temperature_in_celsius: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  gpu: z
    .object({
      present: z.boolean().nullable().optional(),
      name: z.string().nullable().optional(),
      usage_percentage: z.number().nullable().optional(),
      temperature_in_celsius: z.number().nullable().optional(),
      vram: z
        .object({
          total_in_mb: z.number().nullable().optional(),
          in_use_in_mb: z.number().nullable().optional(),
          free_in_mb: z.number().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export type Metrics = z.infer<typeof MetricsSchema>;
