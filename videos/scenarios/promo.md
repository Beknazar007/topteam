# Видео: TopTeam — цифровая доска вашего зала
feature: promo · role: athlete · version: 0.0.0 · device: mobile · langs: ru
Длительность: ~50 с

<!-- Рекламный ролик: проблема → решение. Для новых атлетов и других залов. -->

## Шаги
```yaml
- id: 1
  action: goto
  target: /login
  pause: 1.0
  say: p1
- id: 2
  action: login
  value: athlete
  target: /
  pause: 1.0
  say: p2
- id: 3
  action: scroll
  target: text=AMRAP 12
  pause: 0.5
- id: 4
  action: click
  target: role=button[name="Записать результат"] >> nth=1
  pause: 0.5
  say: p3
- id: 5
  action: fill
  target: label:has-text("раундов") >> input
  value: "9"
  pause: 0.3
- id: 6
  action: fill
  target: label:has-text("повторов") >> input
  value: "5"
  pause: 0.3
- id: 7
  action: click
  target: role=button[name="Сохранить"]
  pause: 2.5
- id: 8
  action: goto
  target: /leaderboard
  pause: 1.5
  say: p4
- id: 9
  action: goto
  target: /feed
  pause: 1.5
  say: p5
- id: 10
  action: goto
  target: /stats
  pause: 1.5
  say: p6
- id: 11
  action: eval
  target: localStorage.clear()
  pause: 0.1
- id: 12
  action: goto
  target: /login
  pause: 2.0
  say: p7
```

## Озвучка
| ключ | ru |
|---|---|
| p1 | Тренировку на доске к вечеру стёрли. Результаты теряются в блокнотах. А мотивация гаснет через месяц. |
| p2 | TopTeam — цифровая доска вашего зала. Программа дня — в телефоне у каждого. |
| p3 | Результат записывается за десять секунд, а рекорды и опыт считаются сами. |
| p4 | Рейтинг и номинации: атлет дня, недели и месяца. Есть за что бороться каждый день. |
| p5 | Лента зала: огоньки и поддержка друзей после каждой тренировки. |
| p6 | И весь ваш прогресс: сколько тренировок, какие дни, какие рекорды. |
| p7 | TopTeam. Отсканируйте QR-код в зале — и начните уже сегодня. |

Данные: стенд (зал «Стенд Бокс», выдуманные атлеты), реальных имён нет.
