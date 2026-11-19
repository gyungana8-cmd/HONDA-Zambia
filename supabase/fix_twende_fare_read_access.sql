-- TWENDE fare lookup access fix.
-- Passenger fare estimation runs before sign-in. The previous RLS policy
-- allowed SELECT only to authenticated users, so anonymous visitors saw
-- zero rows and the app incorrectly said the fare was not configured.
-- Fare settings contain public tariff values only; allow read-only access.

grant select on table public.taxi_fare_settings to anon, authenticated;

drop policy if exists "Authenticated users can read active taxi fares"
  on public.taxi_fare_settings;
drop policy if exists "Public can read active TWENDE taxi fares"
  on public.taxi_fare_settings;

create policy "Public can read active TWENDE taxi fares"
on public.taxi_fare_settings
for select
to anon, authenticated
using (is_active = true);

select service_type, base_fare, per_km, minimum_fare, is_active
from public.taxi_fare_settings
where service_type in ('car','motorcycle')
order by service_type;
