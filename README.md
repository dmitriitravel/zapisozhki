# MemoCards — карточки с интервальным повторением для Telegram

Telegram Mini App по мотивам MemoDremo: колоды (проекты) по темам, карточки «вопрос — ответ»
с изображениями и интервальное повторение по алгоритму SM‑2 (как в Anki).

```
memo-telegram/
├── apps/
│   ├── mini-app/          # Angular 17 — Telegram Mini App (вкладки Повторение / Колоды / Библиотека / Ещё)
│   └── bot/               # Node.js + grammY — бот, открывающий Mini App
└── libs/shared/
    ├── spaced-repetition/ # чистый TypeScript: планировщик SM‑2 + unit-тесты
    └── telegram/          # Angular-сервис-обёртка над Telegram WebApp SDK
```

## Возможности

- **Колоды** — несколько проектов с похожими темами; у каждой колоды эмодзи, описание,
  можно поставить на паузу (исключить из общего повторения), редактировать и удалять.
- **Карточки** — вопрос (лицевая сторона), ответ (обратная), необязательное изображение.
  Картинка ужимается до 1280 px и хранится локально вместе с превью 160 px.
- **Повторение (Drilling)** — список карточек на сегодня по всем активным колодам или по одной
  колоде; сессия с переворотом карточки, четырьмя оценками (Забыл / Трудно / Помню / Легко)
  и свайпами (влево — забыл, вправо — помню). Показывается, через сколько карточка вернётся.
- **Интервальное повторение** — SM‑2: шаги заучивания 1 и 10 минут, выпуск на 1 день,
  «Легко» — 4 дня, далее интервал × ease‑factor (2.5 по умолчанию, минимум 1.3),
  при ошибке интервал делится пополам. Лимит новых карточек в день настраивается.
- **Библиотека** — готовые колоды (`apps/mini-app/src/assets/library`), добавляются копией
  в «Колоды».
- **Ещё** — статистика (карточек, выучено, ответов сегодня, дней подряд), настройки,
  резервные копии: Telegram CloudStorage (без изображений, доступна на всех устройствах)
  и экспорт/импорт JSON (полная копия с изображениями).
- Интеграция с Telegram: тема (`--tg-theme-*`), кнопка «Назад», haptic feedback, отключение
  закрытия приложения вертикальным свайпом, CloudStorage. Вне Telegram всё работает в обычном
  браузере (с fallback на `localStorage` / `window.confirm`), что удобно для разработки.

## Где хранятся данные

Все данные (колоды, карточки, изображения, журнал ответов) лежат в **IndexedDB устройства**
внутри WebView Telegram. Бэкенда нет. Чтобы не потерять прогресс при смене устройства или
очистке кэша, используйте «Ещё → Резервные копии».

## Требования

- Node.js 20 LTS
- yarn 1.x

## Команды

```bash
yarn install

# мини-приложение
npx nx serve mini-app            # http://localhost:4200
npx nx build mini-app            # production-сборка → dist/apps/mini-app/browser

# бот
npx nx build bot                 # → dist/apps/bot/main.js (самодостаточный бандл)

# качество
npx nx run-many -t lint
npx nx run-many -t test
```

## Запуск в Telegram

### 1. Создайте бота

В [@BotFather](https://t.me/BotFather): `/newbot` → сохраните токен.

### 2. Опубликуйте мини-приложение по HTTPS

Telegram открывает Mini App только по HTTPS. Подойдёт любой статический хостинг:
GitHub Pages, Vercel, Netlify, Cloudflare Pages, собственный nginx.

```bash
npx nx build mini-app
# если приложение будет лежать не в корне домена, укажите base href:
npx nx build mini-app --base-href /memo/
```

Загрузите содержимое `dist/apps/mini-app/browser` на хостинг. Роутинг в приложении
hash‑based (`/#/decks`), поэтому fallback на `index.html` настраивать не нужно.

Для локальной проверки прямо в Telegram можно пробросить dev-сервер через туннель
(например, `ngrok http 4200` или `cloudflared tunnel --url http://localhost:4200`) и
использовать выданный HTTPS‑адрес.

### 3. Запустите бота

```bash
cp apps/bot/.env.example apps/bot/.env   # заполните BOT_TOKEN и WEB_APP_URL
npx nx build bot
node --env-file=apps/bot/.env dist/apps/bot/main.js
```

При старте бот сам регистрирует команды и кнопку меню (Menu Button) с Mini App.
Команда `/start` присылает inline‑кнопку «Открыть карточки».

Дополнительно можно создать прямую ссылку вида `t.me/<bot>/<app>` через `/newapp` в
BotFather, указав тот же `WEB_APP_URL`.

Бота можно разместить на любом сервере с Node.js 20 (systemd, Docker, PM2) — он работает
через long polling, входящие порты не нужны.

## Как добавить колоду в библиотеку

1. Положите JSON в `apps/mini-app/src/assets/library/<id>.json`:

   ```json
   {
     "id": "my-deck",
     "title": "Название",
     "description": "Описание",
     "emoji": "📚",
     "language": "RU",
     "cards": [
       { "question": "Вопрос", "answer": "Ответ", "imageUrl": "images/optional.jpg" }
     ]
   }
   ```

   `imageUrl` необязателен и указывается относительно папки `assets/library`.
2. Добавьте запись в `index.json` (`id`, `title`, `description`, `emoji`, `language`,
   `cardCount`, `file`).

## Архитектура мини-приложения

- `core/models/interfaces.ts` — доменные типы (Deck, Card, StoredImage, ReviewLogEntry …).
- `core/db` — IndexedDB через `idb` (`AppDatabase`, `MemoRepository`).
- `core/store/memo-store.service.ts` — состояние на сигналах; каждая мутация сначала пишется
  в базу, затем обновляет сигналы.
- `core/study/study.service.ts` — формирование очереди на сегодня и применение оценок через
  планировщик из `@memo/shared/spaced-repetition`.
- `core/images`, `core/library`, `core/backup`, `core/stats`, `core/toast` — сервисы.
- `ui/` — переиспользуемые компоненты (иконки, таб‑бар, шапка, action sheet, тосты …).
- `features/` — экраны: `drilling` (список и сессия), `decks`, `cards`, `library`, `more`.

Все компоненты standalone с `OnPush`, состояние на сигналах, операции с данными иммутабельные.
