const { DefaultAzureCredential } = require("@azure/identity");

module.exports = async function (context, req) {
const reportType = context.bindingData.reportType;
const reportDate = context.bindingData.reportDate;
const url = `https://prod-46.eastus.logic.azure.com/workflows/17b505b41d014f10be80f468afe07036/triggers/When_a_HTTP_request_is_received/paths/invoke/report/${reportType}/date/${reportDate}?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=9b3NSIre-eOJL7_pyNTCgJbGrP9lm4dxxJaK-unAtvY`;

    const mainBody = await fetch(
    url,
    {
      method:  'GET'
    }
  );
  
  const returnBody = await mainBody.json();
  console.log(returnBody);

    context.res = {
      status: 200,
      body: returnBody
    };
  }