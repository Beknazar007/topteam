// Применяет новые миграции к продовой БД через Supabase Management API (без пароля БД и Docker).
// Ведёт ту же таблицу supabase_migrations.schema_migrations, что и `supabase db push`.
//   SUPABASE_ACCESS_TOKEN=sbp_... node supabase/scripts/migrate.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'ayvhxjbhfypzixnuwshy'; // ТОЛЬКО проект topteam
const token = process.env.SUPABASE_ACCESS_TOKEN;
const dry = process.argv.includes('--dry-run');
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN не задан');

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

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

await q(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
let applied = new Set((await q(`select version from supabase_migrations.schema_migrations`)).map((r) => r.version));

// Первые 4 миграции были применены вручную через SQL Editor — отмечаем их, если схема уже есть
if (applied.size === 0) {
  const [{ exists }] = await q(`select to_regclass('public.profiles') is not null as exists`);
  if (exists) {
    const boot = files.filter((f) => f.split('_')[0] <= '20261111000004');
    console.log('Схема уже есть — отмечаю как применённые:', boot.join(', '));
    if (!dry) {
      const values = boot.map((f) => `('${f.split('_')[0]}', '${f.replace(/^\d+_|\.sql$/g, '')}')`).join(',');
      await q(`insert into supabase_migrations.schema_migrations (version, name) values ${values} on conflict do nothing`);
    }
    applied = new Set(boot.map((f) => f.split('_')[0]));
  }
}

const pending = files.filter((f) => !applied.has(f.split('_')[0]));
if (!pending.length) console.log('Новых миграций нет.');
for (const f of pending) {
  const version = f.split('_')[0];
  const name = f.replace(/^\d+_|\.sql$/g, '');
  console.log(`${dry ? '[dry-run] ' : ''}→ ${f}`);
  if (dry) continue;
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  const tag = '$mig' + version + '$';
  if (sql.includes(tag)) throw new Error('конфликт dollar-quote в ' + f);
  // Одна транзакция: миграция + запись в журнал
  await q(`begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements)
values ('${version}', '${name}', array[${tag}${sql}${tag}]);\ncommit;`);
  console.log('   ✓ применена');
}
