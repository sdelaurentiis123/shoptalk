-- Seed the platform admins. Run AFTER schema.sql + policies.sql, and AFTER
-- the named users have signed up at least once (so their auth.users row exists).
--
-- Add more rows for additional platform admins.

insert into platform_admins (user_id)
select id from auth.users where email = 'sdelaurentiis123@gmail.com'
on conflict (user_id) do nothing;
