-- TWENDE approved taxi fares activation
-- Run this once in the Supabase SQL Editor after gps_fares_phase2.sql.
-- Rates approved by the project owner:
-- Motorcycle: K25 base, K20/km, K35 minimum.
-- Car: K50 base, K35/km, K50 minimum.
update public.taxi_fare_settings
set is_active = true,
    updated_at = now()
where service_type in ('motorcycle', 'car');

-- Verify both services are active with the expected rates.
select service_type, base_fare, per_km, minimum_fare, is_active, updated_at
from public.taxi_fare_settings
where service_type in ('motorcycle', 'car')
order by service_type;
