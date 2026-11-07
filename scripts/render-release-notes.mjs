import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8');

const version = packageJson.version;
const heading = `## [${version}]`;
const headingStart = changelog.indexOf(heading);

if (headingStart === -1) {
    throw new Error(`В CHANGELOG.md нет секции ${heading}`);
}

const sectionStart = changelog.indexOf('\n', headingStart) + 1;
const nextSection = changelog.indexOf('\n## [', sectionStart);
const section = (nextSection === -1
    ? changelog.slice(sectionStart)
    : changelog.slice(sectionStart, nextSection)
)
    .trim()
    .replace(/^### /, '## ');

if (!section) {
    throw new Error(`Секция ${heading} в CHANGELOG.md пуста`);
}

const repository = (process.env.GITHUB_REPOSITORY || 'xray-panel/node').toLowerCase();
const tag = `v${version}`;
const previousTag = process.argv[2]?.trim();
const compareUrl = previousTag
    ? `https://github.com/${repository}/compare/${previousTag}...${tag}`
    : null;

const lines = [`🚀 XLADA Node v${version}`, ''];

if (previousTag) {
    lines.push(`📝 Compare changes: [${previousTag}...${tag}](${compareUrl})`, '');
}

lines.push(
    'Latest Docker image:',
    `- \`ghcr.io/${repository}:latest\``,
    '',
    'Docker images:',
    `- \`ghcr.io/${repository}:${version}\``,
    '',
    section,
);

if (compareUrl) {
    lines.push('', `**Full Changelog**: ${compareUrl}`);
}

process.stdout.write(`${lines.join('\n')}\n`);
