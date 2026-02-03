export async function readPopulation() {
  const res = await fetch("/api/techFee");
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const tempBody = await res.json();
  return tempBody;
}


export async function writePopulation(item) {
  const res = await fetch("/api/techFee", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}