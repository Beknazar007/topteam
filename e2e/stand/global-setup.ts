import { execSync } from 'node:child_process';

// Перед прогоном: стенд поднят и наполнен (если уже наполнен сегодня — не сбрасываем).
// Полный сброс: `npm run stand`.
export default function globalSetup() {
  execSync('node stand/start.mjs --keep', { stdio: 'inherit' });
}
