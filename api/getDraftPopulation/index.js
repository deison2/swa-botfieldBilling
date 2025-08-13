//const sampleDraftsResponse = require("../sampleData/sampleDraftsResponse.json");
//const sampleDraftDetail = require("../sampleData/sampleDraftDetail.json");
//const sampleDraftNarr = require("../sampleData/sampleDraftNarr.json");
//const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");

const baseConfig = {
  server: process.env.AZURE_SQL_SERVER,      // e.g. "myserver.database.windows.net"
  database: process.env.AZURE_SQL_DATABASE,  // e.g. "mydb"
  options: { encrypt: true, trustServerCertificate: false },
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  port: process.env.AZURE_SQL_PORT ? parseInt(process.env.AZURE_SQL_PORT) : 1433
};


const draftAnalysis = "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/draftAnalysis?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";
const draftDetail = "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/draftDetail?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";
const draftNarr = "https://prod-43.eastus.logic.azure.com/workflows/22d673f179c34ca1a0f03a893180ba74/triggers/When_a_HTTP_request_is_received/paths/invoke/type/draftNarr?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=nXcXecHk2xjH_LJEY51DbqSi7nio8-8wJGP9Frth_Ug";

module.exports = async function (context, req) {

function attachDetailMatches(
  mainArray,
  subArray,
  mainKey,
  subKey,
  propName,
  {
    normalize = v => String(v),
    mainContKey = "CONTINDEX",   // mainArray's contindex key
    subContKey  = "CONTINDEX"    // subArray's contindex key
  } = {}
) {
  if (!propName) throw new Error("propName is required");

  // 1) Group subArray by composite key: subKey + subContKey
  const groups = new Map();
  for (const item of subArray) {
    const k1 = normalize(item?.[subKey]);
    const k2 = normalize(item?.[subContKey]);
    const composite = `${k1}||${k2}`;
    if (!groups.has(composite)) groups.set(composite, []);
    groups.get(composite).push(item);
  }

  // 2) Map mainArray, attaching matches where BOTH keys line up
  return mainArray.map(obj => {
    const k1 = normalize(obj?.[mainKey]);
    const k2 = normalize(obj?.[mainContKey]);
    const composite = `${k1}||${k2}`;
    return { ...obj, [propName]: groups.get(composite) ?? [] };
  });
}


function attachNarrMatches(
  mainArray,
  subArray,
  mainKey,
  subKey,
  propName,
  { normalize = v => String(v) } = {}
) {

  // 1) Group subArray by subKey
  const groups = new Map();
  for (const item of subArray) {
    const k = normalize(item?.[subKey]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }

  // 2) Map mainArray, attaching the matching group under propName
  return mainArray.map(obj => {
    const k = normalize(obj?.[mainKey]);
    return { ...obj, [propName]: groups.get(k) ?? [] };
  });
}

function toRolesArray(arr) {
  const dedupePreserveOrder = (vals) => {
    const seen = new Set();
    const out = [];
    for (const v of vals) {
      if (v == null || v === "") continue;               // skip null/empty
      const key = typeof v === "string" ? v.toLowerCase() : v;
      if (!seen.has(key)) { seen.add(key); out.push(v); }
    }
    return out;
  };

  return arr.map(({ COEmail, CPEmail, CMEmail, ...rest }) => {
    const ROLES = dedupePreserveOrder([COEmail, CPEmail, CMEmail]);
    return { ...rest, ROLES };
  });
}

    const mainBody = await fetch(
    draftAnalysis,
    {
      method:  'POST'
    }
  );

  const detailBody = await fetch(
    draftDetail,
    {
      method:  'POST'
    }
  );

  const narrBody = await fetch(
    draftNarr,
    {
      method:  'POST'
    }
  );


const appendArray0 = toRolesArray(await mainBody.json());
const appendArray1 = attachDetailMatches(appendArray0, await detailBody.json(), "DRAFTFEEIDX", "DRAFTFEEIDX", "DRAFTDETAIL");
const appendArray2 = attachNarrMatches(appendArray1, await narrBody.json(), "DRAFTFEEIDX", "DRAFTFEEIDX", "NARRATIVEDETAIL");

  if (!mainBody.ok || !detailBody.ok || !narrBody.ok) {
    context.res = {
      status: 500,
      body:   "draftAnalysis Response - " + mainBody.statusText + " draftDetail Response - " + detailBody.statusText + " draftNarr Response - " + narrBody.statusText
    };
    return;
  }

  // Proxy the JSON back to the client
  const json = appendArray2;
  console.log(json[0]);


    context.res = {
    status: 200,
    body: json
  };
  return;
};
  /*
  try {
    // TODO: build params from req.query / req.body as needed
    const pool = await getPool();

      const result = await pool.request().query(`with pop as (
select jh.*
from tblJob_Header jh
join (select ServPeriod from tblTranWIP where coalesce(WIPOutstanding, 0) >0 and WIPDate <= '2025-07-15' and WIPService not in ('HR', 'LEGACY', 'PTO', 'LEGACYNC', 'ADMIN') group by ServPeriod) tw
on jh.Job_Idx = tw.ServPeriod
join tblEngagement e
on jh.ContIndex = e.ContIndex 
--and e.ClientOffice in ('BHM', 'GAD') 
--and e.ClientOffice in ('HSV','RGD','MOB')
and e.ClientStatus != 'INTERNAL'
)
--select * from pop where ContIndex = 3811
, mthyr as (
select case
                                when month(getdate()) = 1 then 11
                                when month(getdate()) = 2 then 12
                                else month(getdate()) - 2
                                end mth
                , case
                                when month(getdate()) in (1, 2) then year(getdate())-1
                                else year(getdate())
                                end yr
)
--select * from tbltran_draft_fee_narrative;
--select * from information_schema.columns where lower(column_name) like '%draftfeeidx%';
--select * from tblTran_Draft_WIP_Alloc;
, bystaffgranular as (
select draftfeeidx
    , s.staffname
    , wipdate
    , jobtitle
    , task_subject
    , wiphours
    , wipamount
    , billamount
    , billwoff
    , coalesce(narrative, '') narrative
    , coalesce(notes, '') notes
from tblTran_Draft_WIP_Alloc tdwa
join tblstaff s
on tdwa.staffindex = s.staffindex
join tbljob_task jt
on tdwa.taskindex = jt.taskindex
)
--select * from bystaff;
, drafts as (
select DraftFeeIdx
                , CONTINDEX
                , ServPeriod
                , JOBTITLE
                , js.servindex
                , sum(BillAmount) DraftAmount
                , sum(WIPAmount) DraftWIP
                , sum(BillWOFF) write_off_up
                
from tblTran_Draft_WIP_Alloc tdwa
join tbljob_serv js
on tdwa.servperiod = js.job_idx
group by DraftFeeIdx, ServPeriod, jobtitle, contindex, js.servindex
) 
, tw as (
select servperiod, transtypeindex, wipanalysis, wipdate, wipindex, wiphours, wipbilled, wipamount, wipoutstanding, 'tw' tablename from tblTranWIP
        union
 select servperiod, transtypeindex, wipanalysis, wipdate, wipindex, wiphours, billamount, wipamount, wipoutstanding, 'thwa' tablename from tbltran_history_wip_alloc
    where chargename = 'Unallocated'
)
, narr as (
select tdfn.* 
from tbltran_draft_fee_narrative tdfn
--group by draftfeeidx
)
, existingdraft as (
select d.draftfeeidx 
    , e.contindex
    , e.clientcode
    , e.clientname
    , e.clientoffice
    , co.staffindex co_idx
    , co.staffname originator
    , cp.staffindex cp_idx
    , cp.staffname clientpartner
    , cm.staffindex cm_idx
    , cm.staffname clientmanager
    , sum(draftwip) wip
    , sum(draftamount) billed
    , sum(write_off_up) "Write Off(Up)"
    , concat('https://bmsshosted.com/PE/Billing/FeeWizard/',d.DraftFeeIdx) DraftHyperlink
    , co.staffuser COEmail
	, cp.staffuser CPEmail
	, cm.staffuser CMEmail
from drafts d
join tblengagement e
on d.contindex = e.contindex
join tblclientorigination orig
on orig.contindex = e.contindex
join tblstaff co
on orig.staffindex = co.staffindex
join tblstaff cp
on e.clientpartner = cp.staffindex
join tblstaff cm
on e.clientmanager = cm.staffindex
join narr
on d.draftfeeidx = narr.draftfeeidx
group by d.draftfeeidx 
    , e.contindex
    , e.clientcode
    , e.clientname
    , e.clientoffice
    , co.staffindex 
    , co.staffname 
    , cp.staffindex 
    , cp.staffname 
    , cm.staffindex 
    , cm.staffname
    --, narr.narrativedetail
    , co.staffuser
    , cp.staffuser
    , cm.staffuser
)
--select array_agg(object_construct(*)) timeentry from bystaffgranular;
select * from existingdraft
--where draftfeeidx = 93838
order by clientcode asc
;`);
*/