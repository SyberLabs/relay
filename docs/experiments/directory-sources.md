# Directories that can supply pre-agent ATS boards

Issue: [#105](https://github.com/SyberLabs/relay/issues/105). Snapshot: 7 September 2026.

This is research for the local experiment in [pre-agent-admit.md](pre-agent-admit.md), not a product crawl store. Greenhouse, Lever, and Ashby still publish **no customer list**. `sitemap.xml` on those hosts 404s or redirects (re-stated by [ats-jobs-mcp](https://github.com/groundtruthtools/ats-jobs-mcp) on 24 August 2026). Every live `--directory` is therefore a snapshot from somewhere else, then re-checked with the public board GET.

## What “satisfies” means here

A source fits the experiment if it can become operator-held `{ provider, board, company }` rows for public Greenhouse / Lever / Ashby JSON, without:

- the seeker naming companies as the ingest allowlist
- login walls, CAPTCHA bypass, or robots evasion
- LinkedIn / Indeed / Wellfound / Crunchbase HTML
- committing real tokens to Git
- a Relay-funded Worker crawl, index, or queue

Two usable shapes:

1. **Already slugs.** Drop into `private-data/…/directory.json`, cap `max_boards`, re-verify on `--live`.
2. **Names / websites.** A later scout resolves them with public GETs (guess slug or parse a careers URL only where robots/ToS allow). That is not the writing agent googling job titles.

Hugging Face had no matching public datasets for this lookup (queried 7 September 2026).

## Use for a live #105 run (already slugs)

| Source | Size (this snapshot) | License | What you get | Verdict |
| --- | --- | ---: | --- | --- |
| **LastRound AI ATS directory** ([datahub](https://datahub.io/lastroundai-hiring-data/lastroundai-hiring-data/ats-directory), [GitHub](https://github.com/fyrosofttech/lastroundai-hiring-data), [Figshare DOI](https://doi.org/10.6084/m9.figshare.33154145), [Kaggle mirror](https://www.kaggle.com/datasets/umamaheshbandaru/ats-company-directory-9935-public-job-boards)) | **9,935** (GH 4,966 / Ashby 2,856 / Lever 2,113). CSV dated July–August 2026. Counted from the published CSV: header `ats_vendor,company_name,board_slug,last_crawled`. | **CC BY 4.0** — attribute LastRound AI and link the [pay transparency study](https://lastroundai.com/blog/salary-transparency-study-2026) | Vendor + slug + board-reported name + last crawl date. Built by enumerating public board APIs, not a vendor list. | **Primary.** Largest commercial-ok slug map that matches this harness’s three providers. Keep the CSV in ignored `private-data/`. Re-GET every sampled board. Default live cap is 40 (hard 20,000 with `--full-directory` on the operator machine). Their own 4 August 2026 spot check: 8/9 still live. Ashby rows are the stalest (through 17 July 2026). Workday / SmartRecruiters / Taleo absent. |
| **ats-jobs-mcp** ([GitHub](https://github.com/groundtruthtools/ats-jobs-mcp), ships `src/ats_jobs_mcp/directory.json`) | **7,479** boards claimed; GH 4,168 / Ashby 3,311; Lever almost empty | **MIT** | `ats`, `board`, `company`, `checked`, optional open-job count. Confirmed against vendor APIs. | **Secondary / merge.** Same job as LastRound, fewer Lever tenants, MIT instead of CC BY. Do not commit the JSON. |
| **intern-engine `data/companies.json`** ([zshah101 internships tracker](https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships)) | **4,727** boards / **4,480** names. GH+Lever+Ashby = **2,165** (GH 1,055, Ashby 714, Lever 396). Rest is Workday 1,781 and other ATS this harness does not fetch. Counted 7 September 2026 from the published file. | **MIT** | `name`, `slug`, `ats` already in harness shape | **Secondary, intern-shaped.** Tokens mined from Simplify / vanshb03 / speedyapply listings, then probed. High overlap with companies students already hear about; weaker as unknown-company recall for a general hunt. Keep GH/Lever/Ashby rows only. |
| **africa-ats-directory** ([GitHub](https://github.com/Thelastpoet/africa-ats-directory)) | **21** entries (index `total_entries`, March 2026). Schema includes `board_token`, `careers_url`, verification, evidence. | **MIT** | Gold schema, geography-limited | **Not a corpus.** Copy the schema if we grow a private directory; do not expect unknown-company yield. |
| **ConorsCode/open-jobs-data** | ~90–380 curated tech boards, nine ATS adapters | unstated in README; repo is public | Daily job CSV plus adapters (Workable, SmartRecruiters, Personio, Workday, …) | **Too small** as the unknown-company directory. Adapters are useful later, not for this arm. |

### Common Crawl CDX (method, not a dump)

The August 2026 index (`CC-MAIN-2026-34`) returns live URL captures for `boards.greenhouse.io/*` and `jobs.ashbyhq.com/*` (checked 7 September 2026 against `index.commoncrawl.org`). Lever’s index is noisier (robots.txt dominates prefix hits). Regex on the first path segment yields candidate slugs; keep only boards that still 200 on the vendor JSON.

[Feashliaa/job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) already did this (~95k identifiers claimed; curated `data/*_companies.json` on GitHub). **Do not reuse those published lists:** they are **CC BY-NC 4.0**. Relay is a product. Run our own CDX harvest into `private-data/` if we want that coverage, stay polite to `index.commoncrawl.org`, and treat crawled *page bodies* as third-party content under Common Crawl’s [terms](https://commoncrawl.org/terms-of-use) (they recommend counsel before commercial use of crawled content). URL/slug extraction from the public index is the part that matches this experiment.

## Scout corpora (names / websites → then resolve slugs)

These do **not** replace LastRound for the current treatment arm. They are how a scout could find tenants the static dump missed, especially currently hiring.

| Source | Size | Access | Fit | Caveat |
| --- | --- | --- | --- | --- |
| **HN Algolia** `https://hn.algolia.com/api/v1/` | Monthly “Ask HN: Who is hiring?” threads. Search API is public, no key. A `author_whoishiring` story search returned hundreds of threads (checked 7 September 2026). | Official HN search API (Algolia). Courtesy budget cited in the wild as ~10k req/hr/IP; not an SLA. | **Best scout for “hiring right now.”** Comments carry company names and URLs. Parse comments; do not scrape HN HTML. | Not slugs. Resolution still needs a public board GET. High-signal, not complete. |
| **YC hiring JSON** via [yc-oss/api](https://github.com/yc-oss/api) (`companies/hiring.json`) | YC launched companies with `website` and `isHiring` | **Unofficial.** Reads YC’s public Algolia index; not an official YC API. | Strong GH/Lever/Ashby overlap if we freeze a private copy and resolve slugs ourselves. | ToS/attribution risk. Do not scrape ycombinator.com HTML. |
| **yigitmeteozcan/startups** | **21,145** across YC, Techstars (~5,105), Plug and Play, 500 Global, Antler, Alchemist, EF (counts from their README, updated 6 September 2026) | MIT JSON over jsDelivr | Wide startup population with websites | Same unofficial-mirror issue. **No ATS slugs.** |
| **a16z Speedrun talent network** `GET https://speedrun-talent-network.com/api/v1/companies` | **799** companies with at least one live role (checked 7 September 2026: `total` 799, page size 100) | Public JSON, no key | Currently hiring inside a16z / Speedrun | Their `slug` is **not** a Greenhouse/Lever/Ashby token. `url` points at their site. Logo URLs sometimes leak a company domain. Small, network-biased. |
| **SimplifyJobs / vanshb03 internship `listings.json`** | Apply URLs with ATS tokens; intern-engine mines these daily | Public GitHub JSON | Already the upstream of intern-engine | Intern/new-grad apply links, not a general company census. |

Resolution path (mechanical, not LLM): name or website → candidate slug / careers URL → `GET` public board API → keep 200s. HTML fetch of careers pages only where robots/ToS allow.

## Official open data that fails this ATS mix

| Source | Why it fails |
| --- | --- |
| SEC `company_tickers.json` / EDGAR submissions | Listed issuers; Workday/Taleo-heavy; no board tokens. Optional later **if** a Workday adapter exists. |
| DOL OFLC H-1B LCA Excel | Legal names, NAICS, worksite; **no website**. Consultancy-heavy. Extra resolve step. |
| USCIS H-1B Employer Data Hub | Petition counts by employer name, not careers URLs. |
| EEO-1 public use files | **No employer identity** (Title VII §709(e) disclosure protection). |
| Companies House API | UK legal entities; API key; not hiring/ATS. |
| SAM.gov entity API | Federal contractors; API key; not GH/Ashby-shaped. |
| GLEIF LEI API | Legal names / LEI; not careers tokens. |
| Wikidata P856 official website | CC; huge; not “currently hiring”; dump is enormous. |
| USAJobs | Federal roles; API key; not this ATS mix. |
| The Muse / Arbeitnow / Himalayas / Jobicy / RemoteOK public JSON | Aggregator job feeds. Query-shaped (same failure mode as `control_query`). Himalayas `companySlug` is theirs, not a board token. |

## Do not use as the scout or treatment corpus

LinkedIn, Indeed, Wellfound/AngelList, Crunchbase (unless a documented open dump), major-board HTML scrapes, login/CAPTCHA bypass, Apify/JobsPipe/CleanJobData as a paid crawl, BuiltWith-style customer lists, Feashliaa’s **CC BY-NC** company JSON, committing real slug lists to Git.

## Practical order

1. **Live #105 treatment catalog:** put the LastRound CC BY 4.0 CSV in `private-data/experiments/pre-agent-admit/`, point `--catalog` at a JSON that lists that file (and optional MIT dumps). The harness unions rows, **samples by provider share** (not the CSV prefix — LastRound is vendor-sorted, so first-N is almost all Ashby), re-GETs every sampled board, and writes LastRound attribution into compare JSON. Do not commit the CSV.
2. **Optional union:** ats-jobs-mcp and intern-engine GH/Lever/Ashby rows that LastRound missed; africa-ats-directory only as schema/geo spice. Common Crawl CDX as a **local file** of captured URLs, not a live harvest during the labeled run.
3. **Scout slice (same local process, still no Worker crawl):** HN Algolia who-is-hiring comments, and/or a frozen YC-hiring JSON, startups dump, or Speedrun company list under `catalog.scout`. Resolution is public board GET only. Skip LinkedIn / Indeed / Wellfound / Crunchbase. Do not scrape ycombinator.com; refuse Feashliaa CC BY-NC lists.
4. **SEC / H-1B** only after a Workday-class adapter exists.
5. The writing agent still does not find slugs in the same session as drafting.
