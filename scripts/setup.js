const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node 22.14+ or Node 24 LTS first.');
fs.mkdirSync(path.join(root, 'certs'), { recursive: true, mode: 0o700 });
const trusted = process.argv.includes('--trusted');
if (trusted) {
    try { execFileSync('mkcert', ['-version'], { stdio: 'ignore' }); }
    catch { throw new Error('Install mkcert first: brew install mkcert. Then run npm run setup:trusted.'); }
    // Explicit opt-in: installing a local CA changes the Mac's trust store and
    // may ask the user for administrator authentication. Never do this during
    // normal setup, tests or application startup.
    execFileSync('mkcert', ['-install'], { stdio: 'inherit' });
    const tempCert = path.join(root, 'certs/server-next.crt');
    const tempKey = path.join(root, 'certs/server-next.key');
    execFileSync('mkcert', ['-cert-file', tempCert, '-key-file', tempKey, 'localhost', '127.0.0.1', '::1'], { stdio: 'inherit' });
    fs.chmodSync(tempKey, 0o600);
    for (const ext of ['crt', 'key']) {
        const file = path.join(root, `certs/server.${ext}`);
        if (fs.existsSync(file)) fs.copyFileSync(file, path.join(root, `certs/server.previous.${ext}`));
    }
    fs.renameSync(tempCert, path.join(root, 'certs/server.crt'));
    fs.renameSync(tempKey, path.join(root, 'certs/server.key'));
    console.log('Trusted localhost certificate installed. Restart FlightDeck and reload the browser.');
} else if (!fs.existsSync(path.join(root, 'certs/server.key')) || !fs.existsSync(path.join(root, 'certs/server.crt'))) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'certs/server.key', '-out', 'certs/server.crt', '-days', '365', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { cwd: root, stdio: 'ignore' });
    fs.chmodSync(path.join(root, 'certs/server.key'), 0o600);
}
console.log('Ready. Run npm run dev, then open https://localhost:4000/control. Pair using the code in the terminal.');
if (!trusted) console.log('For warning-free HTTPS on this Mac, use npm run setup:trusted (requires mkcert and one-time approval to trust its local CA).');
