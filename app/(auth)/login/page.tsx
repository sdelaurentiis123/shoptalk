import LoginForm from "./login-form";
import { getAuthContext } from "@/lib/auth";

export default async function Login() {
  const { language } = await getAuthContext();
  return <LoginForm lang={language} />;
}
