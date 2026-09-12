export const OPERATIVE_SPEC = 'tests/e2e/operative-extension.spec.ts';

export function browserPlaywrightPlan({
  extraArgs,
  operativeState,
  mainState,
}) {
  if (extraArgs.length)
    return [
      {
        persistTo: mainState,
        args: extraArgs,
        skipOperative: false,
      },
    ];
  return [
    {
      persistTo: operativeState,
      args: [OPERATIVE_SPEC],
      skipOperative: false,
    },
    {
      persistTo: mainState,
      args: [],
      skipOperative: true,
    },
  ];
}
