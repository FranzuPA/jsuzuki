import { z } from "zod";
import { checkPasswordStrength } from "../auth/password";

export const loginSchema = z.object({
  email: z.email({ message: "Correo invalido." }).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, { message: "Escribí tu contraseña." }),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, { message: "Escribí tu nombre." }).max(80),
    email: z.email({ message: "Correo invalido." }).transform((value) => value.trim().toLowerCase()),
    password: z.string().min(10, { message: "Mínimo 10 caracteres." }).max(200),
    locale: z.enum(["es", "pt"]).default("es"),
    currency: z.string().length(3).default("BRL"),
    withSampleData: z.boolean().default(false),
  })
  .refine((data) => checkPasswordStrength(data.password).ok, {
    message: "La contraseña necesita mayúscula, minúscula y número.",
    path: ["password"],
  });

export const preferencesSchema = z.object({
  locale: z.enum(["es", "pt"]).optional(),
  currency: z.string().length(3).optional(),
  dateFormat: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  timezone: z.string().min(1).max(64).optional(),
  monthStartDay: z.coerce.number().int().min(1).max(28).optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "Escribí tu contraseña actual." }),
    newPassword: z.string().min(10, { message: "Mínimo 10 caracteres." }).max(200),
  })
  .refine((data) => checkPasswordStrength(data.newPassword).ok, {
    message: "La contraseña necesita mayúscula, minúscula y número.",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
