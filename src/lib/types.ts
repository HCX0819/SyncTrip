export type Category = "stay" | "eat" | "do" | "other";
export type VoteValue = "yaay" | "naay";
export type MemberRole = "owner" | "member";

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
  cover_url?: string | null;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile?: Profile;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface SavedPlace {
  id: string;
  trip_id: string;
  added_by: string;
  title: string;
  category: Category;
  source_url: string | null;
  photo_url: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  created_at: string;
  votes?: Vote[];
  added_by_profile?: Profile;
}

export interface Vote {
  id: string;
  place_id: string;
  user_id: string;
  value: VoteValue;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  place_id: string;
  day_index: number;
  sort_order: number;
  place?: SavedPlace;
}
