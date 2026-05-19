import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/, "username may contain letters, digits, underscore, hyphen");

export const credentialsSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(8).max(128),
  })
  .strict();

export const oauthCompleteSchema = z
  .object({
    username: usernameSchema,
  })
  .strict();

export const commentBodySchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const sortQuerySchema = z
  .object({
    sort: z.enum(["top", "new"]).default("top"),
  })
  .strict();

export const projectSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

export type Credentials = z.infer<typeof credentialsSchema>;
export type CommentBody = z.infer<typeof commentBodySchema>;
