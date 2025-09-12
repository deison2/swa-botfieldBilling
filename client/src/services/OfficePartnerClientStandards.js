const baseAPI = "/api/standards";

export async function getStandards(type, searchText) {
  console.log(`Getting ${type} Standards from API...`);
  let clientParm = '';
  if (type === 'client' && searchText) clientParm = `/${searchText}`;
  const res = await fetch(`${baseAPI}/${type}${clientParm}`, {
    method: "GET"
  });
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const returnBody = await res.json();
  console.log(returnBody);
  return returnBody;
}

export async function updateStandards(type, id, value) {
  const res = await fetch(`${baseAPI}/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id, 
                           value: value })
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}