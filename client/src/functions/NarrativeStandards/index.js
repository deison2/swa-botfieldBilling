// functions/narratives/index.js
import { fetchAll, saveAll, loadWithMeta } from '../api/narrativesStore.js';
import { v4 as uuid } from 'uuid';

export default async function (context, req) {
  const method = req.method;
  const id = context.bindingData.id; // from route '/api/narratives/{id?}'

  if (method === 'GET' && !id) {
    const items = await fetchAll();
    context.res = { body: items };
    return;
  }

  if (method === 'POST') {
    const { items, etag } = await loadWithMeta();
    const newItem = { uuid: uuid(), ...req.body };
    items.push(newItem);
    await saveAll(items, etag);
    context.res = { status: 201, body: newItem };
    return;
  }

  if (method === 'PUT' && id) {
    const { items, etag } = await loadWithMeta();
    const idx = items.findIndex(x => x.uuid === id);
    if (idx === -1) { context.res = { status: 404 }; return; }
    items[idx] = req.body;
    await saveAll(items, etag);
    context.res = { body: items[idx] };
    return;
  }

  if (method === 'DELETE' && id) {
    const { items, etag } = await loadWithMeta();
    const next = items.filter(x => x.uuid !== id);
    if (next.length === items.length) { context.res = { status: 404 }; return; }
    await saveAll(next, etag);
    context.res = { status: 204 };
    return;
  }

  context.res = { status: 405 };
}
