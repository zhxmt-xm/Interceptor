const fs = require('fs');

const statusData = fs.readFileSync('git_status.txt', 'utf8').split('\n');
const numstatCached = fs.readFileSync('git_numstat_cached.txt', 'utf8').split('\n');
const numstatUnstaged = fs.readFileSync('git_numstat_unstaged.txt', 'utf8').split('\n');

const stats = {};
function getDiffStat(lines) {
    const map = {};
    for (let line of lines) {
        if (!line.trim()) continue;
        const pts = line.split(/\s+/);
        if (pts.length >= 3) {
            const add = pts[0] === '-' ? 0 : parseInt(pts[0], 10);
            const del = pts[1] === '-' ? 0 : parseInt(pts[1], 10);
            const path = pts.slice(2).join(' ');
            map[path] = { add, del };
        }
    }
    return map;
}

const cachedDiff = getDiffStat(numstatCached);
const unstagedDiff = getDiffStat(numstatUnstaged);

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

for (let line of statusData) {
    if (!line.trim()) continue;
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

    // Determine Group
    let group = 'root';
    if (file.startsWith('architecture/')) {
        group = 'architecture';
    } else if (file.startsWith('apps/proxy-core/')) {
        group = 'proxy-core';
    } else if (file.startsWith('packages/design-vite/shots/') || file.endsWith('.png')) {
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

    // Add and Del
    let fileAdd = 0, fileDel = 0;
    // Look up file in cached or unstaged
    if (cachedDiff[file]) {
        fileAdd += cachedDiff[file].add;
        fileDel += cachedDiff[file].del;
    }
    if (unstagedDiff[file]) {
        fileAdd += unstagedDiff[file].add;
        fileDel += unstagedDiff[file].del;
    }

    // Look up via rename entry representation in diff which is "orig -> dest"
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
console.log('--- RENAMES ---');
console.log(JSON.stringify(renames, null, 2));
