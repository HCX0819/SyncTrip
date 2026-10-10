-- Shared checklists (packing and to-dos).
-- Each trip has two lists, told apart by checklist_items.list. Any member can
-- add, edit, tick off, assign and delete items. done_by is maintained by a
-- trigger (whoever ticked the item), so clients can't attribute it to someone
-- else. reorder_checklist() writes the full order of one list in one call,
-- like reorder_itinerary_day() in 007.

create table if not exists public.checklist_items (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  list text not null check (list in ('packing', 'todo')),
  title text not null check (char_length(title) between 1 and 200),
  assignee_id uuid references public.profiles(id) on delete set null,
  done boolean not null default false,
  done_by uuid references public.profiles(id) on delete set null,
  sort_order int not null default 1,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz default now() not null
);

create index if not exists checklist_items_trip_list_sort_idx
  on public.checklist_items (trip_id, list, sort_order);

alter table public.checklist_items enable row level security;

drop policy if exists "Members can read checklist items" on public.checklist_items;
create policy "Members can read checklist items" on public.checklist_items
  for select using (public.is_trip_member(trip_id, auth.uid()));

drop policy if exists "Members can add checklist items" on public.checklist_items;
create policy "Members can add checklist items" on public.checklist_items
  for insert with check (
    public.is_trip_member(trip_id, auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists "Members can update checklist items" on public.checklist_items;
create policy "Members can update checklist items" on public.checklist_items
  for update
  using (public.is_trip_member(trip_id, auth.uid()))
  with check (public.is_trip_member(trip_id, auth.uid()));

drop policy if exists "Members can delete checklist items" on public.checklist_items;
create policy "Members can delete checklist items" on public.checklist_items
  for delete using (public.is_trip_member(trip_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- done_by and assignee validation
-- ---------------------------------------------------------------------------
-- done_by is set to the current user when an item is ticked, cleared when it
-- is unticked, and otherwise left as it was (client values are ignored).
-- The assignee must be a member of the item's trip; it's only checked when
-- the assignee or trip changes, so items assigned to someone who later left
-- stay editable (the trip_members trigger below clears those anyway).
create or replace function public.trg_checklist_items_before()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.done_by := case when new.done then auth.uid() else null end;
  elsif new.done and not old.done then
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_by := null;
  else
    new.done_by := old.done_by;
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT'
          or new.assignee_id is distinct from old.assignee_id
          or new.trip_id is distinct from old.trip_id)
     and not public.is_trip_member(new.trip_id, new.assignee_id) then
    raise exception 'Assignee must be a member of this trip' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_items_before on public.checklist_items;
create trigger checklist_items_before
  before insert or update on public.checklist_items
  for each row execute function public.trg_checklist_items_before();

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------
create or replace function public.trg_checklist_items_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_trip_activity(new.trip_id, 'checklist_added',
      jsonb_build_object('title', new.title, 'list', new.list));
  elsif tg_op = 'UPDATE' and new.done and not old.done then
    perform public.log_trip_activity(new.trip_id, 'checklist_done',
      jsonb_build_object('title', new.title, 'list', new.list));
  end if;
  return null;
end;
$$;

drop trigger if exists checklist_items_activity on public.checklist_items;
create trigger checklist_items_activity
  after insert or update on public.checklist_items
  for each row execute function public.trg_checklist_items_activity();

-- A member who leaves (or is removed) is unassigned from that trip's items.
create or replace function public.trg_trip_members_unassign_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.checklist_items
  set assignee_id = null
  where trip_id = old.trip_id and assignee_id = old.user_id;
  return null;
end;
$$;

drop trigger if exists trip_members_unassign_checklist on public.trip_members;
create trigger trip_members_unassign_checklist
  after delete on public.trip_members
  for each row execute function public.trg_trip_members_unassign_checklist();

revoke execute on function public.trg_checklist_items_before() from public, anon, authenticated;
revoke execute on function public.trg_checklist_items_activity() from public, anon, authenticated;
revoke execute on function public.trg_trip_members_unassign_checklist() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reordering
-- ---------------------------------------------------------------------------
-- Every id in p_item_ids gets sort_order equal to its 1-based position in the
-- array. Ids that don't belong to p_trip_id / p_list are ignored.
create or replace function public.reorder_checklist(
  p_trip_id uuid,
  p_list text,
  p_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id, auth.uid()) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  if p_list is null or p_list not in ('packing', 'todo') then
    raise exception 'Invalid list';
  end if;

  update public.checklist_items c
  set sort_order = o.position::int
  from unnest(p_item_ids) with ordinality as o(item_id, position)
  where c.id = o.item_id
    and c.trip_id = p_trip_id
    and c.list = p_list;
end;
$$;

revoke execute on function public.reorder_checklist(uuid, text, uuid[]) from public, anon;
grant execute on function public.reorder_checklist(uuid, text, uuid[]) to authenticated;
