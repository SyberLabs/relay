# Contributing

Focused pull requests are welcome. GitHub Issues are currently disabled; propose an improvement directly in a pull request. An issue may be used for discussion if Issues are enabled later.

## Prepare a change

1. Fork the repository, create a focused branch, and change only the relevant Bot package or shared documentation.
2. Describe one concrete Bot failure or improvement. Include the input, expected behavior, actual behavior, and any known limits.
3. Preserve existing skill directory names, frontmatter identifiers, and public Bot links unless the proposal explicitly explains a migration.
4. Add or update the smallest acceptance cases that would distinguish the improvement from the current behavior.

For every acceptance case, record the expected and actual result, limitations, model, and date. Label the evidence accurately:

- **Prepared:** a case written for later evaluation but not run.
- **Native:** behavior observed in the target Bot or model environment.
- **Offline:** a locally inspected artifact or manually exercised fixture outside the target model environment.
- **Automated:** a command-produced result that another contributor can rerun.

Do not present prepared evidence as observed behavior. A public Bot is a deployed snapshot, so changing source here does not update it. If instructions that affect Bot behavior change, run the relevant cases in the target environment or state plainly in the pull request that the behavior evaluation was not run.

## Check the repository

Run these commands from the repository root with Python 3.10 or newer:

```text
python scripts/validate_templates.py
python bots/garbage-collector/eval/verify.py
python bots/garbage-collector/eval/check_structure.py
```

Report which checks ran and their results. Automated checks validate source and fixtures; they do not prove model behavior.

## Protect people and source history

Do not commit secrets, tokens, account identifiers, private transcripts, or machine-specific setup data. Keep proprietary examples out of acceptance cases unless you have permission to publish them.

By contributing, you agree that your contribution is provided under this repository's [MIT License](LICENSE).
