const sampleGranularJobData = require("../sampleData/sampleGranularJobData.json");
const { DefaultAzureCredential } = require("@azure/identity");

const granularJobData = "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/granularJobData?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";


module.exports = async function (context, req) {

  const bodyDate = req.body?.billThroughDate;
  const endOfPrevMonthISO = () => {
    const d = new Date();
    const eom1 = new Date(d.getFullYear(), d.getMonth(), 0);
    const y = eom1.getFullYear(), m = String(eom1.getMonth() + 1).padStart(2, '0'), day = String(eom1.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const billThroughDate =
    /^\d{4}-\d{2}-\d{2}$/.test(bodyDate) ? bodyDate : endOfPrevMonthISO();

  const postInit = (payload) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const payload = { billThroughDate };

  const mainBody = await fetch(granularJobData, postInit(payload));

  const sampleGranularJobData = await mainBody.json();


    context.res = {
      status: 200,
      body: sampleGranularJobData
    };
  }