import {
  clickFixtureSubmit,
  fillFixtureFields,
  readFixtureReceipt,
} from './fill.js';

export async function fillFixtureTab(io, tabId, fields, destination) {
  let submissionMayHaveBegun = false;
  try {
    const ready = await io.inspect(tabId, destination);
    if (!ready?.ok)
      return {
        submitted: false,
        receipt: null,
        fills: 0,
        code: ready?.code || 'not_fixture',
        note: ready?.error || 'Fixture tab could not be inspected.',
      };
    const filled = await io.execute(tabId, fillFixtureFields, [
      JSON.stringify(fields ?? []),
    ]);
    if (!filled?.result?.ok)
      return {
        submitted: false,
        receipt: null,
        fills: 0,
        code: 'missing_field',
        note: filled?.result?.error || 'Fixture form could not be filled.',
      };
    submissionMayHaveBegun = true;
    const clicked = await io.execute(tabId, clickFixtureSubmit);
    if (!clicked?.result?.ok) {
      submissionMayHaveBegun = false;
      return {
        submitted: false,
        receipt: null,
        fills: 1,
        note: clicked?.result?.error || 'Fixture submit control not found.',
      };
    }
    const deadline = io.now() + (io.receiptWaitMs ?? 10_000);
    while (io.now() < deadline) {
      const read = await io.execute(tabId, readFixtureReceipt);
      if (typeof read?.result === 'string' && read.result)
        return { submitted: true, receipt: read.result, fills: 1 };
      await io.sleep(50);
    }
    return {
      submitted: false,
      receipt: null,
      fills: 1,
      note: 'Fixture submit no-op; no confirmation heading. Do not submit again.',
    };
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    if (submissionMayHaveBegun)
      return {
        submitted: false,
        receipt: null,
        fills: 1,
        uncertain: true,
        code: 'uncertain',
        note,
      };
    return {
      submitted: false,
      receipt: null,
      fills: 0,
      note,
    };
  }
}
