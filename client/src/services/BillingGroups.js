export async function dynamicClientLoad(searchText) {
   const res = await fetch('/api/dynamicClientLoad', {
    method: "POST",
    body: JSON.stringify({
        "searchText": encodeURIComponent(searchText)
        })
  });
  
  return res.json();
}

export async function dynamicChildBillLoad(searchText) {
  const res = await fetch('/api/dynamicChildBillLoad', {
    method: "POST",
    body: JSON.stringify({
        "searchText": encodeURIComponent(searchText)
        })
  });
  
  return res.json();
}

export async function dynamicClientGroupings(searchText) {
   const res = await fetch('/api/dynamicClientGroupings', {
    method: "POST",
    body: JSON.stringify({
        "searchText": encodeURIComponent(searchText)
        })
  
  });
  return res.json();
}

export async function updateClientGrouping(client, newGrouping) {
  const res = await fetch('/api/updateClientGrouping', {
    method: "POST",
    body: JSON.stringify({
        "client": encodeURIComponent(client),
        "newGrouping": encodeURIComponent(newGrouping)
        })
  
  });
  return;
}

export async function updateBillingInstructions(clientCode, instructions) {
  const res = await fetch('/api/updateBillingInstructions', {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ "clientCode": clientCode,
                           "instructions": instructions })
  });
  return res;
}

export async function getBillingGroups() {
  console.log('Getting Billing Groups from API...');
  const res = await fetch('/api/billingGroups', {
    method: "GET"
});
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const tempBody = await res.json();
  console.log('Received Billing Groups from API:', tempBody);
  return tempBody;
}

export async function addBillingGroup(child, parent) {
  const res = await fetch('/api/billingGroups', {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ "child": child,
                           "parent": parent })
});
  if (!res.ok) {
    const text = await res.text(); // capture error payload
    throw new Error(`Load failed: ${res.status} ${text}`);
  }
  const tempBody = await res.json();
  return tempBody;
}