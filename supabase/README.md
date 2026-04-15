# Supabase setup

1. In Supabase Studio → SQL editor, run `schema.sql`.
2. Run `policies.sql`.
3. Storage → New bucket → name `sop-files`, private. Then run `storage.sql`.
4. Authentication → Providers → enable **Anonymous sign-ins** (required for operator join).
5. Authentication → URL configuration → add `http://localhost:3000` and your production domain.
