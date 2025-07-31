import { getAuthToken } from './runtimeConfig';
// src/services/jobService.js

// Make sure you’ve defined in .env:
//   REACT_APP_PE_API_URL=https://bmss.pehosted.com

export async function CreateBulkPrintList(draftindexes) {
  // const body = JSON.stringify(draftindexes);
  // console.log(body);
  console.log(!Array.isArray(draftindexes) ? 'Array of draft indexes' : 'Not an array');
  const token = getAuthToken();
  const res = await fetch('/CreateBulkPrintList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // add Authorization if you need it:
       'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(draftindexes)
  });
  if (!res.ok) {
    throw new Error(`Error creating bulk print list for draft indexes ${draftindexes}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
