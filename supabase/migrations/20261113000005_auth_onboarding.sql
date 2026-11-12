-- TopTeam: этап 1 — вход через Telegram и онбординг

-- Бейдж «Профиль готов»: когда атлет впервые указал пол (уровень и цель серии имеют значения по умолчанию
-- и выбираются на том же экране онбординга).
create or replace function public.tg_profiles_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g uuid;
begin
  if old.sex is null and new.sex is not null then
    select gym_id into g from gym_members where user_id = new.id order by joined_at limit 1;
    perform award_badge(new.id, 'profile_done', g);
  end if;
  return new;
end $$;

create trigger profiles_done after update of sex on public.profiles
for each row execute function public.tg_profiles_done();

-- Вход: создать/обновить профиль после подтверждения в Telegram (вызывает только Edge Function auth-finish)
create or replace function public.upsert_tg_profile(
  p_user uuid, p_tg_id bigint, p_username text, p_name text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, tg_id, tg_username, display_name)
  values (p_user, p_tg_id, nullif(p_username, ''), left(coalesce(nullif(trim(p_name), ''), 'Атлет'), 64))
  on conflict (id) do update set tg_username = excluded.tg_username;
end $$;

revoke execute on function public.upsert_tg_profile(uuid, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.tg_profiles_done() from public, anon, authenticated;

create index if not exists login_requests_expires_idx on public.login_requests (expires_at);
