// Which checklist the dialog views use (remembered per browser).
import { api } from './api.js';
import { h, toast } from './ui.js';

const KEY = 'cqa.checklist';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch {} };

let cache = null;
async function lists() {
  if (!cache) {
    const pending = api.get('/api/checklists');
    cache = pending;
    pending.catch(() => {
      if (cache === pending) cache = null;
    });
  }
  return cache;
}
export function invalidateChecklists() {
  cache = null;
}

export async function currentChecklist() {
  const all = await lists();
  const id = get();
  if (id && all.some((c) => c.id === id)) return id;
  return all[0]?.id || 'chat-quality';
}

export async function checklistPicker(onChange) {
  const all = await lists();
  const cur = await currentChecklist();
  return h('label.check', 'Правила оценки: ',
    h('select', {
      style: { width: 'auto', marginLeft: '.3rem' },
      onchange: async (e) => {
        set(e.target.value);
        try { await onChange?.(e.target.value); }
        catch (error) { toast(error.message, 'err'); }
      },
    }, all.map((c) => h('option', { value: c.id, selected: c.id === cur }, `${c.name} (v${c.version})`))));
}
