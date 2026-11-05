import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2));
  await rename(temporary, path);
}
export async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function withLock(path, operation) {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let handle;
  const deadline = Date.now() + 10000;
  while (!handle) {
    try { handle = await open(lockPath, 'wx'); await handle.writeFile(String(process.pid)); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = Number(await readFile(lockPath, 'utf8').catch(() => ''));
      if (owner > 0) {
        try { process.kill(owner, 0); } catch (err) { if (err.code === 'ESRCH') { await unlink(lockPath).catch(() => {}); continue; } }
      }
      if (Date.now() > deadline) throw new Error('Storage busy; retry later');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try { return await operation(); }
  finally { await handle.close(); await unlink(lockPath); }
}

export class BudgetAccount {
  static async changeLimit(path, limit, reason) {
    if (!(Number.isFinite(limit) && limit > 0) || !reason?.trim()) throw new Error('Limit change needs an explicit reason');
    await withLock(path, async () => {
      const state = await readJSON(path);
      if (state.spent > limit) throw new Error('New limit is below already spent amount');
      state.limitChanges ??= [];
      state.limitChanges.push({ previous: state.limit, limit, reason, at: new Date().toISOString(), spent: state.spent });
      state.limit = limit;
      await atomicJSON(path, state);
    });
  }
  static async open(path, { limit = 1, initialSpent = 0 } = {}) {
    if (!(Number.isFinite(limit) && limit > 0 && Number.isFinite(initialSpent) && initialSpent >= 0 && initialSpent <= limit)) throw new Error('Invalid budget');
    const account = new BudgetAccount(); account.path = path;
    await withLock(path, async () => {
      const existing = await readJSON(path, null);
      if (existing && existing.limit !== limit) throw new Error('Persistent budget limit differs; refusing implicit reset');
      account.state = existing ?? { limit, spent: initialSpent, calls: [] };
      await atomicJSON(path, account.state);
    });
    return account;
  }
  get spent() { return this.state.spent; }
  get limit() { return this.state.limit; }
  get calls() { return this.state.calls; }
  async reserve(amount, metadata) {
    if (!(Number.isFinite(amount) && amount >= 0)) throw new Error('Invalid reservation');
    return withLock(this.path, async () => {
      this.state = await readJSON(this.path);
      if (this.state.spent + amount > this.state.limit) throw new Error('Budget exhausted before request');
      const id = randomUUID();
      this.state.spent += amount;
      this.state.calls.push({ id, ...metadata, cost: amount, status: 'reserved' });
      await atomicJSON(this.path, this.state);
      return id;
    });
  }
  async settle(id, details) {
    await withLock(this.path, async () => {
      this.state = await readJSON(this.path);
      const entry = this.state.calls.find(x => x.id === id);
      if (!entry || entry.status !== 'reserved') throw new Error('Unknown or settled reservation');
      this.state.spent += details.cost - entry.cost;
      Object.assign(entry, details, { status: 'settled' });
      await atomicJSON(this.path, this.state);
    });
  }
}
