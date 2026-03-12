const baseUrl = (process.env.PEPTIFIT_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const assistantKey = process.env.ASSISTANT_API_KEY;
const assistantUserId = process.env.ASSISTANT_USER_ID || '';

if (!assistantKey) {
  console.error('ASSISTANT_API_KEY is required');
  process.exit(1);
}

function headers() {
  return {
    Authorization: `Bearer ${assistantKey}`,
    'Content-Type': 'application/json',
    ...(assistantUserId ? { 'X-Assistant-User-Id': assistantUserId } : {})
  };
}

async function call(method, route, body, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok && !options.allowFailure) {
    const error = new Error(`${method} ${route} failed with ${response.status}`);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return { status: response.status, body: json };
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const takenAt = `${date}T07:42:00Z`;
  const createdLogIds = [];

  try {
    const groupList = await call('GET', '/assistant/supplement-groups');
    const allGroups = groupList.body?.data?.groups || [];
    if (!allGroups.some((group) => group.group_name === 'morning')) {
      throw new Error('Supplement groups list did not include morning');
    }

    const groupRead = await call('GET', '/assistant/supplement-groups/morning');
    const expectedSupplements = groupRead.body?.data?.supplements || [];
    if (expectedSupplements.length === 0) {
      throw new Error('Morning supplement group returned no supplements');
    }
    console.log(`1. morning group read ok (${expectedSupplements.length} supplements)`);

    const managedGroup = await call('POST', '/assistant/supplement-groups', {
      name: 'qa-group',
      display_name: 'QA Group',
      supplement_ids: expectedSupplements.slice(0, 2).map((item) => item.id)
    });
    if (managedGroup.body?.data?.group_name !== 'qa-group') {
      throw new Error('Assistant supplement group create failed');
    }
    console.log('2. supplement group create ok');

    const updatedGroup = await call('PUT', '/assistant/supplement-groups/qa-group', {
      name: 'qa-group-renamed',
      display_name: 'QA Group Renamed',
      supplement_ids: expectedSupplements.slice(0, 3).map((item) => item.id)
    });
    if (updatedGroup.body?.data?.group_name !== 'qa-group-renamed' || (updatedGroup.body?.data?.supplements || []).length !== 3) {
      throw new Error('Assistant supplement group update failed');
    }
    console.log('3. supplement group update ok');

    const batchLog = await call('POST', '/assistant/log-supplement-group', {
      group_name: 'morning',
      taken_at: takenAt,
      notes: 'verify-supplement-groups'
    });
    const batchResults = batchLog.body?.data?.results || [];
    const createdResults = batchResults.filter((result) => result.status === 'created');
    createdResults.forEach((result) => createdLogIds.push(result.supplement_log_id));
    if (!batchLog.body?.verified || createdResults.length !== expectedSupplements.length) {
      throw new Error('Morning supplement group did not log cleanly');
    }
    console.log('4. morning group batch log ok');

    const verifiedCheck = await call('POST', '/assistant/check-supplement-group', {
      group_name: 'morning',
      date
    });
    const summary = verifiedCheck.body?.data?.summary;
    if (!summary || summary.total !== expectedSupplements.length || summary.missing !== 0) {
      throw new Error('Morning supplement group check did not verify all supplements');
    }
    console.log('5. check-supplement-group ok');

    const partialFailure = await call('POST', '/assistant/log-supplement-group', {
      supplement_ids: [expectedSupplements[0].id, 'not-a-real-supplement-id'],
      taken_at: takenAt,
      notes: 'verify-supplement-groups-partial'
    });
    const partialSummary = partialFailure.body?.summary;
    const partialCreated = (partialFailure.body?.data?.results || []).find((item) => item.status === 'created');
    if (partialFailure.body?.success !== false || !partialSummary || partialSummary.failed !== 1 || partialSummary.succeeded !== 1 || !partialCreated) {
      throw new Error('Partial failure case did not return the expected summary');
    }
    createdLogIds.push(partialCreated.supplement_log_id);
    console.log('6. partial failure handling ok');

    const invalidGroup = await call('POST', '/assistant/check-supplement-group', {
      group_name: 'not-a-real-group',
      date
    }, { allowFailure: true });
    if (invalidGroup.status !== 404 || invalidGroup.body?.error?.code !== 'supplement_group_not_found') {
      throw new Error('Invalid group did not return supplement_group_not_found');
    }
    console.log('7. invalid group handling ok');

    const deletedGroup = await call('DELETE', '/assistant/supplement-groups/qa-group-renamed');
    if (deletedGroup.body?.data?.deleted_group?.group_name !== 'qa-group-renamed') {
      throw new Error('Assistant supplement group delete failed');
    }
    console.log('8. supplement group delete ok');

    console.log('Verification succeeded');
    console.log(JSON.stringify({
      date,
      morning_group_count: expectedSupplements.length,
      created_log_ids: createdLogIds
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    if (error.payload) {
      console.error(JSON.stringify(error.payload, null, 2));
    }
    process.exit(1);
  } finally {
    for (const logId of createdLogIds) {
      try {
        await call('DELETE', `/assistant/supplement-logs/${logId}`);
      } catch (cleanupError) {
        console.error(`Cleanup failed for supplement log ${logId}: ${cleanupError.message}`);
      }
    }
  }
}

main();
