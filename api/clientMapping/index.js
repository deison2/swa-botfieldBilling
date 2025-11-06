const { DefaultAzureCredential } = require("@azure/identity");

module.exports = async function (context, req) {
const reportType = context.bindingData.reportType;
const reportDate = context.bindingData.reportDate;
const url = 'https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/clientMapping?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug';

    const mainBody = await fetch(
    url,
    {
      method:  'POST'
    }
  );
  
  const returnBody = await mainBody.json();

    context.res = {
      status: 200,
      body: returnBody
    };
  }