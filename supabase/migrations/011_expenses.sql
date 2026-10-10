-- Shared expenses.
-- 1. Each trip has one currency (trips.currency, ISO 4217 code), editable by
--    the owner through the existing column grant on trips.
-- 2. expenses holds who paid how much; expense_shares holds how much of it
--    each member owes. All amounts are integer cents.
-- 3. Members can read both tables but never write them directly: every write
--    goes through save_expense() / delete_expense(), which validate that the
--    payer and everyone sharing are members and that the shares add up
--    exactly to the amount, and log an activity event.
-- 4. A settlement ("Mark paid") is an expense with is_settlement = true paid
--    by the debtor with a single share for the creditor, so balances need no
--    special casing.

-- ---------------------------------------------------------------------------
-- Trip currency
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists currency char(3) not null default 'USD'
    check (currency ~ '^[A-Z]{3}$');

-- 006 limits direct updates to a column list; add currency to it.
grant update (currency) on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid references public.profiles(id) on delete set null,
  spent_on date not null default current_date,
  category text check (category is null or char_length(category) <= 40),
  place_id uuid references public.saved_places(id) on delete set null,
  is_settlement boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);

create index if not exists expenses_trip_spent_idx
  on public.expenses (trip_id, spent_on desc, created_at desc);

-- user_id cascades so deleting an account (delete_my_account) isn't blocked;
-- members are warned about open balances before anyone is removed.
create table if not exists public.expense_shares (
  expense_id uuid references public.expenses(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, user_id)
);

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

drop policy if exists "Members can read expenses" on public.expenses;
create policy "Members can read expenses" on public.expenses
  for select using (public.is_trip_member(trip_id, auth.uid()));

drop policy if exists "Members can read expense shares" on public.expense_shares;
create policy "Members can read expense shares" on public.expense_shares
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_member(e.trip_id, auth.uid())
    )
  );

revoke insert, update, delete on public.expenses from anon, authenticated;
revoke insert, update, delete on public.expense_shares from anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_expense
-- ---------------------------------------------------------------------------
-- Creates (p_expense_id null) or updates an expense and replaces its shares
-- in one transaction. p_shares is a JSON array of
--   { "user_id": uuid, "amount_cents": int }
-- Updating is limited to the expense's creator and the trip owner, like
-- deleting. Returns the expense id.
create or replace function public.save_expense(
  p_trip_id uuid,
  p_expense_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_by uuid,
  p_spent_on date,
  p_category text,
  p_place_id uuid,
  p_is_settlement boolean,
  p_shares jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_existing public.expenses;
  v_description text := btrim(coalesce(p_description, ''));
  v_is_settlement boolean := coalesce(p_is_settlement, false);
  v_share_count int;
  v_distinct_users int;
  v_share_sum bigint;
  v_bad_rows int;
  v_non_members int;
  v_settle_to uuid;
  v_currency text;
  v_kind text;
  v_payload jsonb;
begin
  if v_uid is null or not public.is_trip_member(p_trip_id, v_uid) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;

  if v_description = '' then
    raise exception 'Description is required';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_paid_by is null or not public.is_trip_member(p_trip_id, p_paid_by) then
    raise exception 'The payer must be a member of this trip';
  end if;

  if p_place_id is not null and not exists (
    select 1 from public.saved_places where id = p_place_id and trip_id = p_trip_id
  ) then
    raise exception 'Linked place is not in this trip';
  end if;

  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'At least one person must share the expense';
  end if;

  select
    count(*)::int,
    count(distinct s.user_id)::int,
    coalesce(sum(s.amount_cents), 0),
    (count(*) filter (where s.user_id is null or s.amount_cents is null or s.amount_cents < 0))::int,
    (count(*) filter (where s.user_id is not null
                        and not public.is_trip_member(p_trip_id, s.user_id)))::int,
    min(s.user_id::text)::uuid
  into v_share_count, v_distinct_users, v_share_sum, v_bad_rows, v_non_members, v_settle_to
  from (
    select (e->>'user_id')::uuid as user_id, (e->>'amount_cents')::bigint as amount_cents
    from jsonb_array_elements(p_shares) e
  ) s;

  if v_bad_rows > 0 then
    raise exception 'Each share needs a user and a non-negative amount';
  end if;

  if v_distinct_users <> v_share_count then
    raise exception 'A person can only appear once in the shares';
  end if;

  if v_non_members > 0 then
    raise exception 'Everyone sharing the expense must be a member of this trip';
  end if;

  if v_share_sum <> p_amount_cents then
    raise exception 'Shares must add up to the amount (% vs %)', v_share_sum, p_amount_cents;
  end if;

  -- A settlement moves money from the payer to exactly one other member.
  if v_is_settlement and (v_share_count <> 1 or v_settle_to = p_paid_by) then
    raise exception 'A settlement must be paid to exactly one other member';
  end if;

  if p_expense_id is null then
    insert into public.expenses (
      trip_id, description, amount_cents, paid_by, spent_on, category,
      place_id, is_settlement, created_by
    ) values (
      p_trip_id, v_description, p_amount_cents, p_paid_by, coalesce(p_spent_on, current_date),
      nullif(btrim(p_category), ''), p_place_id, v_is_settlement, v_uid
    )
    returning id into v_id;
    v_kind := case when v_is_settlement then 'settlement_recorded' else 'expense_added' end;
  else
    select * into v_existing from public.expenses where id = p_expense_id for update;
    if v_existing.id is null or v_existing.trip_id <> p_trip_id then
      raise exception 'Expense not found';
    end if;
    if v_existing.created_by is distinct from v_uid and not public.is_trip_owner(p_trip_id, v_uid) then
      raise exception 'Only the person who added this expense or the trip owner can edit it'
        using errcode = '42501';
    end if;

    update public.expenses
    set description = v_description,
        amount_cents = p_amount_cents,
        paid_by = p_paid_by,
        spent_on = coalesce(p_spent_on, spent_on),
        category = nullif(btrim(p_category), ''),
        place_id = p_place_id,
        is_settlement = v_is_settlement
    where id = p_expense_id;

    delete from public.expense_shares where expense_id = p_expense_id;
    v_id := p_expense_id;
    v_kind := 'expense_updated';
  end if;

  insert into public.expense_shares (expense_id, user_id, amount_cents)
  select v_id, (e->>'user_id')::uuid, (e->>'amount_cents')::bigint
  from jsonb_array_elements(p_shares) e;

  select currency into v_currency from public.trips where id = p_trip_id;
  v_payload := jsonb_build_object(
    'expense_id', v_id,
    'description', v_description,
    'amount_cents', p_amount_cents,
    'currency', v_currency
  );
  if v_is_settlement then
    v_payload := v_payload || jsonb_build_object(
      'from_name', (select display_name from public.profiles where id = p_paid_by),
      'to_name', (select display_name from public.profiles where id = v_settle_to)
    );
  end if;
  perform public.log_trip_activity(p_trip_id, v_kind, v_payload);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_expense
-- ---------------------------------------------------------------------------
-- The expense's creator or the trip owner can delete it (shares cascade).
create or replace function public.delete_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses;
  v_currency text;
begin
  select * into v_expense from public.expenses where id = p_id for update;

  -- Non-members get the same error as a missing id, so ids can't be probed.
  if v_uid is null or v_expense.id is null or not public.is_trip_member(v_expense.trip_id, v_uid) then
    raise exception 'Expense not found' using errcode = '42501';
  end if;

  if v_expense.created_by is distinct from v_uid and not public.is_trip_owner(v_expense.trip_id, v_uid) then
    raise exception 'Only the person who added this expense or the trip owner can delete it'
      using errcode = '42501';
  end if;

  select currency into v_currency from public.trips where id = v_expense.trip_id;
  perform public.log_trip_activity(v_expense.trip_id, 'expense_deleted',
    jsonb_build_object(
      'description', v_expense.description,
      'amount_cents', v_expense.amount_cents,
      'currency', v_currency,
      'is_settlement', v_expense.is_settlement
    ));

  delete from public.expenses where id = p_id;
end;
$$;

revoke execute on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, uuid, boolean, jsonb) from public, anon;
grant execute on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, uuid, boolean, jsonb) to authenticated;
revoke execute on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
