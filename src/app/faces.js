import * as account from '../account.js';
import { state } from './core.js';
import { paintAvatarInto } from './social.js';

const known = new Map();

const friendRow = (id) => state.social?.friends?.find((f) => f.otherId === id)?.profile ?? null;

export function faceOf(id) {
  return friendRow(id) ?? known.get(id) ?? null;
}

export async function facesFor(ids) {
  const wanted = [...new Set(ids.filter(Boolean))].filter((id) => !faceOf(id) && !known.has(id));
  if (!wanted.length || !account.configured) return;
  let rows = [];
  try { rows = await account.profilesById(wanted.slice(0, 100)); } catch { rows = []; }
  for (const id of wanted) known.set(id, rows.find((r) => r.id === id) ?? null);
}

export const forgetFace = (id) => { known.delete(id); };

export async function paintFaces(root, { fallback = null } = {}) {
  const marks = [...root.querySelectorAll('[data-face]')];
  const paint = () => {
    for (const mark of marks) {
      const row = faceOf(mark.dataset.face);
      if (row) paintAvatarInto(mark, row);
      else if (fallback) paintAvatarInto(mark, { username: fallback(mark), level: Number(mark.dataset.level) || 1 });
    }
  };
  paint();
  await facesFor(marks.map((m) => m.dataset.face));
  if (root.isConnected) paint();
}
