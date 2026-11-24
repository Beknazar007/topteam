"""Posts approved videos from videos/registry.json to the Telegram channel.

    python videos/tools/publish_telegram.py            # dry run: shows what would be posted
    python videos/tools/publish_telegram.py --send     # posts and fills published_url / published_at

Only entries with "approved": true, health_review != "required" and status "draft" are posted —
approval is set by a person, never by this script. Each post: the video, its title, «what's new»
from CHANGELOG.md for that app version, and the entry's "comment". Credentials come from videos/.env:
TELEGRAM_BOT_TOKEN (the bot must be an admin of the channel) and TELEGRAM_CHANNEL_ID (@name or -100…).
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "videos" / "registry.json"
CAPTION_LIMIT = 1024  # Telegram's limit for a media caption
LANG_LABEL = {"ky": "🇰🇬 Кыргызча", "ru": "🇷🇺 Русский"}
ROLE_LABEL = {
    "ky": {"athlete": "атлет", "coach": "машыктыруучу", "owner": "зал ээси"},
    "ru": {"athlete": "атлет", "coach": "тренер", "owner": "владелец зала"},
}


def load_env() -> dict[str, str]:
    """videos/.env first; the bot token falls back to supabase/.env — the same bot @TopTeam07Bot posts the videos."""
    env = dict(os.environ)
    for path in (ROOT / "videos" / ".env", ROOT / "supabase" / ".env"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)", line)
                if m and m.group(1) not in env:
                    env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def scenario_title(path: str) -> str:
    first = (ROOT / path).read_text(encoding="utf-8").splitlines()[0]
    return re.sub(r"^#\s*(Видео:\s*)?", "", first).strip()


def whats_new(version: str) -> list[str]:
    """Bullet lines of the CHANGELOG section for this version, without spec links."""
    path = ROOT / "CHANGELOG.md"
    if not path.exists():
        return []
    m = re.search(rf"^## \[{re.escape(version)}\].*?$(.*?)(?=^## \[|\Z)", path.read_text(encoding="utf-8"), flags=re.M | re.S)
    if not m:
        return []
    items = []
    for line in m.group(1).splitlines():
        if line.startswith("### Миграции"):
            break
        if line.lstrip().startswith("- "):
            items.append(re.sub(r"\s*\(спека:.*?\)", "", line.strip()))
    return items


def caption(entry: dict) -> str:
    lang = entry["lang"]
    parts = [
        f"🎬 <b>{escape(scenario_title(entry['scenario']))}</b>",
        f"{LANG_LABEL.get(lang, lang)} · {ROLE_LABEL.get(lang, {}).get(entry['role'], entry['role'])} · v{entry['app_version']}",
    ]
    # A re-recorded single video says only what changed for it; otherwise the whole CHANGELOG section of the version.
    news = entry.get("news") or whats_new(entry["app_version"])
    if news:
        parts.append(("Эмне жаңы:" if lang == "ky" else "Что нового:") + "\n" + "\n".join(escape(n) for n in news))
    if entry.get("comment"):
        parts.append("💬 " + escape(entry["comment"]))
    text = "\n\n".join(parts)
    return text if len(text) <= CAPTION_LIMIT else text[: CAPTION_LIMIT - 1] + "…"


def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def send_video(token: str, chat: str, video: Path, text: str, entry: dict) -> dict:
    boundary = uuid.uuid4().hex
    fields = {"chat_id": chat, "caption": text, "parse_mode": "HTML", "supports_streaming": "true"}
    if entry.get("duration_s"):
        fields["duration"] = str(int(round(entry["duration_s"])))
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="video"; filename="{video.name}"\r\n'
        f"Content-Type: {mimetypes.guess_type(video.name)[0] or 'video/mp4'}\r\n\r\n"
    ).encode()
    body += video.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendVideo",
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        reply = json.loads(r.read())
    if not reply.get("ok"):
        raise RuntimeError(reply)
    return reply["result"]


def post_url(chat: str, message: dict) -> str | None:
    username = message.get("chat", {}).get("username")
    if username:
        return f"https://t.me/{username}/{message['message_id']}"
    if str(chat).startswith("-100"):  # private channel: link works for its members
        return f"https://t.me/c/{str(chat)[4:]}/{message['message_id']}"
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true", help="really post (default: dry run)")
    ap.add_argument("--id", help="only this registry id")
    args = ap.parse_args()

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ready, waiting = [], []
    for e in registry["videos"]:
        if args.id and e["id"] != args.id:
            continue
        if e.get("status") != "draft":
            continue
        if not e.get("approved"):
            waiting.append(f"{e['id']}: ждёт одобрения человеком (approved: true)")
        elif e.get("health_review") == "required":
            waiting.append(f"{e['id']}: ждёт проверки тренером (health_review)")
        elif not (ROOT / e["file"]).exists():
            waiting.append(f"{e['id']}: нет файла {e['file']} — переснять video-producer")
        else:
            ready.append(e)

    for line in waiting:
        print("·", line)
    if not ready:
        print("Публиковать нечего.")
        return

    env = load_env()
    token, chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHANNEL_ID")
    for e in ready:
        text = caption(e)
        print(f"\n=== {e['id']} → {chat or '<TELEGRAM_CHANNEL_ID не задан>'}\n{text}")
        if not args.send:
            continue
        if not token or not chat:
            sys.exit("TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID не заданы в videos/.env")
        message = send_video(token, chat, ROOT / e["file"], text, e)
        e["status"] = "published"
        e["published_url"] = post_url(chat, message)
        e["published_at"] = datetime.now(ZoneInfo("Asia/Bishkek")).isoformat(timespec="seconds")
        if e.get("replaces"):
            for old in registry["videos"]:
                if old["id"] == e["replaces"]:
                    old["status"] = "outdated"
        REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"опубликовано: {e['published_url'] or message['message_id']}")
    if not args.send:
        print("\nЭто пробный прогон. Отправить: --send")


if __name__ == "__main__":
    main()
