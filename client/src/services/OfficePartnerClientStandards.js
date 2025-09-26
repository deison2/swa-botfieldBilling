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

export async function updateStandards(type, id, serv, value) {
  const body = {
    id,
    value,
  };

  if (serv != null) {
    body.serv = serv;   // only add when serv is not null
  }

  const res = await fetch(`${baseAPI}/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error("Update failed");
  return res.json();
}