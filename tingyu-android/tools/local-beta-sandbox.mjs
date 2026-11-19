import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import worker from '../feedback-server/src/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.release-work', 'local-beta-sandbox');
const R2_DIR = path.join(DATA_DIR, 'r2-objects');
const DB_PATH = path.join(DATA_DIR, 'sandbox.sqlite');
const KEY_PATH = path.join(DATA_DIR, 'signing-key.json');

const PORT = Number(process.env.LOCAL_SANDBOX_PORT || 8787);
const HOST = process.env.LOCAL_SANDBOX_HOST || '0.0.0.0';
const LOCAL_ADMIN_TOKEN = process.env.LOCAL_SANDBOX_ADMIN_TOKEN || 'tingyu-local-sandbox-admin-2026';
const LOCAL_READ_TOKEN = process.env.LOCAL_SANDBOX_READ_TOKEN || 'tingyu-local-sandbox-read-2026';
const LOCAL_PUBLISH_SECRET = process.env.LOCAL_SANDBOX_PUBLISH_SECRET || 'tingyu-local-sandbox-publish-2026';
const LOCAL_PREPARE_TOKEN = process.env.LOCAL_SANDBOX_PREPARE_TOKEN || 'tingyu-local-sandbox-prepare-2026';

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(R2_DIR, { recursive: true });

function loadOrCreateSigningKey() {
    if (existsSync(KEY_PATH)) {
        return JSON.parse(readFileSync(KEY_PATH, 'utf8'));
    }
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const bundle = {
        keyId: 'local-sandbox-k1',
        privateKeyJwk: privateKey.export({ format: 'jwk' }),
        publicKeySpkiBase64: Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).toString('base64'),
        createdAt: new Date().toISOString(),
    };
    writeFileSync(KEY_PATH, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
    return bundle;
}

const signingBundle = loadOrCreateSigningKey();

if (process.argv.includes('--print-spki')) {
    console.log(signingBundle.publicKeySpkiBase64);
    process.exit(0);
}

function initDatabase() {
    const firstInit = !existsSync(DB_PATH);
    const sql = new DatabaseSync(DB_PATH);
    sql.exec('PRAGMA foreign_keys=ON;');
    if (firstInit) {
        const migrationsDir = path.join(PROJECT_ROOT, 'feedback-server', 'migrations');
        const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const f of files) {
            sql.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
        }
        sql.exec("UPDATE settings SET value='true' WHERE key='uploads_enabled'");
    }
    return sql;
}

const sql = initDatabase();

const DB = {
    prepare(query) {
        let args = [];
        return {
            bind(...a) {
                args = a;
                return this;
            },
            async first() {
                return sql.prepare(query).get(...args) ?? null;
            },
            async all() {
                return { results: sql.prepare(query).all(...args) };
            },
            async run() {
                const r = sql.prepare(query).run(...args);
                return { meta: { changes: Number(r.changes) } };
            },
        };
    },
    async batch(items) {
        sql.exec('BEGIN');
        try {
            const out = [];
            for (const item of items) out.push(await item.run());
            sql.exec('COMMIT');
            return out;
        } catch (err) {
            sql.exec('ROLLBACK');
            throw err;
        }
    },
};

function safeR2FilePath(key) {
    const clean = key.replace(/[^a-zA-Z0-9._/-]/g, '_');
    const full = path.resolve(R2_DIR, clean);
    if (!full.startsWith(R2_DIR)) throw new Error('Invalid R2 key');
    return full;
}

const LOGS_BUCKET = {
    async put(key, body) {
        const target = safeR2FilePath(key);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(body));
    },
    async get(key, opts) {
        const target = safeR2FilePath(key);
        if (!existsSync(target)) return null;
        const buf = readFileSync(target);
        if (opts?.range) {
            const offset = Number(opts.range.offset || 0);
            const length = Number(opts.range.length || buf.byteLength);
            const slice = new Uint8Array(buf).slice(offset, offset + length);
            return { body: slice, arrayBuffer: async () => slice.buffer };
        }
        const bytes = new Uint8Array(buf);
        return { body: bytes, arrayBuffer: async () => bytes.buffer };
    },
    async delete(key) {
        const target = safeR2FilePath(key);
        if (existsSync(target)) rmSync(target, { force: true });
    },
    async list({ prefix = '', cursor, limit = 100 }) {
        const collected = [];
        function walk(dir, relBase) {
            if (!existsSync(dir)) return;
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(full, rel);
                else if (rel.startsWith(prefix)) collected.push({ key: rel, uploaded: statSync(full).mtime });
            }
        }
        walk(R2_DIR, '');
        collected.sort((a, b) => a.key.localeCompare(b.key));
        const start = Number(cursor) || 0;
        const page = collected.slice(start, start + limit);
        return {
            objects: page,
            truncated: collected.length > start + limit,
            cursor: String(start + limit),
        };
    },
};

const env = {
    DB,
    LOGS_BUCKET,
    FEEDBACK_READ_TOKEN: LOCAL_READ_TOKEN,
    FEEDBACK_ADMIN_TOKEN: LOCAL_ADMIN_TOKEN,
    RELEASE_PREPARE_TOKEN: LOCAL_PREPARE_TOKEN,
    RELEASE_PUBLISH_SECRET: LOCAL_PUBLISH_SECRET,
    UPDATE_SIGNING_PRIVATE_KEY_JWK: JSON.stringify(signingBundle.privateKeyJwk),
    UPDATE_SIGNING_KEY_ID: signingBundle.keyId,
    UPLOADS_ENABLED: 'true',
    POW_BITS: '16',
    DAILY_UPLOAD_LIMIT: '100',
    STORAGE_LIMIT_BYTES: '268435456',
};

function getLanIpv4Addresses() {
    const out = [];
    const nets = os.networkInterfaces();
    for (const [name, list] of Object.entries(nets)) {
        for (const item of list || []) {
            if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) {
                out.push({ iface: name, address: item.address });
            }
        }
    }
    return out;
}

const server = http.createServer(async (req, res) => {
    try {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        const bodyBuf = Buffer.concat(chunks);
        const hostHeader = req.headers.host || `127.0.0.1:${PORT}`;
        const url = `http://${hostHeader}${req.url || '/'}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) v.forEach(item => headers.append(k, item));
            else if (v !== undefined) headers.set(k, v);
        }
        const request = new Request(url, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : bodyBuf,
        });
        const response = await worker.fetch(request, env);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => {
            if (k.toLowerCase() === 'set-cookie') {
                // Allow HTTP cookie on local LAN sandbox without Secure attribute blocking browser login
                res.setHeader(k, v.replace(/;\s*Secure/gi, ''));
            } else {
                res.setHeader(k, v);
            }
        });
        const outBuf = Buffer.from(await response.arrayBuffer());
        res.end(outBuf);
    } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`Local Sandbox Error: ${err?.stack || err}`);
    }
});

server.listen(PORT, HOST, () => {
    const lans = getLanIpv4Addresses();
    console.log('==============================================================');
    console.log('  听屿本地开发者测试后台 (100% 隔离沙盒 · 零生产影响)');
    console.log('==============================================================');
    console.log(`本机浏览器管理后台: http://127.0.0.1:${PORT}/admin`);
    for (const lan of lans) {
        console.log(`局域网设备访问地址 (${lan.iface}): http://${lan.address}:${PORT}`);
    }
    console.log('');
    console.log(`管理员登录令牌 (FEEDBACK_ADMIN_TOKEN): ${LOCAL_ADMIN_TOKEN}`);
    console.log(`只读登录令牌   (FEEDBACK_READ_TOKEN) : ${LOCAL_READ_TOKEN}`);
    console.log(`发布确认密钥   (RELEASE_PUBLISH_SECRET): ${LOCAL_PUBLISH_SECRET}`);
    console.log(`本地测试公钥   (SPKI / ${signingBundle.keyId}): ${signingBundle.publicKeySpkiBase64}`);
    console.log(`持久化数据目录 : ${DATA_DIR}`);
    console.log('==============================================================');
    console.log('按 Ctrl+C 可随时关闭；再次运行本脚本将保留已生成的邀请码与设备状态。');
});
