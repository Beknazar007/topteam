"""Records a narrated how-to video from a scenario file: Playwright screen capture → TTS → ffmpeg.

    videos/tools/.venv/bin/python videos/tools/make_video.py videos/scenarios/log-result.md          # languages from `langs:`
    videos/tools/.venv/bin/python videos/tools/make_video.py videos/scenarios/log-result.md --lang ru --role athlete

Starts its own stand (local Supabase reset + seeded with made-up people, see e2e/README.md, and a Vite
dev server pointed at it) unless --base-url is given. Never point --base-url at production: the video
would show real athletes. Output: videos/output/<feature>/<role>-<lang>.mp4 / .srt, frames/, manifest.json.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
HEALTH_MARK = "ТРЕБУЕТ ПРОВЕРКИ ТРЕНЕРОМ"
# Local stand (e2e/stand/env.mjs): well-known Supabase CLI demo keys for 127.0.0.1, not secrets.
STAND_API = "http://127.0.0.1:54321"
STAND_ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9."
    "CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
)
STAND_PASSWORD = "stand-password-1"
STAND_STORAGE_KEY = "sb-127-auth-token"
# "slides": the drawn phone in videos/tools/slides/phone.html (browser menus, home screen).
# "phone": phone-sized but without mobile emulation — for videos that start with an animation
# (slides/*.html): Chrome's mobile emulation crops or blanks screencast frames of such pages.
DEVICES = {"mobile": {"width": 390, "height": 844}, "phone": {"width": 390, "height": 844}, "desktop": {"width": 1280, "height": 800}, "slides": {"width": 540, "height": 960}}
# Breathing room so a line never starts on the very first frame or gets cut at the end.
LEAD_IN_S, TAIL_S, AFTER_LINE_S = 0.8, 1.5, 0.4


# ---------------------------------------------------------------- scenario file


@dataclass
class Scenario:
    feature: str
    role: str
    device: str
    steps: list[dict]
    lines: dict[str, dict[str, str]]  # key -> {lang: text}
    health: bool
    langs: list[str]
    source: Path
    sha256: str


def parse_scenarios(path: Path) -> list[Scenario]:
    text = path.read_text(encoding="utf-8")
    head = text.split("\n## ", 1)[0]
    header = dict(re.findall(r"(\w+):\s*([\w.\-]+)", head))
    langs_m = re.search(r"langs:\s*([a-z, ]+)", head)
    langs = [x.strip() for x in langs_m.group(1).split(",") if x.strip()] if langs_m else ["ru"]
    feature = header.get("feature") or path.stem
    lines = _parse_voice_table(text)
    sha = hashlib.sha256(text.encode("utf-8")).hexdigest()

    # One file may hold several roles: "## Сценарий: teacher" sections, each with its own steps.
    sections = re.split(r"^## Сценарий:\s*([\w-]+)\s*$", text, flags=re.M)
    if len(sections) == 1:
        chunks = [(header.get("role", "athlete"), text)]
    else:
        chunks = list(zip(sections[1::2], sections[2::2]))

    result = []
    for role, chunk in chunks:
        m = re.search(r"```yaml\n(.*?)```", chunk, flags=re.S)
        if not m:
            sys.exit(f"{path}: no ```yaml steps block for role {role}")
        steps = yaml.safe_load(m.group(1)) or []
        for step in steps:
            key = step.get("say")
            if key and key not in lines:
                sys.exit(f"{path}: step {step.get('id')} says '{key}', but there is no such row in «Озвучка»")
        device = re.search(r"device:\s*(\w+)", chunk)
        result.append(
            Scenario(
                feature=feature,
                role=role,
                device=(device.group(1) if device else header.get("device", "mobile")),
                steps=steps,
                lines=lines,
                health=HEALTH_MARK in text,
                langs=langs,
                source=path,
                sha256=sha,
            )
        )
    return result


def _parse_voice_table(text: str) -> dict[str, dict[str, str]]:
    part = text.split("## Озвучка", 1)
    if len(part) < 2:
        return {}
    rows = [r for r in part[1].splitlines() if r.strip().startswith("|")]
    if not rows:
        return {}
    head = [c.strip() for c in rows[0].strip("|").split("|")]
    langs = [re.match(r"(\w+)", h).group(1) for h in head[1:]]  # "ky (кыргызча)" -> "ky"
    table = {}
    for row in rows[2:]:  # skip header and |---|
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if cells and cells[0]:
            table[cells[0]] = {lang: cell.replace(f"⚠ {HEALTH_MARK}", "").strip() for lang, cell in zip(langs, cells[1:])}
    return table


# ---------------------------------------------------------------- helpers


def ffmpeg_bins() -> tuple[str, str]:
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if ffmpeg and ffprobe:
        return ffmpeg, ffprobe
    import static_ffmpeg.run  # downloads a pinned build on first use

    return static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()


def duration(ffprobe: str, path: Path) -> float:
    out = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def stand_session(role: str) -> str:
    """Session JSON of a stand person (password login instead of Telegram), for localStorage."""
    people = (ROOT / "e2e" / "stand" / "people.mjs").read_text(encoding="utf-8")
    m = re.search(rf"^\s*{re.escape(role)}:\s*{{\s*tg:\s*(\d+)", people, flags=re.M)
    if not m:
        sys.exit(f"login: no stand person '{role}' in e2e/stand/people.mjs")
    req = urllib.request.Request(
        f"{STAND_API}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": f"tg_{m.group(1)}@users.topteam.local", "password": STAND_PASSWORD}).encode(),
        headers={"apikey": STAND_ANON, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode()


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


# ---------------------------------------------------------------- stand


@dataclass
class Stand:
    """Local Supabase (Docker/Colima) reset + seeded by e2e/stand/start.mjs, and a Vite dev server pointed at it."""
    frontend_port: str = field(default_factory=lambda: os.environ.get("VIDEO_FRONTEND_PORT", "5187"))
    procs: list[subprocess.Popen] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.frontend_port}"

    def reset(self) -> None:
        # Fresh data for every video: results logged while recording one video must not leak into the next.
        subprocess.run(["node", str(ROOT / "e2e" / "stand" / "start.mjs")], cwd=ROOT, check=True)

    def start(self) -> None:
        self.reset()
        log_dir = ROOT / "e2e" / "test-results"
        log_dir.mkdir(parents=True, exist_ok=True)
        log = open(log_dir / "video-stand.log", "w", encoding="utf-8")
        npm = shutil.which("npm") or "npm"
        # Process env beats apps/web/.env.local, so the app talks to the stand, never to production.
        fe_env = {**os.environ, "VITE_SUPABASE_URL": STAND_API, "VITE_SUPABASE_ANON_KEY": STAND_ANON,
                  "VITE_TELEGRAM_BOT_USERNAME": "TopTeamStandBot"}
        self.procs.append(
            subprocess.Popen([npm, "--prefix", str(ROOT / "apps" / "web"), "run", "dev", "--", "--port", self.frontend_port,
                              "--strictPort", "--host", "127.0.0.1"], env=fe_env, stdout=log, stderr=log)
        )
        self._wait(self.url)

    def _wait(self, url: str, timeout: float = 120) -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                urllib.request.urlopen(url, timeout=2)
                return
            except Exception:
                if any(p.poll() is not None for p in self.procs):
                    self.stop()
                    sys.exit("stand process exited early — see e2e/test-results/video-stand.log")
                time.sleep(0.5)
        self.stop()
        sys.exit(f"stand did not answer at {url}")

    def stop(self) -> None:
        for p in self.procs:
            if p.poll() is None:
                p.terminate()
        self.procs.clear()


# ---------------------------------------------------------------- pipeline


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    path = ROOT / "videos" / ".env"  # git-ignored: ELEVENLABS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)", line)
            if m and m.group(1) not in env:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def pick_voice(lang: str, voices: dict, env: dict) -> dict:
    """ElevenLabs when it is configured for this language and a key is in .env, otherwise edge-tts."""
    cfg = voices[lang]
    eleven = cfg.get("elevenlabs") or {}
    if eleven.get("voice_id") and env.get("ELEVENLABS_API_KEY"):
        return {"provider": "elevenlabs", "name": f"elevenlabs:{eleven['model']}:{eleven['voice_id']}", **eleven,
                "api_key": env["ELEVENLABS_API_KEY"], "lang": lang}
    return {"provider": "edge", "name": cfg["voice"], "voice": cfg["voice"], "note": cfg.get("note")}


def elevenlabs_tts(text: str, voice: dict, path: Path) -> None:
    body = {"text": text, "model_id": voice["model"]}
    if voice.get("language_code"):
        body["language_code"] = voice["language_code"]
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice['voice_id']}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": voice["api_key"], "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read().decode(errors='replace')[:300]}")


VOICE_CACHE = ROOT / "videos" / ".voice-cache"


async def synthesize(lines: dict[str, str], voice: dict, out_dir: Path) -> dict[str, Path]:
    # Re-recording a video after a UI change keeps most lines word for word: take those from the cache
    # instead of paying ElevenLabs for them again. The key covers everything that changes the sound.
    VOICE_CACHE.mkdir(parents=True, exist_ok=True)
    paths = {}
    for key, text in lines.items():
        ident = json.dumps([voice["provider"], voice.get("voice"), voice.get("voice_id"), voice.get("model"), voice.get("language_code"), text], ensure_ascii=False)
        cached = VOICE_CACHE / f"{hashlib.sha256(ident.encode('utf-8')).hexdigest()[:16]}.mp3"
        if not cached.exists():
            if voice["provider"] == "elevenlabs":
                elevenlabs_tts(text, voice, cached)
            else:
                import edge_tts

                # The free edge-tts endpoint drops a request now and then: retry before giving up.
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(text, voice["voice"]).save(str(cached))
                        break
                    except edge_tts.exceptions.NoAudioReceived:
                        if attempt == 3:
                            raise
                        await asyncio.sleep(2 * (attempt + 1))
        path = out_dir / f"{key}.mp3"
        shutil.copyfile(cached, path)
        paths[key] = path
    return paths


def spotlight(locator) -> None:
    # Headless video has no mouse pointer — outline the element so the viewer sees where to tap.
    locator.scroll_into_view_if_needed()
    locator.evaluate(
        """el => { const o = el.style.outline; el.style.outline = '3px solid #f5a623';
                    el.style.outlineOffset = '2px'; setTimeout(() => { el.style.outline = o; }, 900); }"""
    )


def locate(page, target: str):
    """`label=…`, `role=x[name="…"]` or any Playwright selector; parts chained with ` >> ` narrow the search
    (e.g. `role=dialog >> label=Пароль`)."""
    node = page
    for part in target.split(" >> "):
        part = part.strip()
        m = re.fullmatch(r'role=(\w+)(?:\[name="(.+)"\])?', part)
        if part.startswith("label="):
            text = part[6:]
            # label="…" in quotes = label starts with the text: «Роль» must not also find «Пароль»
            # (required fields end with « *», so an exact match would miss them).
            if len(text) > 1 and text[0] == text[-1] == '"':
                node = node.get_by_label(re.compile("^" + re.escape(text.strip('"'))))
            else:
                node = node.get_by_label(text)
        elif m:
            node = node.get_by_role(m.group(1), name=m.group(2)) if m.group(2) else node.get_by_role(m.group(1))
        else:
            node = node.locator(part)  # text=…, css, etc.
    return node.first


def place(target: str, base_url: str) -> str:
    """Absolute URL for a goto target: /path on the stand, {base} = stand URL, {tools} = videos/tools as file://."""
    target = target.replace("{base}", base_url).replace("{tools}", TOOLS.as_uri())
    return base_url + target if target.startswith("/") else target


def record(sc: Scenario, lang: str, base_url: str, clips: dict[str, Path], clip_len: dict[str, float], work: Path,
           lines_text: dict[str, str]):
    from playwright.sync_api import sync_playwright

    size = DEVICES.get(sc.device, DEVICES["mobile"])
    cues = []  # (start, end, key)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")  # system Chrome: no browser download needed
        ctx = browser.new_context(
            viewport=size, record_video_dir=str(work), record_video_size=size,
            is_mobile=sc.device == "mobile", has_touch=sc.device == "mobile", locale="ru-RU", timezone_id="Asia/Bishkek",
        )
        # Block production outright: a recording must only ever show the stand's made-up people.
        ctx.route(re.compile(r"supabase\.co|topteam-kl7\.pages\.dev|api\.telegram\.org"), lambda route: route.abort())
        page = ctx.new_page()
        t0 = time.monotonic()  # the video starts with the page
        # Neutral first frame while the lead-in plays: the scenario's first page, else the login page.
        first = sc.steps[0] if sc.steps else {}
        page.goto(place(first["target"], base_url) if first.get("action") == "goto" else base_url + "/login")
        page.wait_for_load_state("networkidle")
        page.wait_for_load_state("networkidle")
        time.sleep(LEAD_IN_S)

        for step in sc.steps:
            started = time.monotonic()
            key = step.get("say")
            if key:
                cues.append((started - t0, started - t0 + clip_len[key], key))
            # target/value may differ per language: {ky: …, ru: …} (a note typed in that language, a language to pick).
            raw_target, raw_value = step.get("target"), step.get("value")
            raw_target = raw_target.get(lang) if isinstance(raw_target, dict) else raw_target
            raw_value = raw_value.get(lang) if isinstance(raw_value, dict) else raw_value
            action, target, value = step["action"], raw_target, raw_value
            if action == "login":  # off-topic part of most videos: enter as a stand person (no Telegram on the stand)
                # Works from any page (also the file:// animation): the session is put into the stand's
                # localStorage on the next stand page load, once per tab, so a later logout stays a logout.
                page.context.add_init_script(
                    "if (location.origin === %s && !sessionStorage.getItem('__stand_login')) {"
                    " sessionStorage.setItem('__stand_login', '1'); localStorage.setItem(%s, %s); }"
                    % (json.dumps(base_url), json.dumps(STAND_STORAGE_KEY), json.dumps(stand_session(str(value))))
                )
                page.goto(place(target or "/", base_url))
                page.wait_for_load_state("networkidle")
            elif action == "goto":
                url = place(target, base_url)
                if page.url != url:
                    page.goto(url)
                    page.wait_for_load_state("networkidle")
            elif action == "press":  # a key, e.g. Escape to close the side menu
                page.keyboard.press(str(value))
            elif action == "eval":  # drive the drawn phone: show('sheet')
                page.evaluate(target)
            elif action == "click":
                loc = locate(page, target)
                spotlight(loc)
                time.sleep(0.5)
                loc.click()
            elif action == "fill":
                loc = locate(page, target)
                spotlight(loc)
                if loc.get_attribute("type") in ("date", "time", "datetime-local"):
                    loc.fill(str(value))  # pickers take the whole value; typing it letter by letter garbles it
                else:
                    loc.click()
                    loc.press_sequentially(str(value), delay=90)  # typed letter by letter, like a person
            elif action == "scroll":
                locate(page, target).scroll_into_view_if_needed()
            elif action == "select":
                locate(page, target).select_option(str(value))
            elif action == "highlight":
                spotlight(locate(page, target))
            elif action == "wait":
                if target and target.startswith("/"):
                    page.wait_for_url(f"**{target}", timeout=15000)
                elif target:
                    locate(page, target).wait_for(timeout=15000)
            else:
                raise SystemExit(f"step {step.get('id')}: unknown action '{action}'")
            if key:  # pages that can show the line on screen (phone.html) do — Telegram's player hides .srt tracks
                page.evaluate("t => window.__caption && window.__caption(t)", lines_text[key])
            # Hold the step until the line is spoken and the viewer has had `pause` seconds.
            hold = max(float(step.get("pause", 1.0)), (clip_len[key] + AFTER_LINE_S) if key else 0)
            left = hold - (time.monotonic() - started)
            if left > 0:
                time.sleep(left)

        time.sleep(TAIL_S)
        video = Path(page.video.path())
        ctx.close()
        browser.close()
    return video, cues


BED = TOOLS / "audio" / "bed.mp3"
# Background music under the narration: the owner's video-kit track (ElevenLabs Music, own account), shared
# with the Medrese videos. Kept far below the voice and pushed down further while someone speaks.
BED_VOLUME = 0.22  # same level as the Aiken video kit


def bed_filter(voice: str, bed_input: int, length: float, out: str) -> list[str]:
    """Filter-graph pieces that loop the bed to `length`, fade it, duck it under `voice` and mix both into `out`."""
    fade_out = max(length - 2.0, 0)
    return [
        # Same format on both sides, or sidechaincompress cannot pair the streams (mono voice vs stereo bed).
        f"[{voice}]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[vmix][vkey]",
        f"[{bed_input}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={BED_VOLUME},"
        f"atrim=0:{length:.2f},afade=t=in:d=1.5,afade=t=out:st={fade_out:.2f}:d=2[bedraw]",
        "[bedraw][vkey]sidechaincompress=threshold=0.015:ratio=6:attack=30:release=600[bed]",
        f"[vmix][bed]amix=inputs=2:normalize=0:duration=first[{out}]",
    ]


def mix(ffmpeg: str, video: Path, cues, clips: dict[str, Path], srt: Path, out: Path, bed: Path | None = None, length: float = 0) -> None:
    args = [ffmpeg, "-y", "-loglevel", "error", "-i", str(video)]
    for _, _, key in cues:
        args += ["-i", str(clips[key])]
    args += ["-i", str(srt)]
    parts = [f"[{i + 1}:a]adelay={int(start * 1000)}:all=1[a{i}]" for i, (start, _, _) in enumerate(cues)]
    voice_out = "voice" if bed else "aout"
    # apad + atrim make the voice track as long as the picture, so the bed runs to the last frame.
    pad = f",apad,atrim=0:{length:.2f}" if bed else ""
    parts.append("".join(f"[a{i}]" for i in range(len(cues))) + f"amix=inputs={len(cues)}:normalize=0{pad}[{voice_out}]")
    if bed:
        args += ["-stream_loop", "-1", "-i", str(bed)]
        parts += bed_filter("voice", len(cues) + 2, length, "aout")
    args += [
        "-filter_complex", ";".join(parts),
        "-map", "0:v", "-map", "[aout]", "-map", f"{len(cues) + 1}:s",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-c:s", "mov_text", "-metadata:s:s:0", "language=" + ("kir" if out.stem.endswith("-ky") else "rus"),
        # A looped bed is endless: bound the output by the picture so ffmpeg always finishes.
        *(["-t", f"{length:.2f}"] if bed else []),
        "-movflags", "+faststart", str(out),
    ]
    subprocess.run(args, check=True)


def frames(ffmpeg: str, video: Path, length: float, out_dir: Path) -> list[str]:
    out_dir.mkdir(exist_ok=True)
    names = []
    for label, at in (("start", 0.1), ("middle", 0.5), ("end", 0.9)):
        path = out_dir / f"{video.stem}-{label}.png"
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-ss", f"{length * at:.2f}", "-i", str(video), "-frames:v", "1", str(path)], check=True)
        names.append(str(path.relative_to(ROOT).as_posix()))
    return names


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenario", type=Path)
    ap.add_argument("--lang", help="comma-separated languages (default: the scenario's `langs:`, else ru)")
    ap.add_argument("--role", help="only this role from the scenario file")
    ap.add_argument("--base-url", help="use an already running local stand instead of starting one")
    ap.add_argument("--no-bed", action="store_true", help="narration only, without the background ambience")
    args = ap.parse_args()

    if args.base_url and not re.match(r"https?://(localhost|127\.0\.0\.1)(:\d+)?", args.base_url):
        sys.exit("--base-url must be a local stand (localhost) — production shows real athletes")

    voices = json.loads((TOOLS / "voices.json").read_text(encoding="utf-8"))
    env = load_env()
    ffmpeg, ffprobe = ffmpeg_bins()
    scenarios = [s for s in parse_scenarios(args.scenario.resolve()) if not args.role or s.role == args.role]
    if not scenarios:
        sys.exit("no scenario matches --role")
    langs = [lang.strip() for lang in args.lang.split(",") if lang.strip()] if args.lang else scenarios[0].langs
    app_version = json.loads((ROOT / "apps" / "web" / "package.json").read_text(encoding="utf-8"))["version"]

    feature = scenarios[0].feature
    out_dir = ROOT / "videos" / "output" / feature
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"feature": feature, "videos": []}

    stand = None
    base_url = args.base_url
    if not base_url:
        stand = Stand()
        print("starting the local stand …")
        stand.start()
        base_url = stand.url
    try:
        first = True
        for sc in scenarios:
            for lang in langs:
                vid = f"{sc.feature}-{sc.role}-{lang}"
                print(f"→ {vid}")
                # Every video starts from the same freshly seeded stand: a result logged while recording
                # one video must not show up in the next one.
                if stand and not first:
                    stand.reset()
                first = False
                with tempfile.TemporaryDirectory() as tmp:
                    work = Path(tmp)
                    texts = {k: v[lang] for k, v in sc.lines.items() if v.get(lang)}
                    missing = [s["say"] for s in sc.steps if s.get("say") and s["say"] not in texts]
                    if missing:
                        sys.exit(f"{vid}: no {lang} text for {missing}")
                    voice = pick_voice(lang, voices, env)
                    clips = asyncio.run(synthesize(texts, voice, work))
                    clip_len = {k: duration(ffprobe, p) for k, p in clips.items()}
                    raw, cues = record(sc, lang, base_url, clips, clip_len, work, texts)

                    srt = out_dir / f"{sc.role}-{lang}.srt"
                    srt.write_text(
                        "\n".join(f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{texts[k]}\n" for i, (a, b, k) in enumerate(cues, 1)),
                        encoding="utf-8",
                    )
                    mp4 = out_dir / f"{sc.role}-{lang}.mp4"
                    bed = None if args.no_bed or not BED.exists() else BED
                    mix(ffmpeg, raw, cues, clips, srt, mp4, bed, duration(ffprobe, raw))

                length = duration(ffprobe, mp4)
                entry = {
                    "id": vid,
                    "feature": sc.feature,
                    "role": sc.role,
                    "lang": lang,
                    "device": sc.device,
                    "file": mp4.relative_to(ROOT).as_posix(),
                    "subtitles": srt.relative_to(ROOT).as_posix(),
                    "duration_s": round(length, 1),
                    "voice": voice["name"],
                    "voice_note": voice.get("note"),
                    "scenario": sc.source.relative_to(ROOT).as_posix(),
                    "scenario_hash": sc.sha256,
                    "app_version": app_version,
                    "health_review": "required" if sc.health else "not_needed",
                    "native_speaker_review": "required" if lang == "ky" else "not_needed",
                    "frames": frames(ffmpeg, mp4, length, out_dir / "frames"),
                    "created_at": datetime.now(ZoneInfo("Asia/Bishkek")).isoformat(timespec="seconds"),
                }
                manifest["videos"] = [v for v in manifest["videos"] if v["id"] != vid] + [entry]
                manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(f"  {entry['file']} — {entry['duration_s']} s, {len(cues)} lines, voice {voice['name']}")
    finally:
        if stand:
            stand.stop()
            # Recording changed the stand's data (results, onboarding): make the next e2e run reseed it
            (ROOT / "e2e" / ".stand-today").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
