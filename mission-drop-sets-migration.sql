-- LiftTrack v1 Drop Sets additive migration.
-- REVIEW AND RUN MANUALLY in the Supabase SQL editor. The app never executes this file.

alter table public.workout_sets
  add column if not exists set_type text not null default 'working',
  add column if not exists drop_position integer,
  add column if not exists rest_seconds integer;

update public.workout_sets
set set_type = 'working'
where set_type is null;

alter table public.workout_sets
  alter column set_type set default 'working',
  alter column set_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_sets'::regclass
      and conname = 'workout_sets_set_type_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_set_type_check
      check (set_type in ('working', 'drop'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_sets'::regclass
      and conname = 'workout_sets_drop_position_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_drop_position_check
      check (drop_position is null or drop_position > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_sets'::regclass
      and conname = 'workout_sets_rest_seconds_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_rest_seconds_check
      check (rest_seconds is null or rest_seconds >= 0);
  end if;
end $$;

-- Existing workout_sets RLS policies and grants continue to apply to these columns.
-- Existing rows remain authoritative working sets through the default above.
