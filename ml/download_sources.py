from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "ml" / "data" / "raw"

TID_URL = (
    "https://static-content.springer.com/esm/art%3A10.1186%2F1749-8546-9-7/"
    "MediaObjects/13020_2013_201_MOESM2_ESM.zip"
)
BIOHIT_CONTENTS_URL = "https://api.github.com/repos/BioHit/TongeImageDataset/contents"
KAGGLE_TOOTH_MARKED = "clearhanhui/biyesheji"
KAGGLE_BIOHIT = "thngdngvn/biohit-tongue-image-dataset"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download tongue datasets from public sources.")
    parser.add_argument(
        "--sources",
        nargs="+",
        default=["tid"],
        choices=["tid", "biohit", "kaggle-tooth-marked", "kaggle-biohit", "roboflow"],
        help="Datasets to download. Kaggle and Roboflow usually require credentials.",
    )
    parser.add_argument("--raw-root", type=Path, default=RAW_ROOT)
    parser.add_argument("--force", action="store_true", help="Replace existing downloaded files.")
    parser.add_argument("--roboflow-workspace", default=os.getenv("ROBOFLOW_WORKSPACE"))
    parser.add_argument("--roboflow-project", default=os.getenv("ROBOFLOW_PROJECT"))
    parser.add_argument("--roboflow-version", default=os.getenv("ROBOFLOW_VERSION", "1"))
    parser.add_argument("--roboflow-format", default=os.getenv("ROBOFLOW_FORMAT", "yolov8"))
    parser.add_argument("--roboflow-api-key", default=os.getenv("ROBOFLOW_API_KEY"))
    args = parser.parse_args()

    args.raw_root.mkdir(parents=True, exist_ok=True)

    for source in args.sources:
        if source == "tid":
            download_tid(args.raw_root, args.force)
        elif source == "biohit":
            download_biohit(args.raw_root, args.force)
        elif source == "kaggle-tooth-marked":
            download_kaggle(KAGGLE_TOOTH_MARKED, args.raw_root / "kaggle_tooth_marked", args.force)
        elif source == "kaggle-biohit":
            download_kaggle(KAGGLE_BIOHIT, args.raw_root / "kaggle_biohit", args.force)
        elif source == "roboflow":
            download_roboflow(args)


def download_tid(raw_root: Path, force: bool) -> None:
    out_dir = raw_root / "tid"
    zip_path = out_dir / "tid.zip"
    extracted = out_dir / "extracted"

    out_dir.mkdir(parents=True, exist_ok=True)
    download_file(TID_URL, zip_path, force=force, min_bytes=1_000_000)

    if extracted.exists() and force:
        shutil.rmtree(extracted)
    if not extracted.exists():
        extracted.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as archive:
            safe_extract(archive, extracted)

    write_manifest(
        out_dir / "source.json",
        {
            "source": "TID / Springer supplementary file",
            "url": TID_URL,
            "notes": "Tongue images with manually prepared tongue-body benchmark images.",
        },
    )
    print(f"TID ready: {extracted}")


def download_biohit(raw_root: Path, force: bool) -> None:
    out_dir = raw_root / "biohit"
    out_dir.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(BIOHIT_CONTENTS_URL) as response:
        files = json.loads(response.read().decode("utf-8"))

    wanted = [
        item
        for item in files
        if item["name"].startswith("TongeImageDataset.") or item["name"] == "README"
    ]
    for item in wanted:
        download_file(item["download_url"], out_dir / item["name"], force=force)

    write_manifest(
        out_dir / "source.json",
        {
            "source": "BioHit/TongeImageDataset GitHub mirror",
            "url": "https://github.com/BioHit/TongeImageDataset",
            "notes": (
                "This is a split ZIP archive. Keep .z01-.z04 next to .zip. "
                "Use `zip -s 0 TongeImageDataset.zip --out biohit-full.zip` "
                "inside this directory if your unzip tool cannot open split archives."
            ),
        },
    )
    print(f"BioHit archive files ready: {out_dir}")


def download_kaggle(dataset: str, out_dir: Path, force: bool) -> None:
    kaggle = shutil.which("kaggle")
    if kaggle is None:
        print(
            "Kaggle CLI is not installed. Install it and place kaggle.json credentials, then rerun:\n"
            f"  pip install kaggle\n  kaggle datasets download -d {dataset} -p {out_dir} --unzip",
            file=sys.stderr,
        )
        return

    if out_dir.exists() and force:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    command = [kaggle, "datasets", "download", "-d", dataset, "-p", str(out_dir), "--unzip"]
    print("Running:", " ".join(command))
    subprocess.run(command, check=True)
    write_manifest(out_dir / "source.json", {"source": "Kaggle", "dataset": dataset})


def download_roboflow(args: argparse.Namespace) -> None:
    missing = [
        name
        for name, value in [
            ("ROBOFLOW_WORKSPACE", args.roboflow_workspace),
            ("ROBOFLOW_PROJECT", args.roboflow_project),
            ("ROBOFLOW_VERSION", args.roboflow_version),
            ("ROBOFLOW_API_KEY", args.roboflow_api_key),
        ]
        if not value
    ]
    if missing:
        print(
            "Roboflow download needs workspace/project/version/API key. Missing: "
            + ", ".join(missing),
            file=sys.stderr,
        )
        return

    out_dir = args.raw_root / "roboflow" / f"{args.roboflow_workspace}_{args.roboflow_project}_v{args.roboflow_version}"
    zip_path = out_dir / "roboflow.zip"
    out_dir.mkdir(parents=True, exist_ok=True)
    url = (
        f"https://universe.roboflow.com/{args.roboflow_workspace}/{args.roboflow_project}"
        f"/dataset/{args.roboflow_version}/download/{args.roboflow_format}"
        f"?key={args.roboflow_api_key}"
    )
    download_file(url, zip_path, force=args.force, min_bytes=1024)
    extracted = out_dir / "extracted"
    if extracted.exists() and args.force:
        shutil.rmtree(extracted)
    if not extracted.exists():
        extracted.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as archive:
            safe_extract(archive, extracted)
    write_manifest(
        out_dir / "source.json",
        {
            "source": "Roboflow Universe",
            "workspace": args.roboflow_workspace,
            "project": args.roboflow_project,
            "version": args.roboflow_version,
            "format": args.roboflow_format,
        },
    )
    print(f"Roboflow ready: {extracted}")


def download_file(url: str, destination: Path, *, force: bool = False, min_bytes: int = 1) -> None:
    if destination.exists() and destination.stat().st_size >= min_bytes and not force:
        print(f"Already exists: {destination}")
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + ".part")
    print(f"Downloading {url}\n  -> {destination}")
    with urllib.request.urlopen(url) as response, tmp.open("wb") as output:
        shutil.copyfileobj(response, output)
    if tmp.stat().st_size < min_bytes:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded file is unexpectedly small: {destination}")
    tmp.replace(destination)


def safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
    root = destination.resolve()
    for member in archive.infolist():
        target = (destination / member.filename).resolve()
        if not str(target).startswith(str(root)):
            raise RuntimeError(f"Unsafe ZIP member path: {member.filename}")
    archive.extractall(destination)


def write_manifest(path: Path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
