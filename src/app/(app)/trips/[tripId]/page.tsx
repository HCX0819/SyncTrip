import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripTabs from "@/components/trips/TripTabs";
import type { Trip, TripMember, SavedPlace } from "@/lib/types";

async function getTripData(tripId: string, userId: string) {
  const supabase = await createClient();

  const [tripRes, membersRes, placesRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase
      .from("trip_members")
      .select("*, profile:profiles(*)")
      .eq("trip_id", tripId),
    supabase
      .from("saved_places")
      .select("*, votes(*)")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
  ]);

  if (tripRes.error || !tripRes.data) return null;

  // Check membership
  const isMember = membersRes.data?.some((m) => m.user_id === userId);
  if (!isMember) return null;

  return {
    trip: tripRes.data as Trip,
    members: (membersRes.data ?? []) as TripMember[],
    places: (placesRes.data ?? []) as SavedPlace[],
  };
}

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const data = await getTripData(tripId, user.id);
  if (!data) notFound();

  return (
    <div style={{ minHeight: "100dvh" }}>
      <TripTabs trip={data.trip} members={data.members} places={data.places} currentUserId={user.id} />
    </div>
  );
}
