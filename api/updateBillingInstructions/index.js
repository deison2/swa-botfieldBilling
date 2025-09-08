  const { DefaultAzureCredential } = require("@azure/identity");

const url = "https://prod-95.eastus.logic.azure.com/workflows/e88be11a8b504ab3a321a18d2cde17b3/triggers/When_a_HTTP_request_is_received/paths/invoke/function/blank?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=rFcsmvagQ-Mi20B6rTlDRNng4K7aGqpxxOL5qLBqpfA";


module.exports = async function (context, req) {
    console.log('Received request for updating billing instructions with body:', req.body);
  const clientCode = req.body.clientCode;
  const billingInstructions = req.body.instructions;
    const mainBody = await fetch(
    url,
    {
      method:  'POST',
      body: JSON.stringify({
        "client": clientCode,
        "billingInstructions": billingInstructions,
        "ColumnName" : "UpdateBillingInstructions"
        })
    }
  );
    context.res = {
      status: 200
    };
  }