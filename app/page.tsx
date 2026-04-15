import Link from "next/link";

export default function Landing() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-[640px] w-full">
        <div className="text-[44px] font-bold tracking-tight2 leading-tight">ShopTalk</div>
        <p className="text-[17px] text-text-secondary mt-3 mb-8 leading-relaxed">
          Chat with your manual. Upload SOP videos and documents — your team can ask questions in any language,
          grounded in your actual procedures.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="px-6 py-3 rounded-full bg-primary text-white font-medium text-[14px]">
            Start a facility
          </Link>
          <Link href="/login" className="px-6 py-3 rounded-full border border-border text-[14px] font-medium">
            Sign in
          </Link>
          <Link href="/join" className="px-6 py-3 rounded-full border border-border text-[14px] font-medium">
            Join as operator
          </Link>
        </div>
      </div>
    </main>
  );
}
