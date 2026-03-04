module.exports = async function (context, req) {

  console.log(context.bindingData);  
  const method = context.bindingData.methodType.toUpperCase();
  const EditType = context.bindingData.editType;
  const DebtTranIndex = context.bindingData.debtTranIndex;
  const DebtNarrIndex = context.bindingData.debtNarrIndex;
  const token = req.body.token;
  const payload = req.body.payload;
  console.log(EditType, method, DebtTranIndex, DebtNarrIndex, payload);

  // First, check method, then check edit type
    switch (method) {
      case "GET": {
        // Check on edit type
        switch (EditType) {
            case "Analysis": {
                const apiRes = await fetch(
                `https://bmss.pehosted.com/pe/api/Billing/DraftFeeAnalysis/${DebtTranIndex}`,
                {
                     method:  'GET',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    }
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft analysis data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }
            case "createDraft": {
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/NewDraftFeeJobs',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `New Draft Fee Jobs: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }
            case "WIP": {
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeClientOrGroupWIPList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft analysis data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }

            case "Narrative": {
                const apiRes = await fetch(
                `https://bmss.pehosted.com/pe/api/Billing/DraftFeeNarrativeList/${DebtTranIndex}`,
                {
                     method:  'GET',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    }
                }
                );

                const result = await apiRes.text();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft analysis data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }

            case "createJob": {
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeNewDraftJobs',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                }
                );
                const result = await apiRes.json();
                if (!apiRes.ok) {
                    context.res = { status: apiRes.status, body: `Error getting new draft jobs: ${apiRes.status}` };
                    return;
                }
                context.res = { status: 200, body: result };
                return;
            }
        }
      }

      case "POST": {
        switch (EditType) {
            case "Analysis": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeAddClients',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.json();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving edits to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
            }
            case "createDraft": {
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeCreateManual',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `New Draft Fee Jobs: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }
            case "WIP": {
                const apiRes = await fetch(
                `https://bmss.pehosted.com/pe/api/Billing/DraftFeeWIPSpecialWIPList/${DebtTranIndex}`,
                {
                     method:  'GET',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    }
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting WIP Indexes from draft data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }

            
            case "DraftFeeWIPEditAnalysis": {
                const apiPath = payload.entryLevel;
                const WIPIds = payload.WIPIds;
                const rawBody = {
                        "DebtTranIndex": DebtTranIndex,
                        "IDs": WIPIds
                    };
                console.log(rawBody);
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeEditAnalysisDetailsList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        "DebtTranIndex": DebtTranIndex,
                        "IDs": WIPIds
                    })
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting underlying WIP entries from draft data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
            }

            case "Narrative": {
                  const apiRes = await fetch(
                `https://bmss.pehosted.com/pe/api/Billing/AddDraftFeeNarrative/${DebtTranIndex}`,
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        }
                    }
                    );

            const result = await apiRes.text();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving narratives to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
                }

            case "createDraft": {
                const createDraftRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeCreate',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );
                const createDraftResult = await createDraftRes.json();
                if (!createDraftRes.ok) {
                    context.res = { status: createDraftRes.status, body: `Error creating draft: ${createDraftRes.status}` };
                    return;
                }
                context.res = { status: 200, body: createDraftResult };
                return;
            }
            }
        }

      case "PUT": {
        switch (EditType) {
            case "Analysis": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/SaveDraftFeeAnalysisRow',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.json();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving edits to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
            }

            case "Narrative": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/UpdateDraftFeeNarrative',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.text();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving narratives to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
                }

            case "WIP": {
            const DrillType = payload.DrillType; // for drilldowns on WIP Anaylsis subtable of edit tray
                switch (DrillType) {
                    case "Staff": {
                        const payloadWithDrill = { "DebtTranIndex": DebtTranIndex, "AllocIdx": payload.AllocIdx };
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeWIPEditAnalysisStaffList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payloadWithDrill)
                }
                );
                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft drill down data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
                    }
                    case "Analysis": {
                        const payloadWithDrill = { "DebtTranIndex": DebtTranIndex, "AllocIdx": payload.AllocIdx };
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeWIPEditAnalysisAnalysisList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payloadWithDrill)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft drill down data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
                    }
                    case "Task": {
                        const payloadWithDrill = { "DebtTranIndex": DebtTranIndex, "AllocIdx": payload.AllocIdx };
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeWIPEditAnalysisTaskList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payloadWithDrill)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft drill down data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
                    }
                    case "Roles": {
                        const payloadWithDrill = { "DebtTranIndex": DebtTranIndex, "AllocIdx": payload.AllocIdx };
                const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeWIPEditAnalysisRoleList',
                {
                     method:  'POST',
                     headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payloadWithDrill)
                }
                );

                const result = await apiRes.json();
                console.log(result);

                if (!apiRes.ok) {
                    context.res = {
                    status: apiRes.status,
                    body:   `Error getting draft drill down data: ${apiRes.status} ${result}`
                    };
                    return;
                }

                context.res = { status: 200, body: result };
                return;
                    }

                default: {
                    console.log('Drill down triggered but no match found for DrillType:', DrillType);
                }
                }
            }
            }
        }

      case "DELETE": {
        switch (EditType) {
            case "Analysis": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/DraftFeeDeleteWipAllocation',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );
                    
                    const raw = await apiRes.text();

                    let result;
                    try {
                    result = raw ? JSON.parse(raw) : null; // null if no body
                    } catch {
                    result = raw; // keep raw text/html for debugging
                    }

                    console.log("status:", apiRes.status);
                    console.log("raw body:", raw);

                    if (!apiRes.ok) {
                    context.res = {
                        status: apiRes.status,
                        body: `Error deleting wip lines on draft: ${apiRes.status} ${typeof result === "string" ? result : JSON.stringify(result)}`
                    };
                    return;
                    }

                    context.res = { status: 200, body: result };
                    return;
            }

            case "Narrative": {
                  const apiRes = await fetch(
                `https://bmss.pehosted.com/pe/api/Billing/DeleteDraftFeeNarrative/${DebtTranIndex}/${DebtNarrIndex}`,
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        }
                    }
                    );

            const result = await apiRes.text();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving narratives to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
                }

            case "WIP": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/RecalculateWIPAllocFromStaffSummary',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        }, 
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.text();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error recalculating WIP allocation: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
                }
            }
        }

      case "PUT": {
        switch (EditType) {
            case "Analysis": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/SaveDraftFeeAnalysisRow',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.json();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving edits to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
            }

            case "Narrative": {
                  const apiRes = await fetch(
                'https://bmss.pehosted.com/pe/api/Billing/UpdateDraftFeeNarrative',
                    {
                        method:  'POST',
                        headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload)
                    }
                    );

            const result = await apiRes.text();
            console.log(result);

            if (!apiRes.ok) {
                context.res = {
                    status: apiRes.status,
                    body:   `Error saving narratives to draft: ${apiRes.status} ${result}`
                };
            return;
            }

            context.res = { status: 200, body: result };
            return;
                }

            case "Entries": {
                const { entryLevel, WIPIds } = payload;
                const validEndpoints = [
                    'DraftFeeWIPEditAnalysisStaffList',
                    'DraftFeeWIPEditAnalysisAnalysisList',
                    'DraftFeeWIPEditAnalysisTaskList',
                    'DraftFeeWIPEditAnalysisRoleList',
                ];
                if (!validEndpoints.includes(entryLevel)) {
                    context.res = { status: 400, body: `Invalid entryLevel: ${entryLevel}` };
                    return;
                }
                const entryPayload = { DebtTranIndex, WIPIds };
                const entriesRes = await fetch(
                    `https://bmss.pehosted.com/pe/api/Billing/${entryLevel}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(entryPayload)
                    }
                );
                const entriesResult = await entriesRes.json();
                if (!entriesRes.ok) {
                    context.res = { status: entriesRes.status, body: `Error getting underlying entries: ${entriesRes.status}` };
                    return;
                }
                context.res = { status: 200, body: entriesResult };
                return;
            }
            }
        }
    }
}