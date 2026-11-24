# Конвейер видеоуроков

Сценарий `videos/scenarios/<feature>.md` → запись экрана телефона (Playwright, системный Chrome) → озвучка (edge-tts или ElevenLabs) → склейка с субтитрами и фоновой музыкой (ffmpeg).
Запись идёт **только на локальном стенде** с выдуманными людьми (`e2e/README.md`). Прод не записывается никогда — там реальные атлеты; запросы к проду в записи заблокированы.

## Установка (один раз)

```bash
cd e2e && npm ci && cd ..                     # стенд (нужен Docker: Colima запускается сам)
cd apps/web && npm install && cd ..
python3.12 -m venv videos/tools/.venv
videos/tools/.venv/bin/pip install -r videos/tools/requirements.txt
videos/tools/.venv/bin/python -m playwright install ffmpeg      # кодек записи Playwright (браузер не нужен — берётся Chrome)
```

ffmpeg/ffprobe — из PATH (`brew install ffmpeg`); если их нет, `static-ffmpeg` скачает сборку сам.

## Запись

```bash
videos/tools/.venv/bin/python videos/tools/make_video.py videos/scenarios/log-result.md            # языки из строки langs: сценария
videos/tools/.venv/bin/python videos/tools/make_video.py videos/scenarios/log-result.md --lang ru --role athlete
```

Скрипт сам сбрасывает и наполняет стенд (`e2e/stand/start.mjs`) перед **каждым** видео, поднимает фронтенд на :5187 и гасит его в конце.

Результат в `videos/output/<feature>/`:

| файл | что это |
|---|---|
| `<role>-<lang>.mp4` | H.264 + AAC, субтитры вшиты отдельной дорожкой |
| `<role>-<lang>.srt` | те же субтитры файлом |
| `frames/<role>-<lang>-{start,middle,end}.png` | три кадра для проверки |
| `manifest.json` | длительность, голос, хэш сценария, версия приложения, `health_review`, `native_speaker_review` |

mp4 и кадры в git не попадают, `.srt` и `manifest.json` — попадают.

## Голоса — `voices.json`

| язык | edge-tts (бесплатно) | ElevenLabs |
|---|---|---|
| ru | `ru-RU-SvetlanaNeural` | `eleven_v3`, голос Oleg |
| ky | `kk-KZ-AigulNeural` — **казахский** голос, кыргызского в edge-tts нет | `eleven_v3`, голос Alymbek (кыргызский) |

ElevenLabs включается, если в `videos/.env` есть `ELEVENLABS_API_KEY`. `ru-RU-DmitryNeural` в edge-tts сейчас обрывает длинные фразы — не использовать.
Реплики кэшируются в `videos/.voice-cache/`: при пересъёмке неизменённые не озвучиваются заново.

## Фоновая музыка — `audio/bed.mp3`

Тихо под голосом (0.22, при речи приглушается). Трек владельца (ElevenLabs Music), общий с видео Медресе. Без фона — `--no-bed`.
Добавить фон к готовому видео: `videos/tools/.venv/bin/python videos/tools/add_bed.py <mp4>` (не дважды на один файл).

## Публикация в Telegram

Публикует бот **@TopTeam07Bot** (его токен берётся из `supabase/.env`), он должен быть администратором канала с правом публиковать.
Канал — в `videos/.env` (git-ignored):
```
TELEGRAM_CHANNEL_ID=@имя_канала        # или -100… для закрытого канала
```

```bash
videos/tools/.venv/bin/python videos/tools/publish_telegram.py          # пробный прогон: что и с какой подписью уйдёт
videos/tools/.venv/bin/python videos/tools/publish_telegram.py --send   # отправить (только после «да» человека)
```

Уходят только записи `videos/registry.json` со `status: "draft"`, `"approved": true` и `health_review` ≠ `required`.
С Mac владельца `api.telegram.org` иногда недоступен — если отправка висит, повторить позже или из другой сети.
