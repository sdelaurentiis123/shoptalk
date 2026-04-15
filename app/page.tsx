import Link from "next/link";
import { t } from "@/lib/i18n";
import { getAuthContext } from "@/lib/auth";

export default async function Landing() {
  const { language } = await getAuthContext();
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-[640px] w-full">
        <div className="text-[44px] font-bold tracking-tight2 leading-tight">{t(language, "landingTitle")}</div>
        <p className="text-[17px] text-text-secondary mt-3 mb-8 leading-relaxed">{t(language, "landingPitch")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="px-6 py-3 rounded-full bg-primary text-white font-medium text-[14px]">
            {t(language, "startFacility")}
          </Link>
          <Link href="/login" className="px-6 py-3 rounded-full border border-border text-[14px] font-medium">
            {t(language, "signIn")}
          </Link>
          <Link href="/join" className="px-6 py-3 rounded-full border border-border text-[14px] font-medium">
            {t(language, "joinAsOperator")}
          </Link>
        </div>
      </div>
    </main>
  );
}
