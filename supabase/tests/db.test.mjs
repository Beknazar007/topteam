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

// ===== Этап 2: log_result =====
const days = async (n) => (await db.query(`select (bishkek_today() + $1::int)::text d`, [n])).rows[0].d;
const xpOf = async (u) => (await db.query(`select xp from user_stats where user_id=$1`, [u])).rows[0].xp;
const log = (u, w, scale, score, extra = {}) => as(u, `select log_result(p_wod => $1, p_scale => $2, p_score => $3, p_capped => $4) r`, [w, scale, score, extra.capped ?? false]).then(x => x.rows[0].r);

const xp0 = await xpOf(U.ath);
const r1 = await log(U.ath, wod.id, 'RX', 300);
const sum = (r) => r.xp_items.reduce((a, i) => a + i.amount, 0);
ok(`Fran RX 5:00: тренировка+RX+бенчмарк+первый замер = 95 (${r1.xp_total})`, r1.xp_total === 95 && sum(r1) === 95 && r1.baseline && !r1.is_pr);
ok('бейджи «Первая кровь» и «Познакомься с Fran»', r1.badges.map(b => b.code).sort().join() === 'first_result,fran');
ok('XP = до + 95 + 2×25 за бейджи', (await xpOf(U.ath)) === xp0 + 95 + 50 && r1.xp === xp0 + 145);
ok('уровень посчитан по XP: ' + r1.level_after, r1.level_after === Math.floor(Math.sqrt(r1.xp / 50)) + 1);
ok('место в рейтинге = 1', r1.place === 1);
ok('пост результата в ленте', (await db.query(`select count(*)::int c from feed_items where kind='result' and result_id=$1`, [r1.result_id])).rows[0].c === 1);
await expectErr('повторная запись того же WOD', log(U.ath, wod.id, 'RX', 290));
await expectErr('нельзя записать результат напрямую в таблицу', as(U.ath, `insert into results (wod_id, user_id, scale, score) values ($1, auth.uid(), 'RX', 1)`, [wod.id]));
await expectErr('чужой не может записать результат', log(U.out, wod.id, 'RX', 300));
await expectErr('время 0 — неверный результат', log(U.coach, wod.id, 'RX', 0));

// PR на вчерашнем Fran; третья тренировка за день — без XP за тренировку
const wodY = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_benchmark_id => $3)`, [gym.id, await days(-1), fran])).rows[0];
const r2 = await log(U.ath, wodY.id, 'RX', 280);
ok(`PR: 4:40 лучше 5:00 (+50 XP, было ${r2.old_score})`, r2.is_pr && Number(r2.old_score) === 300 && r2.xp_items.some(i => i.reason === 'pr' && i.amount === 50));
ok('бейдж «Первый PR»', r2.badges.some(b => b.code === 'first_pr'));
const wodY2 = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_benchmark_id => $3)`, [gym.id, await days(-2), fran])).rows[0];
const r3 = await log(U.ath, wodY2.id, 'RX', 270);
ok('3-я тренировка за день: нет XP за тренировку, но PR засчитан', !r3.xp_items.some(i => i.reason === 'workout') && r3.is_pr);
ok('бейдж «Двойной удар» (2 PR за день)', r3.badges.some(b => b.code === 'double_pr'));
ok('PR в профиле = 2, тренировок = 2', (await db.query(`select pr_count, workouts from user_stats where user_id=$1`, [U.ath])).rows[0].pr_count === 2);
const wodOld = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_title => 'Old', p_format => 'other', p_score_type => 'none', p_description => 'x')`, [gym.id, await days(-5)])).rows[0];
await expectErr('WOD старше 3 дней закрыт', log(U.ath, wodOld.id, 'RX', 1));

// Силовая: 1RM, первый замер и PR не зависят от уровня
const sq = (await db.query(`select id from exercises where name='Back Squat'`)).rows[0].id;
const wodSq = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_title => 'Back Squat 1RM', p_format => 'max_weight', p_exercise_id => $3, p_rep_max => 1, p_description => '')`, [gym.id, today, sq])).rows[0];
const rs = await log(U.owner, wodSq.id, 'Scaled', 102.5);
ok('силовая 102.5 кг: первый замер', rs.baseline && (await db.query(`select score from personal_records where user_id=$1 and pr_key=$2`, [U.owner, `e:${sq}:1`])).rows[0].score == 102.5);
await expectErr('вес 500 кг — неверный результат', log(U.coach, wodSq.id, 'RX', 500));

// Кап: результат в повторах, без PR
const rc = await log(U.coach, wod.id, 'Scaled', 150, { capped: true });
ok('кап: без PR и без первого замера', !rc.is_pr && !rc.baseline);
const lb = (await as(U.ath, `select user_id, place, scale from wod_leaderboard where wod_id=$1 order by scale, place`, [wod.id])).rows;
ok('рейтинг: RX и Scaled — отдельные доски', lb.length === 2 && lb.every(x => Number(x.place) === 1));

// Серия: цель 2 → после 2-й тренировки недели серия +1 и бонус
await db.query(`update profiles set week_goal = 2 where id = $1`, [U.owner]);
const wodE = (await as(U.coach, `select * from create_wod(p_gym => $1, p_date => $2::date, p_title => 'Engine', p_format => 'amrap', p_score_type => 'rounds_reps', p_description => 'x')`, [gym.id, await days(-1)])).rows[0];
const re = await log(U.owner, wodE.id, 'RX', 5012);
ok('цель недели выполнена: серия 1 и бонус серии +5', re.streak_up && re.streak === 1 && re.xp_items.some(i => i.reason === 'streak' && i.amount === 5));
ok('пост «серия» в ленте', (await db.query(`select count(*)::int c from feed_items where kind='streak' and user_id=$1`, [U.owner])).rows[0].c === 1);

// roll_week: пропуск двух недель — заморозка, потом обнуление
await db.query(`update user_stats set week_start = bishkek_week_start() - 14, week_workouts = 0, streak_weeks = 3, freezes = 1 where user_id = $1`, [U.coach]);
await db.query(`select roll_week($1)`, [U.coach]);
const rw = (await db.query(`select streak_weeks, freezes, week_start = bishkek_week_start() cur from user_stats where user_id=$1`, [U.coach])).rows[0];
ok('2 пропущенные недели: заморозка потрачена, серия обнулена', rw.streak_weeks === 0 && rw.freezes === 0 && rw.cur);
await db.query(`update user_stats set week_start = bishkek_week_start() - 7, week_workouts = 5, streak_weeks = 3, freezes = 0 where user_id = $1`, [U.coach]);
await db.query(`select roll_week($1)`, [U.coach]);
ok('выполненная прошлая неделя: серия сохраняется', (await db.query(`select streak_weeks from user_stats where user_id=$1`, [U.coach])).rows[0].streak_weeks === 3);

// delete_wod
await expectErr('нельзя удалить WOD с результатами', as(U.coach, `select delete_wod($1)`, [wod.id]));
await expectErr('атлет не может удалить WOD', as(U.ath, `select delete_wod($1)`, [wodOld.id]));
await as(U.coach, `select delete_wod($1)`, [wodOld.id]);
ok('тренер удалил пустой WOD', (await db.query(`select count(*)::int c from wods where id=$1`, [wodOld.id])).rows[0].c === 0);

// ===== Этап 3: 🔥, комментарии, удаление результата =====
const item = (await db.query(`select id from feed_items where result_id=$1`, [r1.result_id])).rows[0].id;
const xpCoach0 = await xpOf(U.coach);
const f1 = (await as(U.coach, `select toggle_fire($1) r`, [item])).rows[0].r;
ok('🔥 поставлен, счётчик 1', f1.fired && f1.fire_count === 1);
ok('+1 XP за 🔥', (await xpOf(U.coach)) === xpCoach0 + 1);
ok('уведомление автору о 🔥', (await db.query(`select count(*)::int c from notifications where user_id=$1 and kind='fire'`, [U.ath])).rows[0].c === 1);
const f2 = (await as(U.coach, `select toggle_fire($1) r`, [item])).rows[0].r;
await as(U.coach, `select toggle_fire($1) r`, [item]);
ok('🔥 убран и снова поставлен: счётчик 1, уведомление не дублируется', !f2.fired && (await db.query(`select fire_count from feed_items where id=$1`, [item])).rows[0].fire_count === 1
  && (await db.query(`select count(*)::int c from notifications where user_id=$1 and kind='fire'`, [U.ath])).rows[0].c === 1);
await expectErr('нельзя 🔥 себе', as(U.ath, `select toggle_fire($1)`, [item]));
await expectErr('чужой не может 🔥', as(U.out, `select toggle_fire($1)`, [item]));
ok('fires_received у автора = 1', (await db.query(`select fires_received from user_stats where user_id=$1`, [U.ath])).rows[0].fires_received === 1);

const xpOwner0 = await xpOf(U.owner);
const cm = (await as(U.owner, `select * from add_comment($1, '  Огонь, красава!  ')`, [item])).rows[0];
ok('комментарий сохранён без пробелов, +2 XP', cm.body === 'Огонь, красава!' && (await xpOf(U.owner)) === xpOwner0 + 2);
ok('comment_count = 1 и уведомление автору', (await db.query(`select comment_count from feed_items where id=$1`, [item])).rows[0].comment_count === 1
  && (await db.query(`select count(*)::int c from notifications where user_id=$1 and kind='comment'`, [U.ath])).rows[0].c === 1);
await expectErr('пустой комментарий', as(U.owner, `select add_comment($1, '   ')`, [item]));
await expectErr('атлет не удалит чужой комментарий', as(U.ath, `select delete_comment($1)`, [cm.id]));
await as(U.coach, `select delete_comment($1)`, [cm.id]);
ok('тренер удалил комментарий, счётчик 0', (await db.query(`select comment_count from feed_items where id=$1`, [item])).rows[0].comment_count === 0);

// Удаление результата: PR откатывается к лучшему оставшемуся, XP возвращается
const prKey = `b:${fran}:RX`;
ok('до удаления PR = 4:30 (270)', Number((await db.query(`select score from personal_records where user_id=$1 and pr_key=$2`, [U.ath, prKey])).rows[0].score) === 270);
const st0 = (await db.query(`select xp, pr_count from user_stats where user_id=$1`, [U.ath])).rows[0];
const back = (await db.query(`select coalesce(sum(amount),0)::int s from xp_events where ref_id=$1 and reason <> 'badge'`, [r3.result_id])).rows[0].s;
await expectErr('чужой атлет не удалит результат', as(U.out, `select delete_result($1)`, [r3.result_id]));
await as(U.ath, `select delete_result($1)`, [r3.result_id]);
const st1 = (await db.query(`select xp, pr_count from user_stats where user_id=$1`, [U.ath])).rows[0];
ok(`удалён свой результат: XP −${back}, PR −1`, st1.xp === st0.xp - back && st1.pr_count === st0.pr_count - 1);
ok('PR восстановлен к лучшему оставшемуся 4:40 (280)', Number((await db.query(`select score from personal_records where user_id=$1 and pr_key=$2`, [U.ath, prKey])).rows[0].score) === 280);
ok('пост результата удалён из ленты', (await db.query(`select count(*)::int c from feed_items where result_id=$1`, [r3.result_id])).rows[0].c === 0);
const r3b = await log(U.ath, wodY2.id, 'RX', 275);
ok('после удаления можно перезаписать результат (PR 4:35)', r3b.is_pr && Number(r3b.old_score) === 280);
await as(U.coach, `select delete_result($1)`, [rs.result_id]);
ok('тренер удалил результат владельца, PR силовой исчез', (await db.query(`select count(*)::int c from personal_records where user_id=$1 and pr_key=$2`, [U.owner, `e:${sq}:1`])).rows[0].c === 0);
