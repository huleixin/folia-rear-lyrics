// dev/folium/sample-playback-console/index.cjs
// Folium 1.5 sample, Node half: keeps the playback failures the client reports.
//
//   - `recordFailure` appends one JSON line to failures.log under api.storage.paths.data (files to
//     keep). The log rolls over to failures.1.log past 256 KB, so it never grows without bound.
//   - recent-failures.json under api.storage.paths.cache holds the newest 30 records for the page.
//     It is only a cache: the user can empty it from the mods panel at any time, even while this
//     mod runs, and the next read rebuilds it from the logs (`recentFailures`).
//
// Both directories come from getters that need `filesystem.data` and re-create a missing directory
// on every read, so they are read per operation rather than kept from activate().

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = 'failures.log';
const OLD_LOG_FILE = 'failures.1.log';
const CACHE_FILE = 'recent-failures.json';
const MAX_LOG_BYTES = 256 * 1024;
const MAX_RECENT = 30;
const REASONS = new Set(['auth', 'restricted', 'taken-down', 'network', 'unknown']);
const PHASES = new Set(['play', 'restore', 'mid-playback']);

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');

/* Keeps only the fields this sample writes, so whatever the renderer sends cannot fill the log with anything else. */
const sanitizeRecord = (input) => {
  const record = input && typeof input === 'object' ? input : {};
  const song = record.song && typeof record.song === 'object' ? record.song : null;
  return {
    id: text(record.id, 64) || String(Date.now()),
    at: Number.isFinite(record.at) ? record.at : Date.now(),
    song: song ? { title: text(song.title), artist: text(song.artist), source: text(song.source, 40) || null } : null,
    reason: REASONS.has(record.reason) ? record.reason : 'unknown',
    phase: PHASES.has(record.phase) ? record.phase : 'play',
    willAutoSkip: record.willAutoSkip === true,
  };
};

const readLines = async (file) => {
  try {
    return (await fs.promises.readFile(file, 'utf8')).split('\n');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

module.exports = function activate(api) {
  // Folium 1.4 hosts have no api.storage.paths.
  if (!('paths' in api.storage)) {
    api.log.warn('sample-playback-console needs Folium 1.5 (api.storage.paths); failures are not recorded');
    return;
  }

  const logFile = () => path.join(api.storage.paths.data, LOG_FILE);
  const oldLogFile = () => path.join(api.storage.paths.data, OLD_LOG_FILE);
  const cacheFile = () => path.join(api.storage.paths.cache, CACHE_FILE);

  // One file operation at a time: a record and a read arriving together must not interleave.
  let chain = Promise.resolve();
  const serial = (task) => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };

  /* The newest records, newest first, straight from the logs. */
  const rebuildRecent = async () => {
    const records = [];
    for (const line of [...await readLines(oldLogFile()), ...await readLines(logFile())]) {
      if (!line.trim()) continue;
      try {
        records.push(sanitizeRecord(JSON.parse(line)));
      } catch {
        // A torn line (the app quit mid-write) is skipped.
      }
    }
    return records.slice(-MAX_RECENT).reverse();
  };

  const writeRecent = (items) => fs.promises.writeFile(
    cacheFile(),
    JSON.stringify({ version: 1, items: items.slice(0, MAX_RECENT) }),
    'utf8',
  );

  /* The cache when it is there and readable; otherwise rebuilt from the logs and written back. */
  const readRecent = async () => {
    try {
      const cached = JSON.parse(await fs.promises.readFile(cacheFile(), 'utf8'));
      if (cached && cached.version === 1 && Array.isArray(cached.items)) return cached.items.slice(0, MAX_RECENT);
    } catch {
      // Missing (emptied from the mods panel) or damaged: rebuild below.
    }
    const items = await rebuildRecent();
    await writeRecent(items);
    return items;
  };

  const rollLogIfLarge = async () => {
    try {
      if ((await fs.promises.stat(logFile())).size >= MAX_LOG_BYTES) {
        await fs.promises.rename(logFile(), oldLogFile());
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };

  api.rpc.handle('recordFailure', (input) => serial(async () => {
    const record = sanitizeRecord(input);
    // Read before appending, so a rebuilt cache does not list this record twice.
    const recent = await readRecent().catch(() => []);
    await rollLogIfLarge();
    await fs.promises.appendFile(logFile(), `${JSON.stringify(record)}\n`, 'utf8');
    try {
      await writeRecent([record, ...recent.filter((item) => item && item.id !== record.id)]);
    } catch (error) {
      // The log has the record; the cache catches up on its next rebuild.
      api.log.warn('could not update the recent-failures cache', String(error));
    }
    return { logged: true };
  }));

  api.rpc.handle('recentFailures', () => serial(readRecent));

  api.log.info(`sample-playback-console ${api.manifest.version} (folium ${api.host.folium.major}.${api.host.folium.minor})`);
};
