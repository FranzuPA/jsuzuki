import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

export * from "./session";
export * from "./password";

/** Para server components: devuelve el usuario o manda al login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
