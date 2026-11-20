import { RegisterForm } from "./register-form";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("auth.registerTitle");

export default function RegisterPage() {
  return <RegisterForm />;
}
