const { DefaultAzureCredential } = require("@azure/identity");

const url = "https://prod-34.eastus.logic.azure.com:443/workflows/720a09fd25ee4402988dbce84d5007af/triggers/manual/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=yF_ioqGToBw5rJikWkKay-VUdCKXlYNHADt9A_tODiA";


module.exports = async function (context, req) {
//const searchText = req.body.searchText;
const reqBody = {
                 runType: "read",
                 billThroughDate: "2026-01-15",
                 filteredPopulation: []
                };
    const mainBody = await fetch(
    url,
    {
      method:  'POST',
      body: JSON.stringify(reqBody)
    }
  );

  const jsonBody = await mainBody.json();


    context.res = {
      status: 200,
      body: jsonBody
    };
  }