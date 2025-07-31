import { getAuthToken } from './runtimeConfig';
// src/services/jobService.js

// Make sure you’ve defined in .env:
//   REACT_APP_PE_API_URL=https://bmss.pehosted.com

export async function DownloadBulkList(listId) {
    const token = getAuthToken();
  const res = await fetch(`/DownloadBulkList/${encodeURIComponent(listId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // add Authorization if you need it:
       'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) {
    throw new Error(`Error processing bulk print list for list id ${listId}: ${res.status} ${res.statusText}`);
  }
  return res.blob();
}
