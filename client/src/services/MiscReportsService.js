export async function getMiscReports(reportType, reportDate) {
  console.log(`Getting Misc Report (${reportType}) for date ${reportDate} from API...`);
   const res = await fetch(`/api/getMiscReports/${reportType}/${reportDate}`, {
    method: "GET"
  });

const responseData = await res.json();

  console.log(responseData);
  
  return responseData;
}