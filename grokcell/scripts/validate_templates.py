"""Validate the maintained source packages for the four published Bots.

Skill frontmatter uses the repository's simple ``key: scalar`` schema. Block
scalars are deliberately unsupported so this check stays dependency-free.
"""

from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
BOTS = ROOT / "bots"
SPECS = {
    "first-principles": {
        "name": "First Principles",
        "heading": "First Principles",
        "skill": "first-principles",
        "url": "https://x.ai/bot/7JY6ldHDxdZB1hmhEk9qo",
        "evidence": ("CHECKS.md",),
    },
    "product-ideation": {
        "name": "Aggressive Product Ideation",
        "heading": "Product Ideation",
        "skill": "aggressive-product-ideation",
        "url": "https://x.ai/bot/Rfh9qBxQ8SveYYzB1IHNO",
        "evidence": ("CHECKS.md",),
    },
    "red-flag": {
        "name": "Red Flag",
        "heading": "Red Flag",
        "skill": "red-team-analysis",
        "url": "https://x.ai/bot/-QAXkSxb1PqXFHdCsxhy0",
        "evidence": ("CHECKS.md",),
    },
    "garbage-collector": {
        "name": "Garbage Collector",
        "heading": "Garbage Collector",
        "skill": "aggressive-deletion",
        "url": "https://x.ai/bot/QZ8xL9TMkYhyP4Puamsh_",
        "evidence": (
            "eval/README.md",
            "eval/scenarios.json",
            "eval/verify.py",
            "eval/check_structure.py",
        ),
    },
}

BOT_URL = re.compile(r"https://x\.ai/bot/[A-Za-z0-9_-]+")
MARKDOWN_LINK = re.compile(r"!?\[[^]]*]\(([^)]+)\)")
IDENTIFIER = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def read_required(path, errors):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: cannot read: {exc}")
        return None
    if not text.strip():
        errors.append(f"{path.relative_to(ROOT)}: file is empty")
        return None
    return text


def frontmatter_fields(path, text, errors):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        errors.append(f"{path.relative_to(ROOT)}: missing opening frontmatter delimiter")
        return {}
    try:
        end = next(index for index in range(1, len(lines)) if lines[index].strip() == "---")
    except StopIteration:
        errors.append(f"{path.relative_to(ROOT)}: missing closing frontmatter delimiter")
        return {}

    if not "\n".join(lines[end + 1:]).strip():
        errors.append(f"{path.relative_to(ROOT)}: skill instruction body is empty")

    fields = {}
    for line_number, line in enumerate(lines[1:end], start=2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition(":")
        key = key.strip()
        if not separator or not key:
            errors.append(
                f"{path.relative_to(ROOT)}:{line_number}: invalid frontmatter field"
            )
            continue
        if key in fields:
            errors.append(
                f"{path.relative_to(ROOT)}:{line_number}: duplicate frontmatter field {key!r}"
            )
            continue
        fields[key] = value.strip()
    return fields


def markdown_destinations(text):
    in_fence = False
    for line in text.splitlines():
        if re.match(r"^\s*(```|~~~)", line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for match in MARKDOWN_LINK.finditer(line):
            destination = match.group(1).strip()
            if destination.startswith("<") and ">" in destination:
                destination = destination[1:destination.index(">")]
            else:
                destination = destination.split(maxsplit=1)[0]
            yield destination


def check_relative_links(path, text, errors):
    for destination in markdown_destinations(text):
        parsed = urlsplit(destination)
        if parsed.scheme or parsed.netloc or not parsed.path or destination.startswith("#"):
            continue
        if parsed.path.startswith(("/", "\\")):
            errors.append(f"{path.relative_to(ROOT)}: local link must be relative: {destination}")
            continue
        target = (path.parent / unquote(parsed.path)).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            errors.append(f"{path.relative_to(ROOT)}: local link leaves the repository: {destination}")
            continue
        if not target.exists():
            errors.append(f"{path.relative_to(ROOT)}: broken local link: {destination}")


def main():
    errors = []
    markdown = {}

    for package, spec in SPECS.items():
        package_root = BOTS / package
        skill_path = package_root / "skills" / spec["skill"] / "SKILL.md"
        required = [package_root / "README.md", package_root / "PROFILE.md", skill_path]
        required.extend(package_root / relative for relative in spec["evidence"])

        contents = {}
        for path in required:
            text = read_required(path, errors)
            if text is not None:
                contents[path] = text
                if path.suffix.lower() == ".md":
                    markdown[path] = text

        skill_text = contents.get(skill_path)
        if skill_text is not None:
            fields = frontmatter_fields(skill_path, skill_text, errors)
            identifier = fields.get("name", "")
            if not IDENTIFIER.fullmatch(identifier) or identifier != spec["skill"]:
                errors.append(
                    f"{skill_path.relative_to(ROOT)}: expected frontmatter name {spec['skill']!r}, "
                    f"found {identifier!r}"
                )
            raw_description = fields.get("description", "").strip()
            description = raw_description.strip("'\"")
            if not description or raw_description in {"|", ">", "|-", ">-", "|+", ">+"}:
                errors.append(
                    f"{skill_path.relative_to(ROOT)}: description must be a nonempty "
                    "single-line scalar"
                )

        readme_path = package_root / "README.md"
        readme = contents.get(readme_path)
        if readme is not None:
            if not re.search(rf"^#\s+{re.escape(spec['heading'])}\s*$", readme, re.MULTILINE):
                errors.append(
                    f"{readme_path.relative_to(ROOT)}: expected heading {spec['heading']!r}"
                )
            links = BOT_URL.findall(readme)
            if links != [spec["url"]]:
                errors.append(
                    f"{readme_path.relative_to(ROOT)}: expected one public Bot link "
                    f"{spec['url']!r}, found {links!r}"
                )

        profile_path = package_root / "PROFILE.md"
        profile = contents.get(profile_path)
        if profile is not None:
            if spec["name"] not in profile:
                errors.append(
                    f"{profile_path.relative_to(ROOT)}: profile does not identify {spec['name']!r}"
                )
            unexpected_links = set(BOT_URL.findall(profile)) - {spec["url"]}
            if unexpected_links:
                errors.append(
                    f"{profile_path.relative_to(ROOT)}: unexpected public Bot links "
                    f"{sorted(unexpected_links)!r}"
                )

    for path in (ROOT / "README.md", BOTS / "README.md"):
        if path.is_file():
            text = read_required(path, errors)
            if text is not None:
                markdown[path] = text

    for path, text in markdown.items():
        check_relative_links(path, text, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: four published Bot packages validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
