const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
function check(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
        const name = path.join(dir, file.name);
        if (file.isDirectory()) { if (name !== path.join('public', 'vendor')) check(name); }
        else if (/\.(js|cjs)$/.test(name)) {
            // browser ES modules (public/games/derby/) parse as modules; everything else as the package's CommonJS
            const source = fs.readFileSync(name, 'utf8');
            if (name.endsWith('.js') && /^\s*(import|export)\b/m.test(source)) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: source });
            else execFileSync(process.execPath, ['--check', name]);
        }
        else if (name.endsWith('.html')) {
            const source = fs.readFileSync(name, 'utf8');
            for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
                if (!/\bsrc=|type=["'](?:application\/json|importmap)/.test(match[1])) new vm.Script(match[2], { filename: name });
            }
        }
    }
}
for (const dir of ['src', 'public', 'scripts', 'tests']) check(dir);
console.log('JavaScript and inline browser scripts parse successfully.');
