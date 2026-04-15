# Supabase setup

Run in order in the Supabase SQL editor:

1. `schema.sql` — tables, indexes.
2. `policies.sql` — RLS helpers, policies, storage bucket + policy.
3. Sign up once at `/signup` with the email(s) that should be platform admins.
4. `seed.sql` — inserts platform admin rows (edit the email list inside first if you're not Stan).

Supabase dashboard:
- Authentication → Providers → enable **Anonymous sign-ins** (operators use it).
- Authentication → URL configuration → add `http://localhost:3000` and your production domain.
- Authentication → Email → confirm SMTP is configured (defaults to Supabase's shared sender; configure your own for production invite delivery).

`setup.sql` is a legacy single-file snapshot — prefer the three files above. `cleanup-storage.sql` resets the R2/storage bucket if needed.
