// import { v4 as uuidv4 } from 'uuid';

// Replace these with your real fetch/save calls:
async function fetchAll() {
  const res = await fetch('/api/narratives');
  return res.ok ? res.json() : Promise.reject('Fetch failed');
}

async function saveAll(items) {
  const res = await fetch('/api/narratives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error('Save failed');
}

// Public API:
export async function loadNarratives() {
  return fetchAll();
}

export async function addNarrative(newItem) {
  //const all = await fetchAll(); NEEDS BACKEND API SET UP
  //const updated = [...all, newItem];
  //await saveAll(updated);
  console.log('Adding narrative:', newItem);
  return true; //true until API is set up
}

export async function updateNarrative(updatedItem) {
  const all = await fetchAll();
  const updated = all.map(i => (i.id === updatedItem.id ? updatedItem : i));
  await saveAll(updated);
  return updatedItem;
}

export async function deleteNarrative(id) {
  const all = await fetchAll();
  const updated = all.filter(i => i.id !== id);
  await saveAll(updated);
  return id;
}
