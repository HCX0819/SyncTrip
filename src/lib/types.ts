export type Category = "stay" | "eat" | "do" | "other";
export type VoteValue = "yaay" | "naay";
export type MemberRole = "owner" | "member";
export type BookingStatus = "none" | "needed" | "booked";
export type TravelMode = "walk" | "drive";

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
  cover_url?: string | null;
  invite_token?: string;
  is_public_template?: boolean;
  travel_mode?: TravelMode;
  currency?: string;
}

/** Row from the list_templates() RPC: display fields only. */
export interface TemplateSummary {
  id: string;
  name: string;
  destination: string;
  day_count: number | null;
  place_count: number;
  cover_url: string | null;
}

/** get_template() result: a summary plus its places (one per itinerary slot). */
export interface TemplateDetail extends TemplateSummary {
  places: {
    title: string;
    category: Category;
    address: string | null;
    photo_url: string | null;
    latitude: number | null;
    longitude: number | null;
    day_index: number | null;
    sort_order: number | null;
  }[];
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
  email?: string | null;
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
  booking_status?: BookingStatus;
  booking_ref?: string | null;
  /** Weekdays the place is closed, 0 = Sunday .. 6 = Saturday. */
  closed_days?: number[] | null;
  votes?: Vote[];
  added_by_profile?: Profile;
  /** From the `place_comments(count)` embed. */
  place_comments?: { count: number }[];
}

export interface PlaceComment {
  id: string;
  place_id: string;
  trip_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
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
  /** Postgres `time` ("HH:MM:SS"), when set. */
  start_time?: string | null;
  end_time?: string | null;
  place?: SavedPlace;
}

export type ChecklistList = "packing" | "todo";

export interface ChecklistItem {
  id: string;
  trip_id: string;
  list: ChecklistList;
  title: string;
  assignee_id: string | null;
  done: boolean;
  done_by: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export type ActivityKind =
  | "place_added"
  | "place_deleted"
  | "vote"
  | "itinerary_added"
  | "itinerary_removed"
  | "itinerary_reordered"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "checklist_added"
  | "checklist_done"
  | "comment_added"
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "settlement_recorded";

export interface TripActivity {
  id: string;
  trip_id: string;
  actor_id: string | null;
  kind: ActivityKind;
  payload: {
    actor_name?: string | null;
    title?: string | null;
    name?: string | null;
    value?: VoteValue;
    day_index?: number;
    description?: string | null;
    amount_cents?: number;
    currency?: string | null;
    from_name?: string | null;
    to_name?: string | null;
    is_settlement?: boolean;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface ExpenseShare {
  expense_id: string;
  user_id: string;
  amount_cents: number;
}

export interface Expense {
  id: string;
  trip_id: string;
  description: string;
  amount_cents: number;
  paid_by: string | null;
  spent_on: string;
  category: string | null;
  place_id: string | null;
  is_settlement: boolean;
  created_by: string | null;
  created_at: string;
  expense_shares?: ExpenseShare[];
}
