#!/usr/bin/env python3
"""
Builds the Rakazo Unified Native Skill Library Archive from a source skill catalog.

Outputs into packages/adapters/src/unified-skills-archive/:
  - catalog-index.json.gz  : Compact metadata array of all unified skills (~3,536 entries)
  - shard-<categoryId>.json.gz : 11 category-sharded gzipped SKILL.md body maps

Usage:
  python3 scripts/build-unified-skill-library.py --source-dir "/path/to/Rakazo Skills"
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

CATEGORY_DEFINITIONS = [
    ("01_Design_et_UX", "Design, UI/UX & Animations"),
    ("02_Developpement_Web", "Développement Web, React, Next.js & CMS"),
    ("03_Backend_et_APIs", "Backend, APIs, Microservices & Intégrations"),
    ("04_Bases_de_donnees", "Bases de Données, SQL, ORM & Vector Search"),
    ("05_Securite_et_Pentest", "Cybersécurité, DevSecOps, Audit & Conformité"),
    ("06_DevOps_et_Cloud", "DevOps, Cloud, Conteneurs, SRE & Bureautique"),
    ("07_IA_et_Data_Science", "Intelligence Artificielle, Agents, RAG & LLM"),
    ("08_Tests_et_Qualite", "Tests Automatisés, QA, TDD & Évaluation"),
    ("09_Productivite_et_Outils", "Productivité, Git, Windmill, n8n & ERP"),
    ("10_Gestion_de_Projet_et_Docs", "Architecture, Specs, ADRs & Documentation"),
    ("11_Divers_et_Autres", "Méta-Skills, Ingénierie & Expertise Métier"),
]

ACRONYM_MAP = {
    "ai": "IA",
    "ia": "IA",
    "ui": "UI",
    "ux": "UX",
    "seo": "SEO",
    "aeo": "AEO",
    "geo": "GEO",
    "api": "API",
    "apis": "APIs",
    "sql": "SQL",
    "orm": "ORM",
    "rag": "RAG",
    "llm": "LLM",
    "llms": "LLMs",
    "mcp": "MCP",
    "ssr": "SSR",
    "css": "CSS",
    "html": "HTML",
    "js": "JS",
    "ts": "TS",
    "aws": "AWS",
    "gcp": "GCP",
    "jwt": "JWT",
    "oauth": "OAuth",
    "tdd": "TDD",
    "bdd": "BDD",
    "ddd": "DDD",
    "qa": "QA",
    "e2e": "E2E",
    "cms": "CMS",
    "crm": "CRM",
    "erp": "ERP",
    "gdpr": "RGPD",
    "rgpd": "RGPD",
    "hds": "HDS",
    "sre": "SRE",
    "ci": "CI",
    "cd": "CD",
    "cicd": "CI/CD",
    "cli": "CLI",
    "sdk": "SDK",
    "pwa": "PWA",
    "hig": "HIG",
    "wcag": "WCAG",
    "a11y": "A11y",
    "adr": "ADR",
    "adrs": "ADRs",
    "kpi": "KPI",
    "n8n": "n8n",
    "nextjs": "Next.js",
    "reactjs": "React",
    "vuejs": "Vue.js",
    "nodejs": "Node.js",
    "fastapi": "FastAPI",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "graphql": "GraphQL",
    "wordpress": "WordPress",
    "woocommerce": "WooCommerce",
    "tailwind": "Tailwind",
    "tailwindcss": "Tailwind CSS",
    "github": "GitHub",
    "gitlab": "GitLab",
    "cloudflare": "Cloudflare",
    " pocketbase": "PocketBase",
    "pocketbase": "PocketBase",
    "omniroute": "OmniRoute",
    "openrouter": "OpenRouter",
    "playwright": "Playwright",
    "vitest": "Vitest",
    "3d": "3D",
}

SECRET_SCRUB_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bsk-(?:proj-|live-|srv-)?[A-Za-z0-9_-]{20,}\b"), "sk-REDACTED-EXAMPLE-KEY"),
    (
        re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{25,}\b|github_pat_[A-Za-z0-9_]{30,}"),
        "ghp_REDACTED_EXAMPLE_TOKEN",
    ),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"), "AIzaREDACTED_EXAMPLE_KEY"),
    (
        re.compile(r"\b(?:gsk_|nvapi-|ctx7sk-|ntn_|xkeysib-|rk_live_|cfat_)[A-Za-z0-9_-]{16,}\b"),
        "REDACTED_API_TOKEN",
    ),
    (re.compile(r"/Users/[A-Za-z0-9._-]+/"), "/home/developer/"),
]


def sanitize_text(text: str) -> str:
    out = text
    for pattern, repl in SECRET_SCRUB_RULES:
        out = pattern.sub(repl, out)
    return out


def normalize_slug(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "skill"


def humanize_skill_name(raw_name: str) -> str:
    cleaned = raw_name.strip()
    if " " in cleaned and any(c.isupper() for c in cleaned):
        return cleaned
    parts = [p for p in re.split(r"[-_]+", cleaned) if p]
    words: list[str] = []
    for p in parts:
        low = p.lower()
        if low in ACRONYM_MAP:
            words.append(ACRONYM_MAP[low])
        elif len(p) <= 2 and p.isdigit():
            words.append(p)
        else:
            words.append(p.capitalize())
    return " ".join(words) if words else cleaned


def parse_sovereign_catalog_ts(ts_path: Path) -> dict[str, dict[str, object]]:
    """Extracts {slug -> {name, description, tags}} from sovereign-skills-catalog.ts."""
    raw = ts_path.read_text(encoding="utf-8")
    entries: dict[str, dict[str, object]] = {}
    block_re = re.compile(
        r'\{\s*id:\s*"sov-skill:([^"]+)",\s*slug:\s*"([^"]+)",\s*name:\s*((?:"(?:[^"\\]|\\.)*")),\s*description:\s*((?:"(?:[^"\\]|\\.)*"))',
        re.S,
    )
    for m in block_re.finditer(raw):
        slug = m.group(2).strip().lower()
        name = json.loads(m.group(3))
        desc = json.loads(m.group(4))
        entries[slug] = {"name": name, "description": desc}
    return entries


def write_deterministic_gzip(path: Path, payload_str: str) -> int:
    data = payload_str.encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, compresslevel=9, mtime=0) as gz:
        gz.write(data)
    compressed = buf.getvalue()
    path.write_bytes(compressed)
    return len(compressed)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Rakazo Unified Native Skill Library")
    parser.add_argument("--source-dir", required=True, help="Path to source Rakazo Skills folder")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    source_dir = Path(args.source_dir).resolve()
    jsonl_path = source_dir / "_rakazo_integration" / "catalog_skills.jsonl"
    if not jsonl_path.exists():
        print(f"ERROR: Missing {jsonl_path}", file=sys.stderr)
        return 1

    sov_ts_path = repo_root / "packages" / "contracts" / "src" / "sovereign-skills-catalog.ts"
    sov_content_path = repo_root / "packages" / "adapters" / "src" / "sovereign-skills-content.json"

    sov_meta = parse_sovereign_catalog_ts(sov_ts_path) if sov_ts_path.exists() else {}
    sov_bodies: dict[str, str] = (
        json.loads(sov_content_path.read_text(encoding="utf-8"))
        if sov_content_path.exists()
        else {}
    )

    raw_rows = [
        json.loads(line)
        for line in jsonl_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    valid_categories = dict(CATEGORY_DEFINITIONS)

    # Match sovereign slugs first so 100% of the 379 starter skills preserve their exact slug
    matched_row_idx_by_sov_slug: dict[str, int] = {}
    used_row_indices: set[int] = set()

    for sov_slug in sov_bodies.keys():
        s_low = sov_slug.lower()
        best_idx = None
        for idx, r in enumerate(raw_rows):
            if idx in used_row_indices:
                continue
            r_name = r["name"].lower()
            r_slug = r["slug"].lower()
            r_tail = r_slug.split("--")[-1]
            if r_name == s_low or r_tail == s_low or r_slug == s_low:
                best_idx = idx
                break
        if best_idx is not None:
            matched_row_idx_by_sov_slug[s_low] = best_idx
            used_row_indices.add(best_idx)

    used_slugs: set[str] = set()
    catalog_index: list[dict[str, object]] = []
    shards: dict[str, dict[str, str]] = {cat_id: {} for cat_id, _ in CATEGORY_DEFINITIONS}

    def add_entry(row: dict[str, object], preferred_slug: str | None = None) -> None:
        raw_slug = str(row["slug"])
        raw_name = str(row["name"])
        tail_slug = normalize_slug(raw_slug.split("--")[-1] or raw_name)
        full_slug = normalize_slug(raw_slug.replace("--", "-"))

        if preferred_slug:
            slug = preferred_slug
        elif tail_slug not in used_slugs:
            slug = tail_slug
        elif full_slug not in used_slugs:
            slug = full_slug
        else:
            # Exact duplicate row in source catalog
            return

        used_slugs.add(slug)

        cat_id = str(row.get("category_id") or "11_Divers_et_Autres")
        if cat_id not in valid_categories:
            cat_id = "11_Divers_et_Autres"
        cat_label = valid_categories[cat_id]

        # Read SKILL.md content (prefer already French-enriched sovereign content if available)
        skill_file = source_dir / str(row["path"])
        raw_md = skill_file.read_text(encoding="utf-8", errors="replace")
        if slug in sov_bodies:
            body_md = sanitize_text(sov_bodies[slug])
        else:
            body_md = sanitize_text(raw_md)

        sov_entry = sov_meta.get(slug)
        raw_desc = sanitize_text(str(row.get("description") or "").strip())
        if sov_entry:
            display_name = sanitize_text(str(sov_entry["name"]))
            display_desc = sanitize_text(str(sov_entry["description"]))
            # Keep original English terms in searchText for bilingual FR+EN BM25 recall
            bilingual_hint = sanitize_text(f"{raw_name} {raw_desc}")[:260]
        else:
            display_name = sanitize_text(humanize_skill_name(raw_name))
            display_desc = raw_desc[:320]
            bilingual_hint = ""

        raw_tags = row.get("tags") or []
        clean_tags: list[str] = []
        seen_t: set[str] = set()
        for t in raw_tags if isinstance(raw_tags, list) else []:
            ts = sanitize_text(str(t).strip().lower())
            if ts and ts not in seen_t and len(clean_tags) < 8:
                seen_t.add(ts)
                clean_tags.append(ts)

        risk_raw = str(row.get("risk") or "safe").lower()
        is_offensive = risk_raw == "offensive"
        size_bytes = len(body_md.encode("utf-8"))

        entry: dict[str, object] = {
            "id": f"sov-skill:{slug}",
            "slug": slug,
            "name": display_name,
            "description": display_desc,
            "categoryId": cat_id,
            "categoryLabel": cat_label,
            "tags": clean_tags,
            "risk": "offensive" if is_offensive else "safe",
            "requiresOptIn": is_offensive,
            "isStarter": slug in sov_bodies,
            "sizeBytes": size_bytes,
        }
        if bilingual_hint:
            entry["enHint"] = bilingual_hint

        catalog_index.append(entry)
        shards[cat_id][slug] = body_md

    # 1) Add all matched sovereign skills first to guarantee 100% slug preservation
    for sov_slug, row_idx in matched_row_idx_by_sov_slug.items():
        add_entry(raw_rows[row_idx], preferred_slug=sov_slug)

    # 2) Add all remaining skills from the 3,538 source catalog
    for idx, row in enumerate(raw_rows):
        if idx in used_row_indices:
            continue
        add_entry(row, preferred_slug=None)

    # Sort deterministically: starter skills first within alphabetical order or pure slug/name
    catalog_index.sort(key=lambda x: str(x["slug"]))

    out_dir = repo_root / "packages" / "adapters" / "src" / "unified-skills-archive"
    out_dir.mkdir(parents=True, exist_ok=True)

    index_payload = {
        "version": "2.0.0",
        "totalSkills": len(catalog_index),
        "categories": [
            {
                "id": cid,
                "label": clabel,
                "count": sum(1 for e in catalog_index if e["categoryId"] == cid),
            }
            for cid, clabel in CATEGORY_DEFINITIONS
        ],
        "skills": catalog_index,
    }
    index_gz_bytes = write_deterministic_gzip(
        out_dir / "catalog-index.json.gz",
        json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")),
    )

    total_shard_gz_bytes = 0
    for cid, _ in CATEGORY_DEFINITIONS:
        shard_bytes = write_deterministic_gzip(
            out_dir / f"shard-{cid}.json.gz",
            json.dumps(shards[cid], ensure_ascii=False, separators=(",", ":")),
        )
        total_shard_gz_bytes += shard_bytes

    # Post-build verification: ensure ZERO confidential leaks in output
    leak_check_re = re.compile(
        r"(?:/Users/[A-Za-z0-9._-]+/|"
        r"\bsk-(?:proj-|live-|srv-)[A-Za-z0-9_-]{20,}|\bghp_[A-Za-z0-9]{25,}|\bAIza[0-9A-Za-z_-]{30,})",
        re.I,
    )
    for gz_file in sorted(out_dir.glob("*.json.gz")):
        decompressed = gzip.decompress(gz_file.read_bytes()).decode("utf-8")
        m = leak_check_re.search(decompressed)
        if m:
            print(f"SECURITY FAILURE in {gz_file.name}: {m.group(0)}", file=sys.stderr)
            return 2

    risk_counts = Counter(str(e["risk"]) for e in catalog_index)
    print(f"Unified catalog built successfully in {out_dir}")
    print(f"  Total unique skills : {len(catalog_index)}")
    print(f"  Starter FR enriched : {sum(1 for e in catalog_index if e['isStarter'])}")
    print(f"  Risk breakdown      : {dict(risk_counts)}")
    print(f"  Index gzipped size  : {index_gz_bytes / 1024:.1f} KB")
    print(f"  Shards gzipped size : {total_shard_gz_bytes / (1024 * 1024):.2f} MB across {len(CATEGORY_DEFINITIONS)} shards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
