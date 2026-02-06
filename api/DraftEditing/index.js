module.exports = async function (context, req) {

  console.log(context.bindingData);  
  const method = context.bindingData.methodType.toUpperCase();
  const EditType = context.bindingData.editType;
  const DebtTranIndex = context.bindingData.debtTranIndex;
  const DebtNarrIndex = context.bindingData.debtNarrIndex;
  const token = req.body.token;
  const payload = req.body.payload;
  console.log(payload);

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
            }
        }
    }
}