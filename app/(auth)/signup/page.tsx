import SignupForm from "./signup-form";
import { getAuthContext } from "@/lib/auth";

export default async function Signup() {
  const { language } = await getAuthContext();
  return <SignupForm lang={language} />;
}
