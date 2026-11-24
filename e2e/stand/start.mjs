// Поднимает стенд с нуля: локальный Supabase (Docker/Colima) → чистая база со всеми миграциями → сид.
//   node stand/start.mjs            — запустить и наполнить
//   node stand/start.mjs --keep     — не сбрасывать базу, если стенд уже наполнен
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
const quiet = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: 'pipe' }).toString(); } catch { return null; } };
const CLI = 'npx --yes supabase@3.1.0';
// Только нужные сервисы: база, auth, REST. Остальное стенду не нужно и долго стартует.
const EXCLUDE = 'studio,storage-api,imgproxy,logflare,vector,realtime,edge-runtime,supavisor,mailpit,postgres-meta';

if (quiet('docker info --format "{{.ServerVersion}}"') === null) {
  console.log('Docker не запущен — запускаю Colima…');
  sh('colima start --cpu 4 --memory 6');
}
if (!quiet(`${CLI} status`)) sh(`${CLI} start -x ${EXCLUDE}`);

const marker = path.join(root, 'e2e/.stand-today');
const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
if (process.argv.includes('--keep') && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === today) {
  console.log('Стенд уже наполнен сегодня — оставляю как есть');
} else {
  sh(`${CLI} db reset --local --no-seed`);
  sh('node e2e/stand/seed.mjs');
  fs.writeFileSync(marker, today);
}
