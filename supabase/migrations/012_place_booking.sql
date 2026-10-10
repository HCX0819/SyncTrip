-- Booking status and opening days on saved places.
-- booking_status: 'none' (default), 'needed' or 'booked'; booking_ref is a
-- free-text confirmation number. closed_days lists the weekdays the place is
-- closed, 0 = Sunday .. 6 = Saturday (same as JavaScript's Date.getDay()).
-- saved_places has no column-level grants (members update it through the
-- table-wide policy from 003), so the new columns need no extra grant.

alter table public.saved_places
  add column if not exists booking_status text not null default 'none',
  add column if not exists booking_ref text,
  add column if not exists closed_days smallint[];

alter table public.saved_places
  drop constraint if exists saved_places_booking_status_check,
  add constraint saved_places_booking_status_check
    check (booking_status in ('none', 'needed', 'booked'));

alter table public.saved_places
  drop constraint if exists saved_places_booking_ref_length_check,
  add constraint saved_places_booking_ref_length_check
    check (booking_ref is null or char_length(booking_ref) <= 200);

-- "<@" is array containment: every element must be one of 0..6.
alter table public.saved_places
  drop constraint if exists saved_places_closed_days_check,
  add constraint saved_places_closed_days_check
    check (closed_days is null or closed_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);
