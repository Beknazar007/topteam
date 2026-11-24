# Видео: Зарегистрироваться и вступить в свой зал
feature: register · role: athlete · version: 0.0.0 · device: mobile · langs: ru
Длительность: ~55 с

<!-- Начало — анимация videos/tools/slides/register.html (стена с QR → камера → Telegram → «Запустить»):
     настоящий Telegram на стенде не записать. Дальше — реальное приложение на стенде. -->

## Шаги
```yaml
- id: 1
  action: goto
  target: "{slides}/register.html"
  pause: 2.0
  say: s1
- id: 2
  action: eval
  target: show('camera')
  pause: 2.2
  say: s2
- id: 3
  action: click
  target: "#tglink"
  pause: 1.2
  say: s3
- id: 4
  action: highlight
  target: "#start"
  pause: 0.8
  say: s4
- id: 5
  action: click
  target: "#start"
  pause: 1.5
  say: s5
- id: 7
  action: login
  value: newbie
  target: /join/STND26
  pause: 1.5
  say: s6
- id: 8
  action: click
  target: button:text-is("Мужской")
  pause: 0.8
  say: s7
- id: 9
  action: click
  target: button:text-is("Scaled")
  pause: 0.8
  say: s8
- id: 10
  action: click
  target: button:text-is("3")
  pause: 0.8
  say: s9
- id: 11
  action: click
  target: role=button[name="Готово"]
  pause: 3.0
  say: s10
```

## Озвучка
| ключ | ru |
|---|---|
| s1 | Как зарегистрироваться в TopTeam. В вашем зале на стене висит QR-код. |
| s2 | Откройте камеру телефона и наведите её на QR-код. |
| s3 | Нажмите на ссылку — откроется Telegram. |
| s4 | Нажмите «Запустить». |
| s5 | TopTeam откроется прямо в Telegram. |
| s6 | TopTeam открылся, и вы уже в своём зале — код вводить не нужно. Осталась пара вопросов. |
| s7 | Укажите пол — для отдельных рейтингов мужчин и женщин. |
| s8 | Выберите уровень. Его можно менять в каждой тренировке. |
| s9 | И цель — сколько тренировок в неделю. |
| s10 | Нажмите «Готово». Всё! Перед вами программа дня вашего зала. |

Данные: стенд (зал «Стенд Бокс», код STND26, новичок «Тимур Новичков»), реальных имён нет.
