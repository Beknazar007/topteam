# Видео: Зарегистрироваться и вступить в свой зал
feature: register · role: athlete · version: 0.0.0 · device: mobile · langs: ru
Длительность: ~45 с

<!-- Вход через Telegram на стенде не записать (нужен настоящий бот): показываем экран входа,
     о подтверждении в Telegram говорит голос, дальше — реальные шаги приложения. -->

## Шаги
```yaml
- id: 1
  action: goto
  target: /join/STND26
  pause: 1.5
  say: s1
- id: 2
  action: highlight
  target: text=Открыть в Telegram
  pause: 1.5
  say: s2
- id: 3
  action: login
  value: newbie
  target: /onboarding
  pause: 1.5
  say: s3
- id: 4
  action: click
  target: role=button[name="Мужской"]
  pause: 0.8
  say: s4
- id: 5
  action: click
  target: role=button[name="Scaled"]
  pause: 0.8
  say: s5
- id: 6
  action: click
  target: role=button[name="3"]
  pause: 0.8
  say: s6
- id: 7
  action: click
  target: role=button[name="Готово"]
  pause: 3.0
  say: s7
```

## Озвучка
| ключ | ru |
|---|---|
| s1 | Покажу, как зарегистрироваться в TopTeam. Отсканируйте камерой QR-код на стене зала. |
| s2 | Откроется TopTeam — нажмите «Открыть в Telegram». Пароль не нужен. |
| s3 | Готово — вы уже в своём зале, код вводить не нужно. Осталась пара вопросов. |
| s4 | Укажите пол — для отдельных рейтингов мужчин и женщин. |
| s5 | Выберите уровень. Его можно менять в каждой тренировке. |
| s6 | И цель — сколько тренировок в неделю. |
| s7 | Нажмите «Готово». Перед вами программа дня. Нет QR — попросите у тренера код зала. |

Данные: стенд (зал «Стенд Бокс», код STND26, новичок «Тимур Новичков»), реальных имён нет.
