# Видео: Как тренеру вести зал в TopTeam
feature: coach-guide · role: coach · version: 0.0.0 · device: mobile · langs: ru
Длительность: ~2,5 мин

<!-- Записывается под владельцем зала (главный тренер): ему видны все тренерские экраны, включая QR. -->

## Шаги
```yaml
- id: 1
  action: login
  value: owner
  target: /
  pause: 1.0
  say: c1
- id: 2
  action: click
  target: text=＋ Программа дня
  pause: 1.0
  say: c2
- id: 3
  action: click
  target: button:text-is("Завтра")
  pause: 0.8
  say: c3
- id: 4
  action: click
  target: button:text-is("Разминка")
  pause: 0.5
  say: c4
- id: 5
  action: fill
  target: input[placeholder^="Название"]
  value: Разминка
  pause: 0.3
- id: 6
  action: fill
  target: textarea[placeholder^="Упражнения"]
  value: 3 раунда, 10 air squat, 200 м бег
  pause: 0.5
- id: 7
  action: click
  target: text=＋ Добавить блок
  pause: 0.5
  say: c5
- id: 8
  action: click
  target: button:text-is("Сила")
  pause: 0.5
  say: c6
- id: 9
  action: click
  target: button:text-is("Силовая")
  pause: 0.3
- id: 10
  action: select
  target: select
  value: Back Squat
  pause: 0.5
- id: 11
  action: click
  target: button:text-is("5RM")
  pause: 0.5
- id: 12
  action: click
  target: text=＋ Добавить блок
  pause: 0.5
  say: c7
- id: 13
  action: click
  target: button:text-is("Бенчмарк")
  pause: 0.5
- id: 14
  action: click
  target: button:text-is("Fran")
  pause: 1.0
- id: 15
  action: click
  target: text=Опубликовать программу
  pause: 2.0
  say: c8
- id: 16
  action: goto
  target: /week
  pause: 1.5
  say: c9
- id: 17
  action: click
  target: text=🙈 Откроется в этот день
  pause: 1.5
  say: c10
- id: 18
  action: goto
  target: /leaderboard
  pause: 0.5
- id: 19
  action: click
  target: text=⏱️ Блоки
  pause: 0.5
- id: 19.5
  action: click
  target: button:text-matches("^RX")
  pause: 1.5
  say: c11
- id: 20
  action: goto
  target: /profile
  pause: 0.5
- id: 21
  action: scroll
  target: text=Пригласить в зал
  pause: 1.5
  say: c12
- id: 22
  action: goto
  target: /leaderboard
  pause: 2.0
  say: c13
```

## Озвучка
| ключ | ru |
|---|---|
| c1 | Это урок для тренера: как вести свой зал в TopTeam. |
| c2 | Нажмите «Программа дня» — здесь вся тренировка собирается из блоков. |
| c3 | Выберите день: сегодня, завтра или любую дату. |
| c4 | Первый блок — разминка. Название и упражнения, по строке на каждое. |
| c5 | Добавьте следующий блок. |
| c6 | Силовой блок: выберите упражнение и максимум — например, пять повторений. |
| c7 | И основная тренировка. Можно написать свою или взять готовый бенчмарк — например, Fran. |
| c8 | Нажмите «Опубликовать». Утром атлеты получат программу и напоминание в Telegram. |
| c9 | В плане недели видно все дни. Прошлую неделю можно скопировать одной кнопкой. |
| c10 | Здесь решаете: видна ли программа заранее, или откроется только в день тренировки. |
| c11 | Во вкладке «Блоки» — результаты всех атлетов по каждому блоку, с разделением на мужчин и женщин. |
| c12 | Чтобы позвать людей, распечатайте этот QR и повесьте в зале — атлеты вступят сами, без кода. |
| c13 | А каждую ночь TopTeam сам подводит итоги: атлет дня, недели и месяца. Вы видите, кто ходит и растёт. |

Данные: стенд (зал «Стенд Бокс», выдуманные люди), реальных имён нет.
