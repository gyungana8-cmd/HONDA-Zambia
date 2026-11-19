-- TWENDE approved taxi fares: create OR activate both tariff rows.
-- Approved rates in ZMW:
-- Motorcycle: K25 base, K20/km, K35 minimum.
-- Car: K50 base, K35/km, K50 minimum.
--
-- Previous version only UPDATEd existing rows. If a row was missing,
-- the passenger app received no fare and displayed "not configured".
-- This UPSERT safely creates missing rows and activates both services.

insert into public.taxi_fare_settings
  (service_type, base_fare, per_km, minimum_fare, is_active, updated_at)
values
  ('motorcycle', 25.00, 20.00, 35.00, true, now()),
  ('car',        50.00, 35.00, 50.00, true, now())
on conflict (service_type) do update set
  base_fare = excluded.base_fare,
  per_km = excluded.per_km,
  minimum_fare = excluded.minimum_fare,
  is_active = true,
  updated_at = now();

-- Confirm both active rates. Expected rows: car and motorcycle, both is_active=true.
select service_type, base_fare, per_km, minimum_fare, is_active, updated_at
from public.taxi_fare_settings
where service_type in ('motorcycle', 'car')
order by service_type;
