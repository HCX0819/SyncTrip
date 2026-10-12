import type { createClient } from "./supabase/client";
import type { Vote, VoteValue } from "./types";

/** Sets or clears (undefined) the user's vote on a place. */
export async function setVote(
  supabase: ReturnType<typeof createClient>,
  placeId: string,
  userId: string,
  value: VoteValue | undefined
) {
  if (value === undefined) {
    await supabase.from("votes").delete().eq("place_id", placeId).eq("user_id", userId);
  } else {
    await supabase
      .from("votes")
      .upsert({ place_id: placeId, user_id: userId, value }, { onConflict: "place_id,user_id" });
  }
}

/** Counts shown while a vote is being saved: server counts adjusted for `pending`. */
export function optimisticCounts(votes: Vote[], userId: string, pending: VoteValue | undefined) {
  const mine = votes.find((v) => v.user_id === userId)?.value;
  const count = (value: VoteValue) =>
    votes.filter((v) => v.value === value).length +
    (pending === value && mine !== value ? 1 : 0) -
    (mine === value && pending !== value ? 1 : 0);
  return { yaay: count("yaay"), naay: count("naay") };
}
