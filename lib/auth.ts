import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type { LangCode, Role } from "./types";

export const ACTIVE_FACILITY_COOKIE = "active_facility_id";

export interface AuthContext {
  user: { id: string; email?: string | null } | null;
  role: Role | null;
  facilityId: string | null;
  facilityIds: string[];
  isPlatformAdmin: boolean;
  language: LangCode;
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      role: null,
      facilityId: null,
      facilityIds: [],
      isPlatformAdmin: false,
      language: "en",
    };
  }
  const role = ((user.user_metadata as any)?.role as Role | undefined) ?? null;

  // Use the admin client for membership/platform lookups: these RLS functions
  // depend on auth.uid() and, when called through an anon-key client before
  // the user has any rows they can see, short-circuit to empty. The service
  // role bypasses RLS so we get a true answer.
  const admin = createAdminClient();

  const { data: platformRow } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isPlatformAdmin = !!platformRow;

  let facilityIds: string[] = [];
  let language: LangCode = "en";

  if (role === "admin") {
    const { data: memberships } = await admin
      .from("facility_members")
      .select("facility_id")
      .eq("user_id", user.id);
    facilityIds = (memberships ?? []).map((m) => m.facility_id as string);
  } else if (role === "operator") {
    const { data: prof } = await admin
      .from("operator_profiles")
      .select("facility_id, language")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prof?.facility_id) facilityIds = [prof.facility_id];
    language = ((prof?.language as LangCode | undefined) ?? "en");
  }

  // Admins may have an active_facility_id cookie to pick among multiple workspaces.
  // Platform admins with no memberships can operate on any facility via the cookie.
  const cookieFid = cookies().get(ACTIVE_FACILITY_COOKIE)?.value ?? null;
  let facilityId: string | null = null;
  if (role === "operator") {
    facilityId = facilityIds[0] ?? null;
  } else {
    if (cookieFid && (facilityIds.includes(cookieFid) || isPlatformAdmin)) {
      facilityId = cookieFid;
    } else {
      facilityId = facilityIds[0] ?? null;
    }
  }

  // Language: for admins, derive from the active facility's default_language.
  if (role === "admin" && facilityId) {
    const { data: fac } = await admin
      .from("facilities")
      .select("default_language")
      .eq("id", facilityId)
      .maybeSingle();
    language = ((fac?.default_language as LangCode | undefined) ?? "en");
  }

  return {
    user: { id: user.id, email: user.email },
    role,
    facilityId,
    facilityIds,
    isPlatformAdmin,
    language,
  };
}

/**
 * Gate an API route on admin access to `facilityId`. Returns the `AuthContext`
 * on success, or a `NextResponse` (403/401) that the caller should return.
 *
 * Access = (user is member of facility with role in ('owner','admin'))
 *        OR user is a platform admin.
 */
export async function requireFacilityAdmin(
  facilityId: string | null,
): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!facilityId) return NextResponse.json({ error: "no facility" }, { status: 400 });
  const ok = ctx.isPlatformAdmin || ctx.facilityIds.includes(facilityId);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return ctx;
}

export function isAuthError(v: AuthContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
