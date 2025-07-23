// Replace these with your real fetch/save calls:

const API = 'http://localhost:3001/api/narratives';

export async function loadNarratives() {
  const res = await fetch(API);
  if (!res.ok) throw new Error('load failed');
  return res.json();
}

export async function addNarrative(item) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('add failed');
  return res.json();
}

export async function updateNarrative(item) {
  const res = await fetch(`${API}/${item.uuid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('update failed');
  return res.json();
}

export async function deleteNarrative(uuid) {
  const res = await fetch(`${API}/${uuid}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('delete failed');
} 