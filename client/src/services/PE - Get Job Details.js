import { getAuthToken } from './runtimeConfig';
// src/services/jobService.js

// Make sure you’ve defined in .env:
//   REACT_APP_PE_API_URL=https://bmss.pehosted.com

export async function getJobDetails(jobId) {
    const token = getAuthToken();
  const res = await fetch(`/GetDetails/${jobId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // add Authorization if you need it:
       'Authorization': `Bearer ${token}`
    },
  });
  if (!res.ok) {
    throw new Error(`Error fetching job ${jobId}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
