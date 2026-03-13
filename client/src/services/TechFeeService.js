import { getToken } from './ExistingDraftsService';

export async function readTechFeeData(payload) {
  const res = await fetch('/api/techFees/population', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { ...payload, runType: 'read' } }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`readTechFeeData failed: ${res.status} ${msg}`);
  }
  return res.json();
}

export async function writeTechFeeData(payload) {
  const res = await fetch('/api/techFees/population', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { ...payload, runType: 'write' } }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`writeTechFeeData failed: ${res.status} ${msg}`);
  }
  return res.json();
}

export async function readAuditRecords(payload) {
  const res = await fetch('/api/techFees/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { ...payload, runType: 'read' } }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`readAuditRecords failed: ${res.status} ${msg}`);
  }
  return res.json();
}


export async function writeAuditRecords(payload) {
  const res = await fetch('/api/techFees/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { ...payload, runType: 'write' } }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`writeAuditRecords failed: ${res.status} ${msg}`);
  }
  return res.json();
}


export async function createForcedTechFees(payload) {
  const res = await fetch('/api/techFees/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { ...payload, runType: 'write' } }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`createForcedTechFees failed: ${res.status} ${msg}`);
  }
  return res.json();
}