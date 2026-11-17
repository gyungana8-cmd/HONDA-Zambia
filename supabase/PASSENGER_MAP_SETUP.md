# TWENDE passenger live map setup

The passenger live map adds pickup and destination search, GPS pickup capture, a route preview, and nearby online car/motorcycle taxi markers.

## Database setup

1. Open the TWENDE Supabase project.
2. Go to **SQL Editor** and create a new query.
3. Copy and run the complete contents of `supabase/passenger_nearby_drivers.sql`.
4. Confirm that `gps_fares_phase2.sql` has already been applied. The nearby-driver function reads the `driver_locations` table created by that migration.

## Driver requirements

- Driver account must be approved by the TWENDE administrator.
- Driver must select **Go online**.
- Driver must grant precise location permission to TWENDE.
- The driver app must remain open and share a recent GPS fix. The passenger map only displays driver locations updated within the last two minutes.

## Passenger test

1. Install the latest TWENDE APK and connect the phone to the internet.
2. Open **Taxi rides**.
3. Tap **Use my current location** and allow precise location access.
4. Confirm the pickup pin appears on the map.
5. Search for a destination in Zambia and select a suggestion.
6. Confirm the destination pin and road route appear.
7. Select Car taxi or Motorcycle taxi and tap **Continue to booking**.
8. Confirm that the taxi request form contains the selected pickup and destination.

## Notes

- The map uses OpenStreetMap tiles, Photon place search, and the OSRM demo routing service. These prototype services require internet access and are not a production SLA-backed mapping provider.
- Nearby taxis appear only when approved drivers are online and actively sharing GPS. The map cannot display a driver who is offline or whose location is stale.
- Passenger payments remain cash-only. Driver notifications and push-notification behaviour are not changed by this passenger-map phase.
- Motorcycle hire remains available as before.
