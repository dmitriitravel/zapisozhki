# Точка возобновления — публикация (2026-10-22)

Код запушен в `https://github.com/dmitriitravel/zapisozhki` (ветка `main`).
Supabase `qwzvymlxpuptdwudfeuf`: миграция применена, функции `telegram-auth` и
`telegram-bot` задеплоены, секреты функций заданы, публичная регистрация выключена.
GitHub Actions: lint и тесты зелёные, job `supabase` зелёный.

Не готово: GitHub Pages. Сайт ни разу не создавался, а токен не может создать его
(`Resource not accessible`). Владелец должен один раз открыть
Settings → Pages → Source: GitHub Actions. После этого перезапустить job `pages`
(`enablement: true` уже в workflow). Затем `tools/telegram-setup.mjs` с
`SUPABASE_URL=https://qwzvymlxpuptdwudfeuf.supabase.co`.

Секреты Actions уже записаны: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`. Переменные: `SUPABASE_PROJECT_REF`,
`WEB_APP_URL`. В git их нет.

## Что сделано и зафиксировано

Коммит `4dabe02` «feat(cloud): локальная синхронизация с Supabase» (42 файла,
+3752/−43) поверх `3df765c`. Ветка `main`, remote `origin` =
`https://github.com/dmitriitravel/zapisozhki.git` (fetch не выполнялся ни разу,
`origin/main` не существует локально).

Содержимое коммита:

- `supabase/migrations/20261021125152_init_cloud_sync.sql` — таблицы
  `profiles`, `decks`, `cards`, `review_log`, RLS owner-only, RPC `sync_pull` /
  `sync_push`, bucket `card-images` с политиками.
- `supabase/functions/telegram-auth` — проверка initData (HMAC-SHA256),
  создание пользователя, magic link.
- `supabase/functions/telegram-bot` — grammY webhook.
- `supabase/functions/_shared/telegram-init-data.ts` — общая валидация.
- `apps/mini-app/src/app/core/cloud/` — клиент: outbox, push-plan, auth, sync,
  картинки. Тесты `push-plan.spec.ts`, `cloud-images.spec.ts`,
  `memo-repository.service.spec.ts` (39 тестов, проходили).
- `apps/mini-app/src/environments/` — `environment.ts` (пустые прод-ключи,
  синхронизация выключена) и `environment.development.ts` (локальный Supabase).
- `.github/workflows/deploy.yml` — checks + supabase + GitHub Pages.
- `tools/telegram-setup.mjs` — setWebhook / setMyCommands / menu button.
- Раздел «Облако» в экране «Ещё».

## Секреты (НЕ в git, проверено `git check-ignore`)

- `supabase/functions/.env` — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  (openssl rand -hex 24), `WEB_APP_URL=https://dmitriitravel.github.io/zapisozhki/`.
- `apps/bot/.env` — `BOT_TOKEN`, `WEB_APP_URL`.
- `.env.supabase.local` — publishable/secret ключи и пароль БД проекта пользователя.
  `SUPABASE_PROJECT_URL` там ПУСТОЙ — ref проекта неизвестен.

Секреты были вставлены в чат — перед публикацией рекомендовать ротацию:
токен бота (BotFather /revoke), secret key и пароль БД в Supabase.

## Что проверено на локальном Supabase (Docker)

- `supabase start` сначала падал: `network supabase_network_memo-telegram not found`
  (оборванный первый старт). Лечится `supabase stop --no-backup` и повторным
  `supabase start`. Обязательно сбрасывать прокси:
  `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy` — корпоративный
  прокси режет api.telegram.org и supabase.com.
- `supabase db reset --local` применил миграцию без ошибок.
- Edge Functions: `supabase functions serve --env-file supabase/functions/.env`.
  Первый вызов падал `503 BOOT_ERROR` — «Error loading .npmrc … Resource deadlock
  avoided (os error 35)». Вылечено `touch` пустых
  `supabase/functions/telegram-auth/.npmrc` и `telegram-bot/.npmrc`
  (они в коммите, на macOS-APFS проблема может повториться).
- `telegram-auth` с подписанным initData → HTTP 200, пользователь создан
  (`tg<id>@telegram.local`), профиль записан, повторный вызов идемпотентен.
- `auth/v1/verify` с `token_hash` → полноценная сессия.
- `sync_push` / `sync_pull`: создание колоды+карточки+ревью+настроек, инкрементальный
  pull, tombstone удаления колоды (каскад на карточки, удаление ревью) — всё сверено.
  Анонимный вызов `sync_pull` → 401 permission denied.
- Генератор тестового initData: `/tmp/memo-sign-init-data.mjs`
  (`node --env-file=supabase/functions/.env /tmp/memo-sign-init-data.mjs <tgId> <name>`).

## Что НЕ сделано (продолжить отсюда)

1. **Браузерный e2e.** `nx serve mini-app` (dev-конфиг подменяет environment на
   локальный Supabase), в консоли браузера
   `localStorage['memo-dev-init-data'] = '<подписанный initData>'`, перезагрузка,
   проверка: первый вход заливает локальный снимок, правки уходят в облако,
   второе «устройство» (другой профиль браузера) их получает, картинки грузятся
   через Storage, раздел «Ещё → Облако» показывает статусы.
2. **`yarn nx run-many -t lint test build`** после облачных изменений не гонялся
   целиком (юнит-тесты — 39 зелёных, `tsc --noEmit` мини-приложения был чистый).
   Следить за бюджетом бандла: `@supabase/supabase-js` импортируется лениво.
3. **README** не обновлён: нет разделов про облако, Edge Functions, секреты,
   деплой и dev-хук `memo-dev-init-data`.
4. **Публикация невозможна без пользователя:**
   - GitHub: репозиторий `dmitriitravel/zapisozhki` недоступен (404/приватный,
     нет credentials). Нужен fine-grained PAT (Contents, Workflows, Pages,
     Actions, Secrets, Variables — чтение/запись) или deploy key (только push).
     Pages бесплатны лишь для публичных репозиториев.
   - Supabase: нет Personal Access Token (`sbp_…`) и неизвестен project ref
     (новые ключи `sb_publishable_`/`sb_secret_` его не содержат; смотреть
     Settings → General). `sb_secret_` — не токен Management API.
   - Workflow `.github/workflows/deploy.yml` ждёт vars `SUPABASE_PROJECT_REF`,
     `WEB_APP_URL` и secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
     `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
   - После деплоя: заполнить `environment.ts` реальным URL и publishable key,
     прогнать `node --env-file=supabase/functions/.env tools/telegram-setup.mjs`.

## Локальное окружение (поднять заново)

```bash
cd /Users/aiautomation/Documents/kasp/memo-telegram
export PATH=$HOME/.local/node/bin:$PATH          # Node 20.20.2
export NX_DAEMON=false
# Docker должен быть запущен (Docker Desktop; первый запуск просил пароль админа)
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  yarn -s supabase start -x vector,logflare,studio,imgproxy,mailpit,postgres-meta,supavisor
# API http://127.0.0.1:54321, DB postgresql://postgres:postgres@127.0.0.1:54322/postgres
# publishable: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  yarn -s supabase functions serve --env-file supabase/functions/.env
```

На момент паузы контейнеры Supabase оставлены запущенными, `functions serve`
остановлен. Остановить всё: `yarn -s supabase stop`.

## Известные грабли

- `git status` без `-uno` зависает в этом окружении (untracked scan через
  файловую систему не завершается). Использовать `git status --short -uno`,
  а новые файлы добавлять явным путём: `git add -- <пути>`.
- Прокси-переменные окружения ломают Telegram и Supabase — всегда
  `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy`.
- `@supabase/supabase-js` запинен на `~2.109.0`: 2.118+ требует Node ≥ 22.
- В CLI 2.121 `functions serve` может требовать реальные пустые `.npmrc`
  в папках функций (уже добавлены).
