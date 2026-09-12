import prettyBytes from 'pretty-bytes';

import { INestApplication } from '@nestjs/common';

import { XrayService } from '../../modules/xray-core/xray.service';
import { getSystemInfo } from './get-system-stats';
import { renderBox } from './render-box';

export async function getStartMessage(appPort: number, app: INestApplication) {
    const xrayService = app.get(XrayService);

    const xrayInfo = xrayService.getXrayInfo();
    const systemInfo = getSystemInfo();

    return renderBox(`XPANEL Node v${__RWNODE_VERSION__}`, [
        'Docs → https://docs.xraypanel.dev\nCommunity → https://github.com/CHANGE-ME/xpanel',
        `API Port: ${appPort}`,
        `XRay Core: v${xrayInfo.version || 'N/A'}\nXRay Path: /usr/local/bin/xray`,
        `${systemInfo.cpus}C, ${systemInfo.cpuModel}, ${prettyBytes(systemInfo.memoryTotal)}`,
        `Kernel: ${systemInfo.release} ${systemInfo.type} ${systemInfo.platform}`,
        `Network Interfaces: ${systemInfo.networkInterfaces.join(', ')}`,
    ]);
}
