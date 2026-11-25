// Наполняет ЛОКАЛЬНЫЙ стенд: люди, зал «Стенд Бокс», программа за 7 дней + завтра, результаты, номинации.
// Всё создаётся через те же RPC, что и в приложении (create_gym, join_gym, create_wod, log_result).
//   node stand/seed.mjs        (база должна быть свежей: stand/start.mjs делает `supabase db reset`)
import pg from 'pg';
import { API_URL, DB_URL, SERVICE_KEY, PASSWORD, assertLocal } from './env.mjs';
import { GYM, PEOPLE, emailOf } from './people.mjs';

assertLocal(API_URL);
assertLocal(DB_URL.replace('postgresql', 'http'));
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();

// --- пользователи (GoTrue admin API) + профили ---
const ids = {};
for (const [key, p] of Object.entries(PEOPLE)) {
  const res = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOf(p.tg), password: PASSWORD, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`auth user ${key}: ${JSON.stringify(body)}`);
  ids[key] = body.id;
  await db.query(
    `insert into profiles (id, tg_id, tg_username, display_name) values ($1, $2, $3, $4)
     on conflict (id) do update set display_name = excluded.display_name`,
    [body.id, p.tg, `stand_${key}`, p.name],
  );
  // sex — отдельным update: на нём висит триггер «онбординг пройден»
  if (p.sex) await db.query(`update profiles set sex = $2 where id = $1`, [body.id, p.sex]);
}

/** Выполнить SQL от имени пользователя (как запрос из приложения) */
async function as(key, sql, params = []) {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: ids[key], role: 'authenticated' }),
      ids[key],
    ]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows;
  } catch (e) {
    await db.query('rollback');
    throw new Error(`${key}: ${e.message}\n${sql}`);
  }
}

// --- зал ---
const [gym] = await as('owner', `select * from create_gym($1, $2)`, [GYM.name, GYM.city]);
await db.query(`update gyms set invite_code = $2 where id = $1`, [gym.id, GYM.code]);
gym.invite_code = GYM.code;
for (const [key, p] of Object.entries(PEOPLE)) {
  if (!p.role || p.role === 'owner') continue;
  await as(key, `select join_gym($1)`, [gym.invite_code]);
  if (p.role === 'coach') await as('owner', `select set_member_role($1, $2, 'coach')`, [gym.id, ids[key]]);
}

// --- программа: 7 дней назад … сегодня (завтра пусто — тренер собирает его в видео и тестах) ---
const [{ today }] = (await db.query(`select bishkek_today()::text today`)).rows;
const day = (n) => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const [{ id: squat }] = (await db.query(`select id from exercises where name = 'Back Squat'`)).rows;
const [{ id: fran }] = (await db.query(`select id from benchmarks where name = 'Fran'`)).rows;

const program = (n) => [
  { kind: 'warmup', title: 'Разминка', format: 'other', score: 'none', desc: '3 раунда:\n10 air squat\n10 PVC pass-through\n200 м бег' },
  n % 2 === 0
    ? { kind: 'strength', title: 'Back Squat 5RM', format: 'max_weight', exercise: squat, rm: 5, desc: 'Найти 5RM за 15 минут' }
    : { kind: 'skill', title: 'Техника: double-unders', format: 'other', score: 'none', desc: '10 минут практики' },
  n === -3
    ? { kind: 'wod', benchmark: fran }
    : n % 2 === 0
      ? { kind: 'wod', title: 'AMRAP 12', format: 'amrap', score: 'rounds_reps', cap: 12, desc: '12 мин AMRAP:\n10 kettlebell swings 24/16\n10 box jumps\n10 wall balls 9/6' }
      : { kind: 'wod', title: 'Пятничный чиппер', format: 'for_time', score: 'time', cap: 20, desc: 'For time:\n50 cal row\n40 burpees\n30 thrusters 40/30\n20 pull-ups' },
];
const wods = [];
for (let n = -7; n <= 0; n++) {
  for (const b of program(n)) {
    const [w] = await as(
      'coach',
      `select * from create_wod(p_gym => $1, p_date => $2::date, p_title => $3, p_format => $4, p_score_type => $5,
         p_description => $6, p_time_cap_sec => $7, p_benchmark_id => $8, p_exercise_id => $9, p_rep_max => $10, p_kind => $11)`,
      [gym.id, day(n), b.title ?? null, b.format ?? null, b.format === 'max_weight' ? null : (b.score ?? null), b.desc ?? null,
       b.cap ? b.cap * 60 : null, b.benchmark ?? null, b.exercise ?? null, b.rm ?? null, b.kind],
    );
    wods.push({ ...w, n });
  }
}

// --- результаты (детерминированно): атлеты ходят по своим графикам ---
await db.query(`update game_config set value = 30 where key = 'result.max_age_days'`);
const athletes = ['athlete', 'nurlan', 'ermek', 'aizhan', 'sezim', 'coach'];
const goes = { athlete: [-7, -6, -5, -3, -2, -1], nurlan: [-7, -5, -3, -1, 0], ermek: [-6, -4, -3, -2, 0], aizhan: [-7, -6, -3, -1, 0], sezim: [-5, -3, -2], coach: [-4, -1] };
const seed = (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280);
for (const [i, key] of athletes.entries()) {
  const rnd = seed(i + 7);
  const scale = PEOPLE[key].sex === 'f' ? (i % 2 ? 'RX' : 'Scaled') : (i % 3 ? 'RX' : 'Scaled');
  for (const w of wods.filter((w) => goes[key].includes(w.n) && !['warmup', 'cooldown'].includes(w.kind))) {
    let score;
    if (w.score_type === 'time') score = Math.round(300 + rnd() * 600);
    else if (w.score_type === 'rounds_reps') score = (5 + Math.floor(rnd() * 5)) * 1000 + Math.floor(rnd() * 30);
    else if (w.score_type === 'weight') score = (PEOPLE[key].sex === 'f' ? 50 : 90) + Math.round(rnd() * 40) + (w.n + 7) * 2.5;
    else if (w.score_type === 'reps') score = Math.round(50 + rnd() * 100);
    else score = 1;
    await as(key, `select log_result($1, $2, $3)`, [w.id, scale, score]);
  }
}
await db.query(`update game_config set value = 3 where key = 'result.max_age_days'`);

// Время записи — вечер того дня, как в жизни (для «во сколько записывает» в мониторинге)
await db.query(`update results r set created_at = (w.wod_date + time '19:30' + (random() * interval '2 hours')) - interval '6 hours'
  from wods w where w.id = r.wod_id and w.wod_date < bishkek_today()`);

// --- подиумы и номинации за прошедшие дни ---
for (let n = -7; n <= -1; n++) await db.query(`select daily_podium($1::date)`, [day(n)]);
for (let n = -7; n <= -1; n++) await db.query(`select award_nominations($1, 'day', $2::date)`, [gym.id, day(n)]);

await db.end();
console.log(`Стенд готов: зал «${GYM.name}» (код ${gym.invite_code}), сегодня ${today}, блоков ${wods.length}, людей ${Object.keys(ids).length}`);
