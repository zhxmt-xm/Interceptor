const fs = require('fs');
const statusText = fs.readFileSync('git_status_utf8.txt', 'utf8').replace(/^\uFEFF/, '');
const cachedText = fs.readFileSync('git_numstat_cached_utf8.txt', 'utf8').replace(/^\uFEFF/, '');
const unstagedText = fs.readFileSync('git_numstat_unstaged_utf8.txt', 'utf8').replace(/^\uFEFF/, '');

const statusLines = statusText.split('\n').map(l => l.replace('\r', '')).filter(l => l.trim().length > 0);
const cachedLines = cachedText.split('\n').map(l => l.replace('\r', '')).filter(l => l.trim().length > 0);
const unstagedLines = unstagedText.split('\n').map(l => l.replace('\r', '')).filter(l => l.trim().length > 0);

function parseNumstat(lines) {
    const map = {};
    for (let line of lines) {
        const m = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
        if (m) {
            const add = m[1] === '-' ? 0 : parseInt(m[1], 10);
            const del = m[2] === '-' ? 0 : parseInt(m[2], 10);
            let pStr = m[3].trim();
            if (pStr.startsWith('"') && pStr.endsWith('"')) pStr = pStr.slice(1, -1);
            map[pStr] = { add, del };
        }
    }
    return map;
}

const cachedDiff = parseNumstat(cachedLines);
const unstagedDiff = parseNumstat(unstagedLines);

const groups = {
    'root': { count: 0, add: 0, del: 0 },
    'architecture': { count: 0, add: 0, del: 0 },
    'desktop main+preload+shared': { count: 0, add: 0, del: 0 },
    'desktop renderer': { count: 0, add: 0, del: 0 },
    'desktop tests': { count: 0, add: 0, del: 0 },
    'proxy-core': { count: 0, add: 0, del: 0 },
    'packages/design-vite source': { count: 0, add: 0, del: 0 },
    'design-vite shots': { count: 0, add: 0, del: 0 }
};

const renames = [];

for (let line of statusLines) {
    const x = line.substring(0, 2);
    let rest = line.substring(3).trim();
    if (rest.startsWith('"') && rest.endsWith('"')) {
        rest = rest.slice(1, -1);
    }
    
    let orig = null;
    let file = rest;
    if (x.startsWith('R') || rest.includes(' -> ')) {
        const idx = rest.indexOf(' -> ');
        if (idx !== -1) {
            orig = rest.substring(0, idx).trim();
            file = rest.substring(idx + 4).trim();
            if (orig.startsWith('"') && orig.endsWith('"')) orig = orig.slice(1, -1);
            if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
        }
    }

    let group = 'root';
    if (file.startsWith('architecture/')) {
        group = 'architecture';
    } else if (file.startsWith('apps/proxy-core/') || file.startsWith('packages/proxy-core/')) {
        group = 'proxy-core';
    } else if (file.startsWith('packages/design-vite/shots/') || file.startsWith('packages/design-vite/tests/fixtures/') || file.endsWith('.png')) {
        group = 'design-vite shots';
    } else if (file.startsWith('packages/design-vite/')) {
        group = 'packages/design-vite source';
    } else if (file.includes('/tests/') || file.includes('.test.') || file.includes('visual-parity/') || file.includes('.visual.')) {
        group = 'desktop tests';
    } else if (file.startsWith('apps/desktop/src/main/') || file.startsWith('apps/desktop/src/preload/') || file.startsWith('apps/desktop/src/shared/')) {
        group = 'desktop main+preload+shared';
    } else if (file.startsWith('apps/desktop/src/renderer/')) {
        group = 'desktop renderer';
    } else if (file.startsWith('apps/desktop/')) {
        group = 'desktop main+preload+shared';
    }

    groups[group].count++;

    let fileAdd = 0, fileDel = 0;
    if (cachedDiff[file]) {
        fileAdd += cachedDiff[file].add;
        fileDel += cachedDiff[file].del;
    }
    if (unstagedDiff[file]) {
        fileAdd += unstagedDiff[file].add;
        fileDel += unstagedDiff[file].del;
    }

    const key = orig ? `${orig} -> ${file}` : null;
    if (key) {
        if (cachedDiff[key]) {
            fileAdd += cachedDiff[key].add;
            fileDel += cachedDiff[key].del;
        }
        if (unstagedDiff[key]) {
            fileAdd += unstagedDiff[key].add;
            fileDel += unstagedDiff[key].del;
        }
    }

    groups[group].add += fileAdd;
    groups[group].del += fileDel;

    if (x.startsWith('R')) {
        const hasDiff = fileAdd > 0 || fileDel > 0;
        renames.push({ orig, dest: file, hasDiff });
    }
}

console.log('--- GROUPS ---');
console.log(JSON.stringify(groups, null, 2));
console.log('--- RENAMES_COUNT ---', renames.length);
const editsCount = renames.filter(r => r.hasDiff).length;
console.log('--- RENAMES_WITH_EDIT ---', editsCount);
console.log('--- RENAMES_PURE ---', renames.length - editsCount);

const patterns = {};
for (let r of renames) {
    const oDir = r.orig.substring(0, r.orig.lastIndexOf('/'));
    const dDir = r.dest.substring(0, r.dest.lastIndexOf('/'));
    const pat = `${oDir} -> ${dDir}`;
    patterns[pat] = (patterns[pat] || 0) + 1;
}
console.log('--- PATTERNS ---');
console.log(JSON.stringify(patterns, null, 2));
