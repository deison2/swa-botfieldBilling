module.exports = async function (context, req) {

  console.log(context.bindingData);  
  const method = context.bindingData.methodType.toUpperCase();
  const EditType = context.bindingData.editType;
  const DebtTranIndex = context.bindingData.debtTranIndex;
  const token = req.body.token;
  const payload = req.body.payload;

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