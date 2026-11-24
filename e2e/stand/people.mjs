// Выдуманные люди стенда. Реальных имён атлетов здесь быть не должно.
export const GYM = { name: 'Стенд Бокс', city: 'Бишкек', code: 'STND26' }; // постоянный код — для видео и тестов
export const PEOPLE = {
  owner:    { tg: 900001, name: 'Азамат Тренеров', sex: 'm', role: 'owner' },
  coach:    { tg: 900002, name: 'Айгерим Коучева', sex: 'f', role: 'coach' },
  athlete:  { tg: 900003, name: 'Бакыт Атлетов',   sex: 'm', role: 'athlete' },
  nurlan:   { tg: 900004, name: 'Нурлан Бегунов',  sex: 'm', role: 'athlete' },
  ermek:    { tg: 900005, name: 'Эрмек Штангов',   sex: 'm', role: 'athlete' },
  aizhan:   { tg: 900006, name: 'Айжан Прыгунова', sex: 'f', role: 'athlete' },
  sezim:    { tg: 900007, name: 'Сезим Гребцова',  sex: 'f', role: 'athlete' },
  outsider: { tg: 900099, name: 'Гость Сбоку',     sex: 'm', role: null },
  // Только что вошёл через Telegram: анкета не заполнена, в зале не состоит (для урока регистрации)
  newbie:   { tg: 900010, name: 'Тимур Новичков',  sex: null, role: null },
};
export const emailOf = (tg) => `tg_${tg}@users.topteam.local`;
