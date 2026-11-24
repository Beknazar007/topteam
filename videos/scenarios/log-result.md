# Видео: Записать результат тренировки
feature: log-result · role: athlete · version: 0.0.0 · device: mobile · langs: ru
Длительность: ~60 с

## Шаги
```yaml
- id: 1
  action: login
  value: athlete
  pause: 1.5
  say: s1
- id: 2
  action: highlight
  target: text=Программа дня
  pause: 1.5
  say: s2
- id: 3
  action: scroll
  target: text=AMRAP 12
  pause: 1.0
- id: 4
  action: click
  target: role=button[name="Записать результат"] >> nth=1
  pause: 1.0
  say: s3
- id: 5
  action: click
  target: role=button[name="RX"]
  pause: 0.8
  say: s4
- id: 6
  action: fill
  target: label:has-text("раундов") >> input
  value: "8"
  pause: 0.5
  say: s5
- id: 7
  action: fill
  target: label:has-text("повторов") >> input
  value: "12"
  pause: 0.8
- id: 8
  action: click
  target: role=button[name="Сохранить"]
  pause: 3.0
  say: s6
- id: 9
  action: goto
  target: /leaderboard
  pause: 2.5
  say: s7
```

## Озвучка
| ключ | ru |
|---|---|
| s1 | Покажу, как записать результат тренировки в TopTeam. |
| s2 | На главном экране — программа дня от тренера, все блоки по порядку. |
| s3 | Под блоком нажмите «Записать результат». |
| s4 | Выберите уровень: RX, Scaled или Beginner. |
| s5 | Введите результат — здесь раунды и повторы. |
| s6 | Нажмите «Сохранить». Опыт начислен, рекорды считаются сами. |
| s7 | А в рейтинге видно своё место и номинации дня. Удачных тренировок! |

Данные: стенд (зал «Стенд Бокс», выдуманные атлеты), реальных имён нет.
