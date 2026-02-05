#!/usr/bin/env python3
"""Rename GBA cover images using a No-Intro DAT (name -> gamecode).
DAT Download: https://datomatic.no-intro.org/index.php?page=download&s=64&op=daily
GBA Covers Download (example): https://forums.launchbox-app.com/files/file/2720-abeezys-nintendo-game-boy-advance-box-fronts/

Usage:
  python scripts/rename_gba_covers_from_dat.py \
    --dat "scripts/Nintendo - Game Boy Advance (20260124-113814).dat" \
    --covers "C:/covers" \
    --out "C:/out"

Notes:
- Uses the <rom serial="XXXX"> attribute as the gamecode.
- Matches by normalized game name vs image filename (name-based packs).
"""

from __future__ import annotations

import argparse
import csv
import re
import unicodedata
from pathlib import Path
import xml.etree.ElementTree as ET
from typing import Dict, Iterable

VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

LANGUAGE_TOKENS = {
    "en", "fr", "de", "es", "it", "pt", "ptbr", "nl", "sv", "no", "da", "fi",
    "ru", "ja", "ko", "zh", "zhs", "zht", "pl", "cs", "hu", "el", "tr",
}


def normalize_name(name: str) -> str:
    stem = Path(name).stem
    # Fix common replacement char for accented letters (e.g., Pok�mon -> Pokemon)
    stem = stem.replace("�", "e")
    # Normalize accents (Pokémon -> Pokemon)
    stem = unicodedata.normalize("NFKD", stem)
    stem = "".join(ch for ch in stem if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", stem.lower())


def _is_language_group(group: str) -> bool:
    tokens = [t.strip().lower().replace("-", "") for t in group.split(",")]
    tokens = [t for t in tokens if t]
    if not tokens:
        return False
    return all(t in LANGUAGE_TOKENS or (len(t) == 2 and t.isalpha()) for t in tokens)


def _is_region_group(group: str) -> bool:
    tokens = [t.strip().lower() for t in group.split(",")]
    tokens = [t for t in tokens if t]
    if not tokens:
        return False
    region_tokens = {"usa", "europe", "japan", "australia", "world", "asia", "korea", "china", "taiwan", "uk"}
    return all(t in region_tokens for t in tokens)


def strip_trailing_groups(name: str, predicate) -> str:
    current = name
    while True:
        match = re.search(r"\s*\(([^)]*)\)\s*$", current)
        if not match:
            return current.strip()
        group = match.group(1)
        if predicate(group):
            current = current[: match.start()].rstrip()
            continue
        return current.strip()


def generate_keys(name: str) -> Iterable[str]:
    base = name.strip()
    if not base:
        return []
    no_lang = strip_trailing_groups(base, _is_language_group)
    no_region = strip_trailing_groups(base, _is_region_group)
    no_lang_or_region = strip_trailing_groups(no_lang, _is_region_group)
    variants = {base, no_lang, no_region, no_lang_or_region}
    return {normalize_name(v) for v in variants if v}


def build_name_to_code_map(dat_path: Path) -> Dict[str, str]:
    tree = ET.parse(dat_path)
    root = tree.getroot()

    mapping: Dict[str, str] = {}

    # DAT format: <game name="..."> <rom serial="XXXX" ... /> </game>
    for game in root.findall("game"):
        game_name = game.get("name") or ""
        description = (game.findtext("description") or "").strip()
        rom = game.find("rom")
        serial = rom.get("serial") if rom is not None else None
        rom_name = rom.get("name") if rom is not None else ""

        if not game_name or not serial:
            continue

        for source in (game_name, description, rom_name):
            if source:
                for key in generate_keys(source):
                    if key and key not in mapping:
                        mapping[key] = serial.upper()

    return mapping


def main() -> None:
    parser = argparse.ArgumentParser(description="Rename GBA cover images using No-Intro DAT mapping")
    parser.add_argument("--dat", required=True, help="Path to No-Intro .dat file")
    parser.add_argument("--covers", required=True, help="Folder containing cover images (by name)")
    parser.add_argument("--out", required=True, help="Output folder for renamed covers")
    parser.add_argument("--report", default="rename_report.csv", help="CSV report filename")
    args = parser.parse_args()

    dat_path = Path(args.dat)
    covers_dir = Path(args.covers)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    name_to_code = build_name_to_code_map(dat_path)

    report_path = out_dir / args.report
    with report_path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["cover", "gamecode", "status"])  # header

        for cover in covers_dir.rglob("*"):
            if not cover.is_file() or cover.suffix.lower() not in VALID_IMAGE_EXTS:
                continue

            key = normalize_name(cover.name)
            code = name_to_code.get(key)
            if not code:
                writer.writerow([cover.name, "", "no_match"])
                continue

            target = out_dir / f"{code}{cover.suffix.lower()}"
            target.write_bytes(cover.read_bytes())
            writer.writerow([cover.name, code, "ok"])

    print(f"Done. Report written to: {report_path}")


if __name__ == "__main__":
    main()
