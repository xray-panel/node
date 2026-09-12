# XPANEL Node

**XPANEL** — самостоятельная панель управления Xray. Проект основан на
[Remnawave](https://github.com/remnawave) и является форком
[remnawave/node](https://github.com/remnawave/node).

| | |
|---|---|
| Организация | https://github.com/xray-panel |
| Версия | 3.4.1 |
| Лицензия | AGPL-3.0-only (см. `LICENCE`) |
| Апстрим | https://github.com/remnawave/node |

## Атрибуция

XPANEL — производная работа от Remnawave. Исходный код Remnawave
распространяется под лицензией AGPL-3.0-only, и XPANEL сохраняет ту же
лицензию. Все права на оригинальный код принадлежат авторам Remnawave.
Подробности — в файле `NOTICE`.

Названия «Remnawave», её логотипы и домены принадлежат авторам Remnawave и в
XPANEL не используются.

## Что это

Нода — сервис, который запускается на прокси-сервере рядом с Xray-core.
Собственного интерфейса у неё нет: нода управляется панелью по REST API и
применяет приходящую конфигурацию к ядру.

Устройство образа (`docker/Dockerfile`):

- приложение на **NestJS** (`@nestjs/common` / `@nestjs/core` 11.2.1), сборка
  через rspack, запуск — `node dist/main.js`;
- **s6-overlay** версии 3.2.3.2 как супервизор. В `docker/rootfs/etc/s6-overlay`
  описаны сервисы:
  - `init-env` — одноразовая подготовка окружения: генерирует
    `INTERNAL_REST_TOKEN` и имена внутренних сокетов, определяет версию ядра;
  - `xray` — запускает `/usr/local/bin/rw-core` (`xray`) с конфигурацией,
    которую забирает через внутренний сокет;
  - `xray-log` — принимает поток логов ядра через `s6-log`;
- **Xray-core** скачивается на этапе сборки и кладётся в образ вместе с
  `geoip.dat` и `geosite.dat`; дополнительно устанавливаются `geocheck` и база
  ASN-префиксов;
- точка входа — `/init`, по умолчанию запускается `node dist/main.js` под
  `with-contenv`.

Внутри образа доступны служебные команды: `xlogs` и `xerrors` (просмотр логов
ядра), `cli` (CLI ноды), `rw-core` (симлинк на `xray`).

## Чем отличается от апстрима

Форк содержит несколько собственных коммитов поверх `remnawave/node`:

- **Ребрендинг** (`bc06dde`). Изменён видимый бренд, имена Docker-образов,
  контейнеров и сетей, а также поля `name`/`description`/`repository` в
  `package.json` и `libs/contract/package.json`. Зависимости `@remnawave/*`,
  файлы `LICENCE` и уведомления об авторских правах в исходниках оставлены без
  изменений. Отдельным коммитом ссылки на исходники приведены к организации
  `xray-panel`.
- **Очистка логов Xray по команде из панели** (`c90b601`). Добавлены
  `XrayLogsService`, HTTP-маршрут `POST /node/xray/clear-logs` и CLI-команда
  `--clear-logs` / `-c`. В апстриме логи можно было только читать
  (`xlogs`/`xerrors`).
- **Сторонние артефакты приведены к реальным адресам** (`1bf56d4`). В
  `docker/Dockerfile` восстановлены ссылки на источники `asn-index` и
  `geocheck`; оба адреса помечены как сторонние и переопределяются через
  `--build-arg`. Xray-core берётся из релизов `XTLS/Xray-core`.
- **Контракты лежат внутри репозитория** — `libs/contract`. Это Node-библиотека
  `@xpanel/node-contract` с Zod-схемами команд, маршрутами и моделями; форк
  добавил в неё `ClearLogsCommand` (файлы `libs/contract/commands/xray/clear-logs.command.ts`
  и `libs/contract/api/controllers/xray.ts`).

## Версия Xray-core

В `docker/Dockerfile` версия ядра задана аргументом сборки:

```dockerfile
ARG XRAY_CORE_VERSION=v26.9.9
ARG UPSTREAM_REPO=XTLS
```

Артефакт скачивается из
`https://github.com/${UPSTREAM_REPO}/Xray-core/releases/download/${XRAY_CORE_VERSION}/…`
с проверкой SHA2-256 по файлу `.dgst`. Переопределить можно при сборке:

```bash
docker build \
  --build-arg XRAY_CORE_VERSION=v26.9.9 \
  --build-arg UPSTREAM_REPO=XTLS \
  -f docker/Dockerfile .
```

Версия, установленная в образе, печатается при старте ноды:

```
Xray version: Xray 26.9.9
```

Дополнительно `init-env.sh` поддерживает переменную окружения
`CUSTOM_CORE_URL`: если она задана, нода заменяет `/usr/local/bin/xray` на
скачанный по этому адресу бинарник.

## Установка ноды

Нода — это контейнер на прокси-сервере. Она **сама никуда не подключается**:
панель обращается к ней по HTTPS с mutual TLS и JWT.

### 1. Получите `SECRET_KEY`

В панели: *Nodes → создать ноду*. Панель покажет `SECRET_KEY` — длинную
base64-строку. Скопируйте её целиком, она одноразовая.

Внутри неё сертификаты и ключи: CA, сертификат ноды, приватный ключ и публичный
ключ JWT. Нода проверяет их при старте и **отказывается работать**, если
что-то не сходится.

### 2. Запуск

```bash
docker run -d \
  --name xpanel-node \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN \
  --ulimit nofile=1048576:1048576 \
  -e NODE_PORT=2222 \
  -e SECRET_KEY="<вставьте SECRET_KEY>" \
  ghcr.io/xray-panel/node:latest
```

`--network host` обязателен: Xray должен слушать порты самостоятельно, а
проксирование портов ломает определение реального IP клиента.

`--cap-add NET_ADMIN` нужен плагинам (блокировка торрентов через nftables).
Если плагины не используете, можно убрать.

### 3. Проверка

В логе ноды при старте печатается отчёт о проверке `SECRET_KEY` и версия ядра:

```
Xray version: Xray 26.9.9
```

Панель должна показать ноду как подключённую в течение минуты.

### 4. Что нода хранит и куда обращается

Полезно знать для оценки рисков:

- **не хранит пользовательские данные на диске.** БД у неё нет. В памяти
  держится набор UUID клиентов для контроля изменений конфигурации;
- **не имеет обратного канала к панели.** Нет ни URL панели, ни исходящих
  соединений к ней — только входящие;
- единственное исходящее соединение с пользовательскими данными — webhook
  torrent-blocker, и только если он настроен в плагине;
- логи Xray лежат в `/var/log/xray`, ограничены 10 МБ, без архивов.

## Логи Xray

Поток ядра (stdout/stderr) перехватывает `s6-log` и пишет его в
`/var/log/xray`. Конфигурация задана в `docker/rootfs/etc/s6-overlay/s6-rc.d/xray-log/run`:

```bash
exec /command/s6-log -b n0 s10485760 /var/log/xray
```

Здесь `s10485760` — предел размера файла (10 МБ), `n0` — не хранить
ротированные архивы. Логи без архивов, как и указано в разделе об установке.

Посмотреть логи из контейнера:

```bash
docker exec -it xpanel-node xlogs
```

Очистить логи можно двумя способами.

**Из панели.** На странице *Logs* в разделе «Node system logs» — кнопка
«Clear logs». Панель вызывает `POST /node/xray/clear-logs`, нода выполняет
ротацию файла, **Xray при этом не перезапускается** и трафик не прерывается.

**Вручную, из контейнера.** CLI-команда переиспользует тот же сервис:

```bash
docker exec -it xpanel-node cli --clear-logs
```

Как это работает внутри: файл `current` пишет `s6-log` и держит его открытым,
поэтому прямой `truncate` оставил бы дыру из нулевых байтов. Основной путь —
послать `s6-svc -a` (SIGALRM), по которому `s6-log` выполняет ротацию; при
конфигурации `n0` ротированный файл сразу удаляется. Отдельно удаляются
ротированные архивы `@*.s`, если они есть. Каталог логов и каталог сервиса
`xray-log` можно переопределить переменными `XRAY_LOG_DIR` и
`XRAY_LOG_S6_SERVICE_DIR`.

## Разработка

Скрипты из `package.json`:

| Скрипт | Что делает |
|---|---|
| `npm run build` | сборка приложения через rspack |
| `npm run dev` | сборка в режиме watch (`NODE_ENV=development`) |
| `npm start` | запуск собранного приложения (`node dist/main.js`) |
| `npm run trace` | трассировка зависимостей (`scripts/trace.mjs`) |
| `npm run typecheck` | проверка типов (`tsc --noEmit`) |
| `npm run lint` / `npm run lint:fix` | линтинг через oxlint |
| `npm run format` / `npm run format:fix` | проверка и форматирование через oxfmt |
| `npm run check` / `npm run fix` | форматирование + линтинг одной командой |

Сборка контейнера описана в `Makefile` (цели `image`, `image-save`,
`image-variants`) поверх `docker-bake.hcl`. Для проверки очистки логов есть
`scripts/test-clear-logs.sh`.

## Связанные репозитории

- [xray-panel/backend](https://github.com/xray-panel/backend) — панель;
- [xray-panel/frontend](https://github.com/xray-panel/frontend) — интерфейс панели;
- [xray-panel/subscription-page](https://github.com/xray-panel/subscription-page) — страница подписки.

## Лицензия

XPANEL Node распространяется под лицензией **AGPL-3.0-only**. Полный текст —
в файле `LICENCE`, уведомления об авторских правах и компонентах апстрима — в
файле `NOTICE`.
