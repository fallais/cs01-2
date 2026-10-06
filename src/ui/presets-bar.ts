import { PARAM_BY_ID } from '../audio/params';
import {
  FACTORY_PATCHES,
  capturePatch,
  fullPatch,
  loadUserPatches,
  patchFromJson,
  patchToJson,
  saveUserPatches,
  type Patch,
} from '../presets';
import type { Synth } from '../synth';
import { h } from './dom';

/** Patch selector, save / delete, JSON export / import. */
export function buildPresetBar(root: HTMLElement, synth: Synth): void {
  let user = loadUserPatches();
  let currentName = FACTORY_PATCHES[0]!.name;
  let loading = false;

  const select = h('select', { id: 'patch-select', class: 'patch-select' });
  const edited = h('span', { class: 'edited', title: 'Edited since loaded', hidden: true }, '●');
  const nameInput = h('input', {
    type: 'text',
    id: 'patch-name',
    class: 'patch-name',
    maxlength: 40,
    placeholder: 'Patch name',
    'aria-label': 'Name for saving',
    autocomplete: 'off',
  });
  const saveBtn = h('button', { type: 'button' }, 'Save');
  const deleteBtn = h('button', { type: 'button' }, 'Delete');
  const exportBtn = h('button', { type: 'button' }, 'Export');
  const importBtn = h('button', { type: 'button' }, 'Import');
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-hidden': 'true' });
  const status = h('span', { class: 'patch-status', role: 'status', 'aria-live': 'polite' });

  let statusTimer = 0;
  const say = (msg: string) => {
    status.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (status.textContent = ''), 4000);
  };

  const fill = () => {
    select.replaceChildren();
    const fg = h('optgroup', { label: 'Factory' });
    FACTORY_PATCHES.forEach((p, i) => fg.append(h('option', { value: `f:${i}` }, p.name)));
    select.append(fg);
    if (user.length) {
      const ug = h('optgroup', { label: 'User' });
      user.forEach((p, i) => ug.append(h('option', { value: `u:${i}` }, p.name)));
      select.append(ug);
    }
  };

  const selected = (): { patch: Patch; isUser: boolean; index: number } | null => {
    const [kind, idx] = select.value.split(':');
    const index = Number(idx);
    const patch = kind === 'u' ? user[index] : FACTORY_PATCHES[index];
    return patch ? { patch, isUser: kind === 'u', index } : null;
  };

  const load = (patch: Patch) => {
    loading = true;
    synth.setMany(fullPatch(patch.values));
    loading = false;
    currentName = patch.name;
    nameInput.value = patch.name;
    edited.hidden = true;
  };

  const selectUser = (name: string) => {
    const i = user.findIndex((p) => p.name === name);
    if (i >= 0) select.value = `u:${i}`;
    deleteBtn.disabled = i < 0;
  };

  select.addEventListener('change', () => {
    const s = selected();
    if (!s) return;
    load(s.patch);
    deleteBtn.disabled = !s.isUser;
  });

  synth.onParam((id) => {
    if (!loading && PARAM_BY_ID[id].patch) edited.hidden = false;
  });

  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || currentName;
    const patch = capturePatch(name, synth.values);
    const existing = user.findIndex((p) => p.name === name);
    const next = existing >= 0 ? user.map((p, i) => (i === existing ? patch : p)) : [...user, patch];
    if (!saveUserPatches(next)) {
      say('Could not save: browser storage is unavailable.');
      return;
    }
    user = next;
    currentName = name;
    fill();
    selectUser(name);
    edited.hidden = true;
    say(`Saved “${name}”.`);
  });

  deleteBtn.addEventListener('click', () => {
    const s = selected();
    if (!s?.isUser) return;
    const next = user.filter((_, i) => i !== s.index);
    if (!saveUserPatches(next)) {
      say('Could not delete: browser storage is unavailable.');
      return;
    }
    user = next;
    fill();
    select.value = 'f:0';
    deleteBtn.disabled = true;
    say(`Deleted “${s.patch.name}”.`);
  });

  exportBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || currentName;
    const blob = new Blob([patchToJson(capturePatch(name, synth.values))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${name.replace(/[^\w.-]+/g, '_') || 'patch'}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('File is too large to be a patch.');
      const patch = patchFromJson(await file.text());
      load(patch);
      const next = [...user.filter((p) => p.name !== patch.name), patch];
      if (saveUserPatches(next)) {
        user = next;
        fill();
        selectUser(patch.name);
        say(`Imported “${patch.name}”.`);
      } else {
        say(`Loaded “${patch.name}” (could not store it).`);
      }
    } catch (err) {
      say(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  fill();
  select.value = 'f:0';
  deleteBtn.disabled = true;
  nameInput.value = currentName;

  root.append(
    h('label', { for: 'patch-select', class: 'patch-label' }, 'Patch'),
    h('span', { class: 'patch-pick' }, select, edited),
    nameInput,
    h('span', { class: 'patch-buttons' }, saveBtn, deleteBtn, exportBtn, importBtn),
    fileInput,
    status,
  );
}
