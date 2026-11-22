-- Passenger-safe taxi history with the actual assigned vehicle identity.
-- Vehicle details are revealed only after a driver accepts the request.
create or replace function public.twende_passenger_ride_history()
returns table(
 ride_id uuid,
 service_type text,
 pickup_text text,
 destination_text text,
 payment_method text,
 status text,
 created_at timestamptz,
 route_distance_km numeric,
 estimated_fare numeric,
 vehicle_make text,
 vehicle_model text,
 vehicle_color text,
 plate_number text,
 driver_name text,
 driver_phone text,
 vehicle_photo_url text
)
language sql
stable
security definer
set search_path=public
as $$
 select r.id,r.service_type,r.pickup_text,r.destination_text,r.payment_method,
        r.status,r.created_at,r.route_distance_km,r.estimated_fare,
        case when r.status='accepted' then v.vehicle_make end,
        case when r.status='accepted' then v.vehicle_model end,
        case when r.status='accepted' then v.vehicle_color end,
        case when r.status='accepted' then v.plate_number end,
        case when r.status='accepted' then coalesce(v.driver_name,p.driver_name) end,
        case when r.status='accepted' then coalesce(v.phone,p.phone) end,
        case when r.status='accepted' then v.vehicle_photo_url end
 from public.ride_requests r
 left join public.driver_vehicles v on v.id=r.driver_vehicle_id
 left join public.driver_profiles p on p.user_id=r.driver_id
 where r.rider_id=auth.uid()
 order by r.created_at desc
 limit 8;
$$;
revoke all on function public.twende_passenger_ride_history() from public;
grant execute on function public.twende_passenger_ride_history() to authenticated;
