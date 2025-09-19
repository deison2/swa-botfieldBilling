// /api/CreateInvoiceBulkPrintList/index.js
module.exports = async function (context, req) {
  const invoiceIndexes = req.body.indexArray;  // array of DebtTranIndex integers
  const token = req.body.token;

  if (!Array.isArray(invoiceIndexes)) {
    context.res = {
      status: 400,
      body: 'Request body must be an array of invoice indexes (DebtTranIndex).'
    };
    return;
  }

  // Call the PE "BulkFeePrint" endpoint for invoices
  const apiRes = await fetch(
    'https://bmss.pehosted.com/PE/api/Reports/CreateBulkPrintList/BulkFeePrint',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(invoiceIndexes),
    }
  );

  const result = await apiRes.text();

  if (!apiRes.ok) {
    context.res = {
      status: apiRes.status,
      body: `Error creating invoice bulk print list: ${apiRes.status} ${result}`,
    };
    return;
  }

  // return the listId as text (same as your draft flow)
  context.res = { status: 200, body: result };
};
