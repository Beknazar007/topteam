import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = process.argv[2] ?? fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();
// Заглушки Supabase: роли, схема auth, auth.uid()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); console.log('OK  ', f); }
  catch (e) { console.log('FAIL', f, '\n   ', e.message); process.exit(1); }
}
const U = { owner: '11111111-1111-1111-1111-111111111111', coach: '22222222-2222-2222-2222-222222222222', ath: '33333333-3333-3333-3333-333333333333', out: '44444444-4444-4444-4444-444444444444' };
for (const [k, id] of Object.entries(U)) {
  await db.query(`insert into auth.users values ($1)`, [id]);
  await db.query(`insert into profiles (id, tg_id, display_name) values ($1, $2, $3)`, [id, Math.floor(Math.random()*1e9), k]);
}
const as = async (uid, sql, params=[]) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const expectErr = async (label, p) => { try { await p; console.log('FAIL', label, '— ожидалась ошибка'); process.exitCode = 1; } catch (e) { console.log('OK  ', label, '→', e.message); } };
const ok = (label, cond) => { console.log(cond ? 'OK  ' : 'FAIL', label); if (!cond) process.exitCode = 1; };

const gym = (await as(U.owner, `select * from create_gym('TopTeam Box', 'Бишкек')`)).rows[0];
ok('create_gym: код из 6 символов ' + gym.invite_code, /^[A-Z2-9]{6}$/.test(gym.invite_code));
await as(U.coach, `select join_gym($1)`, [gym.invite_code.toLowerCase()]);
await as(U.ath, `select join_gym($1)`, [gym.invite_code]);
await as(U.ath, `select join_gym($1)`, [gym.invite_code]); // повторно — без ошибок
await expectErr('join_gym с неверным кодом', as(U.out, `select join_gym('ZZZZZZ')`));
await as(U.owner, `select set_member_role($1, $2, 'coach')`, [gym.id, U.coach]);
await expectErr('атлет не может назначать роли', as(U.ath, `select set_member_role($1, $2, 'owner')`, [gym.id, U.ath]));

const xp = (await db.query(`select xp from user_stats where user_id=$1`, [U.ath])).rows[0].xp;
ok('бейдж welcome +25 XP один раз (xp=' + xp + ')', xp === 25);
ok('пост бейджа в ленте один', (await db.query(`select count(*)::int c from feed_items where user_id=$1 and kind='badge'`, [U.ath])).rows[0].c === 1);

const fran = (await db.query(`select id from benchmarks where name='Fran'`)).rows[0].id;
const today = (await db.query(`select bishkek_today()::text d`)).rows[0].d;
const wod = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_benchmark_id => $3)`, [gym.id, today, fran])).rows[0];
ok('create_wod из бенчмарка: ' + wod.title + ' / ' + wod.format + ' / ' + wod.score_type + ' / cap ' + wod.time_cap_sec, wod.title === 'Fran' && wod.score_type === 'time' && wod.time_cap_sec === 600);
ok('уведомления: владелец и атлет (не тренер)', (await db.query(`select count(*)::int c from notifications where kind='new_wod'`)).rows[0].c === 2);
await expectErr('атлет не может создать WOD', as(U.ath, `select create_wod(p_gym => $1, p_date => $2::date, p_title => 'x', p_format => 'other', p_score_type => 'none', p_description => 'x')`, [gym.id, today]));
await expectErr('max_weight без упражнения', as(U.coach, `select create_wod(p_gym => $1, p_date => $2::date, p_title => '1RM', p_format => 'max_weight', p_description => '')`, [gym.id, today]));

// RLS
ok('RLS: чужой не видит зал', (await as(U.out, `select count(*)::int c from gyms`)).rows[0].c === 0);
ok('RLS: чужой не видит WOD', (await as(U.out, `select count(*)::int c from wods`)).rows[0].c === 0);
ok('RLS: чужой видит только свой профиль', (await as(U.out, `select count(*)::int c from profiles`)).rows[0].c === 1);
ok('RLS: атлет видит 3 профиля зала', (await as(U.ath, `select count(*)::int c from profiles`)).rows[0].c === 3);
ok('RLS: атлет не видит очередь уведомлений', (await as(U.ath, `select count(*)::int c from notifications`)).rows[0].c === 0);
ok('RLS: xp_events только свои', (await as(U.ath, `select count(distinct user_id)::int c from xp_events`)).rows[0].c === 1);
await expectErr('нельзя поменять себе tg_id', as(U.ath, `update profiles set tg_id = 1 where id = auth.uid()`));
await expectErr('нельзя накрутить XP напрямую', as(U.ath, `update user_stats set xp = 99999 where user_id = auth.uid()`).then(r => { if (r.affectedRows === 0) throw new Error('0 строк обновлено (RLS)'); }));
await as(U.ath, `update profiles set sex='m', week_goal=4 where id = auth.uid()`);
ok('можно править свой профиль', (await db.query(`select week_goal from profiles where id=$1`, [U.ath])).rows[0].week_goal === 4);
ok('рейтинг-вью работает', (await as(U.ath, `select count(*)::int c from wod_leaderboard`)).rows[0].c === 0);

// ===== Этап 1: вход и онбординг =====
ok('бейдж «Профиль готов» после выбора пола', (await db.query(`select count(*)::int c from user_badges where user_id=$1 and code='profile_done'`, [U.ath])).rows[0].c === 1);
await as(U.ath, `update profiles set sex='f' where id = auth.uid()`);
ok('«Профиль готов» не выдаётся повторно', (await db.query(`select count(*)::int c from xp_events where user_id=$1 and ref_id='profile_done'`, [U.ath])).rows[0].c === 1);
const newU = '55555555-5555-5555-5555-555555555555';
await db.query(`insert into auth.users values ($1)`, [newU]);
await db.query(`select upsert_tg_profile($1, 777, 'aibek', 'Айбек Т.')`, [newU]);
await db.query(`select upsert_tg_profile($1, 777, 'aibek_new', 'Другое имя')`, [newU]);
const np = (await db.query(`select p.display_name, p.tg_username, s.user_id is not null has_stats from profiles p left join user_stats s on s.user_id=p.id where p.id=$1`, [newU])).rows[0];
ok('upsert_tg_profile: имя не перетирается, username обновляется, статистика создана', np.display_name === 'Айбек Т.' && np.tg_username === 'aibek_new' && np.has_stats);
await expectErr('атлет не может вызвать upsert_tg_profile', as(U.ath, `select upsert_tg_profile($1, 1, 'x', 'x')`, [U.ath]));
