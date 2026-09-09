export const OPERATIVE_ACTOR = 'Relay first-party operative';

export function extensionOriginRefusal(origin) {
  if (typeof origin !== 'string' || origin.startsWith('chrome-extension:'))
    return {
      ok: false,
      submitted: false,
      fills: 0,
      status: 403,
      code: 'extension_origin',
      error:
        'Relay APIs must be called from a signed-in Relay page, not the extension origin.',
    };
  return null;
}

function fail(partial) {
  return { ok: false, submitted: false, fills: 0, ...partial };
}

function incompleteFields(fields) {
  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    fields.some(
      (field) =>
        !field ||
        field.unknown === true ||
        typeof field.value !== 'string' ||
        field.value.length === 0,
    )
  )
    return fail({
      code: 'incomplete_fields',
      error: 'Provide complete known fields before arming.',
    });
  return null;
}

function isAbort(error) {
  if (!error) return false;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|unload|No tab with id|frame was removed|receiving end does not exist/i.test(
    message,
  );
}

export async function runFixtureSend(io, input) {
  const originRefusal = extensionOriginRefusal(await io.pageOrigin());
  if (originRefusal) return originRefusal;
  const missing = incompleteFields(input.fields);
  if (missing) return missing;

  const workspace = await io.pageFetch('/api/workspace');
  if (workspace.status === 401 || typeof workspace.json?.viewer !== 'string')
    return fail({
      status: workspace.status === 401 ? 401 : workspace.status,
      code: 'unauthenticated',
      error: workspace.json?.error || 'Sign in first.',
    });
  const viewer = workspace.json.viewer;
  const job = input.job;
  const actor = input.actor || OPERATIVE_ACTOR;

  const inspect = await io.pageFetch(
    `/api/applications?job=${encodeURIComponent(job)}`,
  );
  if (inspect.status === 401)
    return fail({
      status: 401,
      code: 'unauthenticated',
      error: inspect.json?.error || 'Sign in first.',
    });
  if (inspect.status === 404)
    return fail({
      status: 404,
      code: 'job_unavailable',
      error: inspect.json?.error || 'A selected job is unavailable.',
    });
  if (!inspect.ok)
    return fail({
      status: inspect.status,
      error: inspect.json?.error || 'Inspect was refused.',
    });

  const prepared = await io.pageFetch('/api/applications', {
    action: 'prepare',
    viewer,
    job,
    preparation_revision: inspect.json.preparation_revision,
    actor,
    destination: input.destination,
    fields: input.fields,
    files: input.files ?? [],
  });
  if (!prepared.ok)
    return fail({
      status: prepared.status,
      error: prepared.json?.error || 'Prepare was refused.',
    });

  const armed = await io.pageFetch('/api/applications', {
    action: 'arm',
    viewer,
    job,
    preparation_revision: prepared.json.preparation_revision,
    id: input.operationId || crypto.randomUUID(),
    actor,
  });
  if (!armed.ok)
    return fail({
      status: armed.status,
      error: armed.json?.error || 'Arm was refused.',
    });

  const pin = {
    job,
    preparation_revision: armed.json.preparation_revision,
    id: armed.json.operation_id,
    digest: armed.json.digest,
    actor,
    ...(typeof input.wait_ms === 'number' ? { wait_ms: input.wait_ms } : {}),
  };

  let authorized;
  try {
    authorized = await io.wait(pin);
  } catch (error) {
    if (isAbort(error) || io.signal?.aborted)
      return fail({
        code: 'wait_aborted',
        error: 'Application wait stopped because the operative closed.',
      });
    return fail({
      code: 'wait_failed',
      error: error instanceof Error ? error.message : 'Wait failed.',
    });
  }
  if (io.signal?.aborted)
    return fail({
      code: 'wait_aborted',
      error: 'Application wait stopped because the operative closed.',
    });
  if (!authorized?.authorized)
    return fail({
      code: authorized?.code || 'wait_failed',
      error: authorized?.error || 'Application wait did not authorize send.',
    });

  const begun = await io.pageFetch('/api/applications', {
    action: 'begin',
    viewer: authorized.viewer || viewer,
    id: authorized.id,
    digest: authorized.digest,
  });
  if (begun.status === 409)
    return fail({
      status: 409,
      code: 'executing',
      error: begun.json?.error || 'Application is already executing.',
    });
  if (!begun.ok || begun.json?.execute !== true)
    return fail({
      status: begun.status,
      code: 'no_permit',
      error: begun.json?.error || 'Execute permit was not granted.',
    });

  const manifest = JSON.parse(begun.json.operation.manifest);
  const filled = await io.fillOnce(manifest.fields);
  if (filled.submitted && filled.receipt) {
    await io.pageFetch('/api/applications', {
      action: 'complete',
      viewer: authorized.viewer || viewer,
      id: authorized.id,
      digest: authorized.digest,
      receipt: filled.receipt,
    });
    return {
      ok: true,
      submitted: true,
      fills: 1,
      receipt: filled.receipt,
    };
  }
  const note =
    filled.note ||
    'Fixture submit no-op; no confirmation heading. Do not submit again.';
  await io.pageFetch('/api/applications', {
    action: 'uncertain',
    viewer: authorized.viewer || viewer,
    id: authorized.id,
    digest: authorized.digest,
    receipt: note,
  });
  return { ok: true, submitted: false, fills: 1, uncertain: true };
}
