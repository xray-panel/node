import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat, truncate, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';

const execFileAsync = promisify(execFile);

export interface IXrayLogsClearResult {
    /** Каталог, в котором выполнялась очистка. */
    directory: string;
    /** Удалось ли запросить у s6-log ротацию. */
    rotated: boolean;
    /** Сколько ротированных архивов удалено. */
    removedArchives: number;
    /** Сколько байт освобождено. */
    bytesFreed: number;
    /** Пришлось ли обрезать current напрямую (s6 недоступен). */
    truncatedCurrent: boolean;
}

/**
 * Очистка логов Xray на ноде.
 *
 * Ключевой момент: файл `current` пишет s6-log и держит его открытым. Прямой
 * `truncate` такого файла некорректен — дескриптор сохраняет смещение, и
 * следующая запись создаёт в файле дыру из нулевых байтов, то есть лог
 * «очищается» только на вид. Поэтому основной путь — попросить s6-log
 * выполнить ротацию (SIGALRM через s6-svc -a). При конфигурации по умолчанию
 * `n0` ротированный файл сразу удаляется, и лог действительно обнуляется.
 *
 * Ротированные архивы (`@<timestamp>.s`) писатель не держит открытыми, их
 * можно удалять напрямую — это нужно, если число архивов в конфигурации
 * больше нуля.
 */
@Injectable()
export class XrayLogsService {
    private readonly logger = new Logger(XrayLogsService.name);

    private static readonly S6_SVC = '/command/s6-svc';

    private readonly logDir: string;
    private readonly logServiceDir: string;
    private readonly controlFifo: string;

    constructor() {
        this.logDir = process.env.XRAY_LOG_DIR ?? '/var/log/xray';
        this.logServiceDir = process.env.XRAY_LOG_S6_SERVICE_DIR ?? '/run/service/xray-log';
        this.controlFifo = `${this.logServiceDir}/supervise/control`;
    }

    public async clearLogs(): Promise<IXrayLogsClearResult> {
        const result: IXrayLogsClearResult = {
            directory: this.logDir,
            rotated: false,
            removedArchives: 0,
            bytesFreed: 0,
            truncatedCurrent: false,
        };

        if (existsSync(this.controlFifo)) {
            try {
                await execFileAsync(XrayLogsService.S6_SVC, ['-a', this.logServiceDir]);
                result.rotated = true;
            } catch (error) {
                this.logger.warn(`Failed to trigger log rotation: ${error}`);
            }
        } else {
            this.logger.warn(
                `s6 log service control not found at ${this.controlFifo}, falling back to truncate.`,
            );
        }

        if (!existsSync(this.logDir)) {
            this.logger.warn(`Log directory ${this.logDir} not found.`);
            return result;
        }

        const entries = await readdir(this.logDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }

            const fullPath = join(this.logDir, entry.name);

            if (entry.name.endsWith('.s')) {
                result.bytesFreed += await this.removeArchive(fullPath, entry.name);
                result.removedArchives += 1;
                continue;
            }

            // `current` обрезаем только как запасной вариант: если ротация
            // недоступна, ничего лучше сделать нельзя, но результат может
            // содержать дыру до следующей ротации.
            if (entry.name === 'current' && !result.rotated) {
                result.bytesFreed += await this.truncateCurrent(fullPath);
                result.truncatedCurrent = true;
            }
        }

        return result;
    }

    private async removeArchive(fullPath: string, name: string): Promise<number> {
        try {
            const info = await stat(fullPath);
            await unlink(fullPath);
            return info.size;
        } catch (error) {
            this.logger.warn(`Failed to remove archive ${name}: ${error}`);
            return 0;
        }
    }

    private async truncateCurrent(fullPath: string): Promise<number> {
        try {
            const info = await stat(fullPath);
            await truncate(fullPath, 0);
            return info.size;
        } catch (error) {
            this.logger.warn(`Failed to truncate ${fullPath}: ${error}`);
            return 0;
        }
    }
}
