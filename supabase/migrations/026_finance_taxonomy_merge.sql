-- Finanse 07: merge / move in the taxonomy as single SQL functions, so a failure never
-- leaves data half-moved (supabase-js has no client-side transactions).
-- Transactions in the trash move too (they still count as "already imported").
-- Only the service role may call these (RLS is on with no policies; revoke the default PUBLIC execute).

-- Subcategory X → Y: transactions and rules get Y (and Y's category); X is deleted.
create or replace function finance_merge_subcategory(p_from uuid, p_to uuid)
returns jsonb language plpgsql as $$
declare
  v_to_cat uuid;
  v_tx int;
  v_rules int;
begin
  if p_from = p_to then raise exception 'merge_self'; end if;
  select category_id into v_to_cat from finance_subcategories where id = p_to;
  if v_to_cat is null then raise exception 'merge_target_missing'; end if;
  if not exists (select 1 from finance_subcategories where id = p_from) then raise exception 'merge_source_missing'; end if;

  update finance_transactions set subcategory_id = p_to, category_id = v_to_cat where subcategory_id = p_from;
  get diagnostics v_tx = row_count;
  update finance_rules set subcategory_id = p_to, category_id = v_to_cat where subcategory_id = p_from;
  get diagnostics v_rules = row_count;
  delete from finance_subcategories where id = p_from;
  return jsonb_build_object('transactions', v_tx, 'rules', v_rules);
end $$;

-- Category X → Y: X's subcategories move under Y (a same-named one in Y absorbs it),
-- transactions, rules and tag links follow; X is deleted.
create or replace function finance_merge_category(p_from uuid, p_to uuid)
returns jsonb language plpgsql as $$
declare
  s record;
  v_twin uuid;
  v_tx int;
  v_rules int;
  v_subs int := 0;
begin
  if p_from = p_to then raise exception 'merge_self'; end if;
  if not exists (select 1 from finance_categories where id = p_to) then raise exception 'merge_target_missing'; end if;
  if not exists (select 1 from finance_categories where id = p_from) then raise exception 'merge_source_missing'; end if;

  for s in select id, name from finance_subcategories where category_id = p_from loop
    v_subs := v_subs + 1;
    select id into v_twin from finance_subcategories where category_id = p_to and name = s.name;
    if v_twin is not null then
      update finance_transactions set subcategory_id = v_twin where subcategory_id = s.id;
      update finance_rules set subcategory_id = v_twin where subcategory_id = s.id;
      delete from finance_subcategories where id = s.id;
    else
      update finance_subcategories set category_id = p_to where id = s.id;
    end if;
  end loop;

  update finance_transactions set category_id = p_to where category_id = p_from;
  get diagnostics v_tx = row_count;
  update finance_rules set category_id = p_to where category_id = p_from;
  get diagnostics v_rules = row_count;
  insert into finance_category_tags (category_id, tag_id)
    select p_to, tag_id from finance_category_tags where category_id = p_from
    on conflict do nothing;
  delete from finance_categories where id = p_from;
  return jsonb_build_object('transactions', v_tx, 'rules', v_rules, 'subcategories', v_subs);
end $$;

-- Move a subcategory to another category: its transactions and rules change category_id,
-- subcategory_id stays. A same-named subcategory in the target → error (merge instead).
create or replace function finance_move_subcategory(p_sub uuid, p_to_category uuid)
returns jsonb language plpgsql as $$
declare
  v_name text;
  v_tx int;
  v_rules int;
begin
  select name into v_name from finance_subcategories where id = p_sub;
  if v_name is null then raise exception 'move_source_missing'; end if;
  if not exists (select 1 from finance_categories where id = p_to_category) then raise exception 'move_target_missing'; end if;
  if exists (select 1 from finance_subcategories where category_id = p_to_category and name = v_name and id <> p_sub) then
    raise exception 'move_name_conflict';
  end if;

  update finance_subcategories set category_id = p_to_category where id = p_sub;
  update finance_transactions set category_id = p_to_category where subcategory_id = p_sub;
  get diagnostics v_tx = row_count;
  update finance_rules set category_id = p_to_category where subcategory_id = p_sub;
  get diagnostics v_rules = row_count;
  return jsonb_build_object('transactions', v_tx, 'rules', v_rules);
end $$;

revoke execute on function finance_merge_subcategory(uuid, uuid) from public, anon, authenticated;
revoke execute on function finance_merge_category(uuid, uuid) from public, anon, authenticated;
revoke execute on function finance_move_subcategory(uuid, uuid) from public, anon, authenticated;
grant execute on function finance_merge_subcategory(uuid, uuid) to service_role;
grant execute on function finance_merge_category(uuid, uuid) to service_role;
grant execute on function finance_move_subcategory(uuid, uuid) to service_role;
