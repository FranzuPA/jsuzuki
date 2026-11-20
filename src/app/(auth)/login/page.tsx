import { LoginForm } from "./login-form";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("auth.loginTitle");

export default function LoginPage() {
  return <LoginForm />;
}
