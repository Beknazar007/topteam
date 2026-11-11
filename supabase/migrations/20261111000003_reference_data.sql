-- TopTeam: справочники и баланс игры (docs/02-product-plan.md §4)

insert into public.game_config (key, value) values
  ('xp.workout', 50), ('xp.workout_daily_limit', 2),
  ('xp.scale_rx', 10), ('xp.scale_scaled', 5), ('xp.scale_beginner', 5),
  ('xp.benchmark', 20), ('xp.baseline', 15),
  ('xp.pr', 50), ('xp.pr_daily_limit', 3),
  ('xp.streak_per_week', 5), ('xp.streak_max', 40),
  ('xp.podium_1', 20), ('xp.podium_2', 15), ('xp.podium_3', 10),
  ('xp.fire', 1), ('xp.fire_daily_limit', 10),
  ('xp.comment', 2), ('xp.comment_daily_limit', 5),
  ('xp.badge_r0', 25), ('xp.badge_r1', 75), ('xp.badge_r2', 200), ('xp.badge_r3', 500),
  ('streak.freeze_every', 4), ('streak.freeze_max', 2),
  ('result.max_age_days', 3)
on conflict (key) do update set value = excluded.value;

insert into public.exercises (name) values
  ('Back Squat'), ('Front Squat'), ('Overhead Squat'), ('Deadlift'), ('Bench Press'),
  ('Strict Press'), ('Push Press'), ('Push Jerk'), ('Split Jerk'), ('Clean'), ('Power Clean'),
  ('Squat Clean'), ('Clean & Jerk'), ('Snatch'), ('Power Snatch'), ('Squat Snatch'), ('Thruster')
on conflict (name) do nothing;

insert into public.benchmarks (name, category, format, score_type, time_cap_sec, description) values
  ('Fran',      'girl', 'for_time', 'time', 600,  '21-15-9: Thrusters 43/30 кг, Pull-ups'),
  ('Grace',     'girl', 'for_time', 'time', 600,  '30 Clean & Jerk 61/43 кг'),
  ('Isabel',    'girl', 'for_time', 'time', 600,  '30 Snatch 61/43 кг'),
  ('Diane',     'girl', 'for_time', 'time', 900,  '21-15-9: Deadlift 102/70 кг, Handstand Push-ups'),
  ('Elizabeth', 'girl', 'for_time', 'time', 900,  '21-15-9: Squat Clean 61/43 кг, Ring Dips'),
  ('Helen',     'girl', 'for_time', 'time', 1200, '3 раунда: 400 м бег, 21 KB Swing 24/16 кг, 12 Pull-ups'),
  ('Jackie',    'girl', 'for_time', 'time', 1200, '1000 м гребля, 50 Thrusters 20/15 кг, 30 Pull-ups'),
  ('Karen',     'girl', 'for_time', 'time', 1200, '150 Wall Balls 9/6 кг'),
  ('Annie',     'girl', 'for_time', 'time', 1200, '50-40-30-20-10: Double Unders, Sit-ups'),
  ('Diane Light','custom','for_time','time', 900, '21-15-9: Deadlift 60/40 кг, Pike Push-ups'),
  ('Nancy',     'girl', 'for_time', 'time', 1800, '5 раундов: 400 м бег, 15 Overhead Squat 43/30 кг'),
  ('Amanda',    'girl', 'for_time', 'time', 1200, '9-7-5: Muscle-ups, Squat Snatch 61/43 кг'),
  ('Kelly',     'girl', 'for_time', 'time', 2700, '5 раундов: 400 м бег, 30 Box Jumps 60/50 см, 30 Wall Balls 9/6 кг'),
  ('Cindy',     'girl', 'amrap',    'rounds_reps', 1200, 'AMRAP 20 мин: 5 Pull-ups, 10 Push-ups, 15 Air Squats'),
  ('Mary',      'girl', 'amrap',    'rounds_reps', 1200, 'AMRAP 20 мин: 5 HSPU, 10 Pistols, 15 Pull-ups'),
  ('Murph',     'hero', 'for_time', 'time', 4800, '1,6 км бег, 100 Pull-ups, 200 Push-ups, 300 Air Squats, 1,6 км бег (жилет 9/6 кг)'),
  ('DT',        'hero', 'for_time', 'time', 1200, '5 раундов: 12 Deadlift, 9 Hang Power Clean, 6 Push Jerk — 70/47 кг'),
  ('Randy',     'hero', 'for_time', 'time', 900,  '75 Power Snatch 34/25 кг'),
  ('Nate',      'hero', 'amrap',    'rounds_reps', 1200, 'AMRAP 20 мин: 2 Muscle-ups, 4 HSPU, 8 KB Swing 32/24 кг'),
  ('Michael',   'hero', 'for_time', 'time', 2700, '3 раунда: 800 м бег, 50 Back Extensions, 50 Sit-ups')
on conflict (name) do nothing;

-- Бейджи: enabled = входит в MVP (★ в docs/02-product-plan.md §4.4)
insert into public.badges (code, name, emoji, rarity, description, sort, enabled) values
  ('welcome',        'Добро пожаловать',   '👋', 0, 'Зарегистрироваться и вступить в зал', 1, true),
  ('first_result',   'Первая кровь',       '🩸', 0, 'Первый записанный результат', 2, true),
  ('first_pr',       'Первый PR',          '⚡', 0, 'Первый личный рекорд', 3, true),
  ('profile_done',   'Профиль готов',      '✅', 0, 'Заполнить пол, уровень и цель серии', 4, true),
  ('workouts_10',    'Десятка',            '🔟', 0, '10 тренировок', 5, true),
  ('workouts_50',    'Полтинник',          '💪', 1, '50 тренировок', 6, true),
  ('workouts_100',   'Сотня',              '💯', 2, '100 тренировок', 7, true),
  ('workouts_250',   '250',                '🏅', 2, '250 тренировок', 8, false),
  ('workouts_500',   '500',                '🏛️', 3, '500 тренировок', 9, false),
  ('streak_4',       'Разгон',             '🔥', 0, 'Серия 4 недели', 10, true),
  ('streak_12',      'Привычка',           '📅', 1, 'Серия 12 недель', 11, true),
  ('streak_26',      'Полгода огня',       '🌋', 2, 'Серия 26 недель', 12, true),
  ('streak_52',      'Год без пропусков',  '🗓️', 3, 'Серия 52 недели', 13, false),
  ('early_bird',     'Ранняя пташка',      '🌅', 1, '10 тренировок, записанных до 9:00', 14, false),
  ('prs_10',         'PR-машина',          '🚀', 1, '10 личных рекордов', 15, true),
  ('prs_50',         'Рекордсмен',         '📈', 2, '50 личных рекордов', 16, false),
  ('double_pr',      'Двойной удар',       '⚔️', 1, '2 PR в один день', 17, true),
  ('pr_month',       'Месяц роста',        '🌱', 2, 'PR в каждой неделе месяца', 18, false),
  ('fran',           'Познакомься с Fran', '💃', 0, 'Выполнить Fran', 19, true),
  ('girls_5',        'Девичник',           '👯', 1, '5 разных Girls-бенчмарков', 20, true),
  ('girls_10',       'Все девушки',        '👑', 2, '10 разных Girls-бенчмарков', 21, false),
  ('first_hero',     'Герой',              '🎖️', 1, 'Первый Hero WOD', 22, true),
  ('murph',          'Murph',              '🦅', 2, 'Выполнить Murph', 23, true),
  ('fran_sub5',      'Fran < 5:00',        '⏱️', 3, 'Fran RX быстрее 5 минут', 24, false),
  ('bodyweight_squat','Свой вес',          '🏋️', 1, 'Back Squat ≥ собственного веса', 25, false),
  ('club_100',       'Клуб 100',           '💯', 1, 'Любой лифт ≥ 100 кг', 26, false),
  ('rx_upgrade',     'Переход в RX',       '🆙', 1, 'Первый результат RX после 5+ Scaled', 27, true),
  ('podium',         'На пьедестале',      '🥉', 1, 'Впервые в топ-3 WOD дня', 28, true),
  ('champion',       'Чемпион дня',        '🏆', 1, '1-е место WOD дня', 29, true),
  ('king',           'Король зала',        '🦁', 3, '10 раз 1-е место', 30, false),
  ('fires_given_50', 'Поддержка',          '🤜', 0, 'Поставить 50 🔥', 31, true),
  ('fires_got_100',  'Любимчик зала',      '❤️‍🔥', 1, 'Получить 100 🔥', 32, true),
  ('ambassador',     'Амбассадор',         '📣', 1, 'Поделиться карточкой 10 раз', 33, false),
  ('pioneer',        'Первопроходец',      '🚩', 3, 'Один из первых 50 пользователей', 34, false),
  ('new_year',       'Новогодний WOD',     '🎄', 2, 'Тренировка 1 января', 35, false)
on conflict (code) do update set
  name = excluded.name, emoji = excluded.emoji, rarity = excluded.rarity,
  description = excluded.description, sort = excluded.sort, enabled = excluded.enabled;
