// Публикует программу дня (несколько блоков) в зал от имени владельца — для агента coach-assistant.
// По умолчанию — пробный прогон: показывает, что будет создано, и ничего не пишет.
//   node --env-file=supabase/.env.deploy supabase/scripts/publish-day.mjs <program.json> [--send] [--append]
//
// program.json:
// {
//   "date": "2026-11-25",                // дата по Бишкеку
//   "gym": "TopTeam",                    // название зала (необязательно, по умолчанию TopTeam)
//   "blocks": [
//     { "kind": "warmup", "title": "Разминка", "format": "other", "score_type": "none", "description": "..." },
//     { "kind": "strength", "title": "Back Squat 5x5", "format": "max_weight", "exercise": "Back Squat", "rep_max": 5, "description": "..." },
//     { "kind": "wod", "title": "Fran", "format": "for_time", "score_type": "time", "time_cap_min": 10, "description": "21-15-9 ..." }
//   ]
// }
// kind: warmup | skill | strength | wod | accessory | cooldown
// format: for_time | amrap | emom | max_weight | other;  score_type: time | rounds_reps | reps | weight | none
import fs from 'node:fs';

const REF = 'ayvhxjbhfypzixnuwshy'; // ТОЛЬКО проект topteam
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN не задан (node --env-file=supabase/.env.deploy ...)');

const file = process.argv[2];
if (!file || file.startsWith('--')) throw new Error('Укажи путь к program.json');
const send = process.argv.includes('--send');
const append = process.argv.includes('--append');
const prog = JSON.parse(fs.readFileSync(file, 'utf8'));

async function q(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}
const lit = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || v === '' ? 'null' : String(Number(v)));

// --- проверка входа ---
const KINDS = ['warmup', 'skill', 'strength', 'wod', 'accessory', 'cooldown'];
const FORMATS = ['for_time', 'amrap', 'emom', 'max_weight', 'other'];
const SCORES = ['time', 'rounds_reps', 'reps', 'weight', 'none'];
if (!/^\d{4}-\d{2}-\d{2}$/.test(prog.date ?? '')) throw new Error('date должна быть YYYY-MM-DD');
if (!Array.isArray(prog.blocks) || prog.blocks.length === 0) throw new Error('blocks пуст');
prog.blocks.forEach((b, i) => {
  const n = `блок ${i + 1}`;
  if (!KINDS.includes(b.kind)) throw new Error(`${n}: kind ∉ ${KINDS}`);
  if (!FORMATS.includes(b.format)) throw new Error(`${n}: format ∉ ${FORMATS}`);
  if (b.format !== 'max_weight' && !SCORES.includes(b.score_type)) throw new Error(`${n}: score_type ∉ ${SCORES}`);
  if (b.format === 'max_weight' && !b.exercise) throw new Error(`${n}: для max_weight нужно exercise (название упражнения)`);
  if (!b.title?.trim()) throw new Error(`${n}: нет title`);
});

// --- зал и владелец ---
const gymName = prog.gym ?? 'TopTeam';
const gyms = await q(`select g.id, g.name, m.user_id owner
  from gyms g join gym_members m on m.gym_id = g.id and m.role = 'owner'
  where g.name = ${lit(gymName)} order by m.joined_at limit 1`);
if (!gyms.length) throw new Error(`Зал «${gymName}» с владельцем не найден`);
const { id: gymId, owner } = gyms[0];

// --- упражнения для силовых блоков ---
for (const b of prog.blocks.filter((b) => b.format === 'max_weight')) {
  const ex = await q(`select id, name from exercises where lower(name) = lower(${lit(b.exercise)}) limit 1`);
  if (!ex.length) {
    const like = await q(`select name from exercises where name ilike ${lit('%' + b.exercise + '%')} limit 8`);
    throw new Error(`Упражнение «${b.exercise}» не найдено. Похожие: ${like.map((x) => x.name).join(', ') || 'нет'}`);
  }
  b.exercise_id = ex[0].id;
}

// --- что уже есть в этот день ---
const existing = await q(`select position, kind, title from wods where gym_id = '${gymId}' and wod_date = ${lit(prog.date)} order by position`);

console.log(`Зал: ${gymName} · дата: ${prog.date} · блоков: ${prog.blocks.length}`);
if (existing.length) {
  console.log(`\nУже есть в этот день (${existing.length}):`);
  existing.forEach((w) => console.log(`  · [${w.kind}] ${w.title}`));
}
console.log('\nБудет добавлено:');
prog.blocks.forEach((b, i) =>
  console.log(`  ${i + 1}. [${b.kind}] ${b.title} — ${b.format}${b.score_type ? '/' + b.score_type : ''}` +
    `${b.time_cap_min ? ` · кэп ${b.time_cap_min} мин` : ''}${b.exercise ? ` · ${b.exercise}${b.rep_max ? ' ' + b.rep_max + 'RM' : ''}` : ''}` +
    `\n     ${(b.description ?? '').replace(/\n/g, '\n     ')}`),
);

if (existing.length && !append) {
  console.log('\n⛔ В этот день уже есть блоки. Чтобы добавить к ним — флаг --append.');
  process.exit(2);
}
if (!send) {
  console.log('\n(пробный прогон — ничего не записано; опубликовать: --send)');
  process.exit(0);
}

// --- публикация: от имени владельца, через create_wod (те же проверки, что в приложении) ---
const claims = JSON.stringify({ sub: owner, role: 'authenticated' }).replace(/'/g, "''");
const calls = prog.blocks.map((b) => `select (w).id, (w).title, (w).kind from (select create_wod(
    p_gym => '${gymId}', p_date => ${lit(prog.date)}::date, p_title => ${lit(b.title)},
    p_format => ${lit(b.format)}, p_score_type => ${b.format === 'max_weight' ? 'null' : lit(b.score_type)},
    p_description => ${lit(b.description)}, p_time_cap_sec => ${b.time_cap_min ? num(b.time_cap_min * 60) : 'null'},
    p_exercise_id => ${num(b.exercise_id)}, p_rep_max => ${num(b.rep_max)},
    p_coach_note => ${lit(b.coach_note)}, p_kind => ${lit(b.kind)}) w) s`);
const dryTx = process.argv.includes('--rollback'); // самопроверка скрипта: всё выполнить и откатить
const res = await q(`begin;
  create temp table _pub (id uuid, title text, kind text) on commit drop;
  grant insert, select on _pub to authenticated;
  select set_config('request.jwt.claim.sub', '${owner}', true), set_config('request.jwt.claims', '${claims}', true);
  set local role authenticated;
  ${calls.map((c) => `insert into _pub ${c};`).join('\n  ')}
  reset role;
  select * from _pub;
${dryTx ? 'rollback' : 'commit'};`);
console.log(`\n${dryTx ? '↩️ Проверка с откатом, ничего не сохранено' : '✅ Опубликовано'} · блоков: ${res.length}`);
res.forEach((r, i) => console.log(`  ${i + 1}. [${r.kind}] ${r.title}`));
