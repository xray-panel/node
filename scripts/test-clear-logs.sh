#!/usr/bin/env bash
# Проверка очистки логов Xray (XLADA).
#
# Компилирует сервис и запускает его на временном каталоге логов, где роль
# s6-log играет обычный набор файлов. Проверяет в том числе, что служебные
# файлы s6 (lock/state) не удаляются.
#
# Запуск из каталога apps/node:  ./scripts/test-clear-logs.sh

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/.tmp-logs-test"
LOGS="$(mktemp -d)"
trap 'rm -rf "$BUILD" "$LOGS"' EXIT

cd "$ROOT"

rm -rf "$BUILD"
npx tsc src/modules/xray-core/xray-logs.service.ts \
    --outDir "$BUILD" --module commonjs --target es2022 --skipLibCheck \
    --esModuleInterop >/dev/null

COMPILED="$(find "$BUILD" -name 'xray-logs.service.js' | head -1)"
if [[ -z "$COMPILED" ]]; then
    echo "не найден скомпилированный сервис" >&2
    exit 1
fi

# Готовим каталог: current, ротированный архив и служебные файлы s6-log.
head -c 1000 /dev/zero | tr '\0' 'a' > "$LOGS/current"
head -c 500 /dev/zero | tr '\0' 'b' > "$LOGS/@1700000000.s"
printf 'lock' > "$LOGS/lock"
printf 'state' > "$LOGS/state"

export XLADA_TEST_COMPILED="$COMPILED"
export XLADA_TEST_LOGS="$LOGS"
export XRAY_LOG_DIR="$LOGS"
export XRAY_LOG_S6_SERVICE_DIR="$LOGS/../nonexistent-service"

node --input-type=commonjs -e '
const { XrayLogsService } = require(process.env.XLADA_TEST_COMPILED);
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(actual)}` +
        (ok ? "" : ` (ожидалось ${JSON.stringify(expected)})`));
    ok ? pass++ : fail++;
};

(async () => {
    const logs = process.env.XLADA_TEST_LOGS;
    const service = new XrayLogsService();
    const result = await service.clearLogs();

    check("s6 недоступен — ротации не было", result.rotated, false);
    check("обрезка current выполнена", result.truncatedCurrent, true);
    check("удалён один архив", result.removedArchives, 1);
    check("освобождено 1500 байт", result.bytesFreed, 1500);

    check("current обрезан до нуля", fs.statSync(path.join(logs, "current")).size, 0);
    check("архив удалён", fs.existsSync(path.join(logs, "@1700000000.s")), false);
    check("служебный lock не тронут", fs.readFileSync(path.join(logs, "lock"), "utf8"), "lock");
    check("служебный state не тронут", fs.readFileSync(path.join(logs, "state"), "utf8"), "state");

    // Повторный вызов на пустом каталоге не должен падать.
    const second = await service.clearLogs();
    check("повторная очистка безопасна", second.bytesFreed, 0);
    check("повторная очистка: архивов нет", second.removedArchives, 0);

    console.log(`\nпройдено ${pass}, провалено ${fail}`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
'
