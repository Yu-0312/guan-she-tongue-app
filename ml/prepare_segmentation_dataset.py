from __future__ import annotations

import argparse
import random
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "ml" / "data" / "raw"
OUT_ROOT = ROOT / "ml" / "data" / "processed" / "tongue_segmentation"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


@dataclass(frozen=True)
class Pair:
    image: Path
    mask_source: Path
    name: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare tongue segmentation data.")
    parser.add_argument("--raw-root", type=Path, default=RAW_ROOT)
    parser.add_argument("--out", type=Path, default=OUT_ROOT)
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    pairs = find_tid_pairs(args.raw_root / "tid")
    if not pairs:
        raise SystemExit(
            "No TID pairs found. Run: python ml/download_sources.py --sources tid"
        )

    if args.out.exists() and args.force:
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    pairs = list(pairs)
    rng.shuffle(pairs)
    val_count = max(1, round(len(pairs) * args.val_ratio)) if len(pairs) > 1 else 0
    splits = {
        "val": pairs[:val_count],
        "train": pairs[val_count:],
    }

    for split, split_pairs in splits.items():
        for subdir in ["images", "masks"]:
            (args.out / split / subdir).mkdir(parents=True, exist_ok=True)
        for pair in split_pairs:
            save_pair(pair, args.out / split, args.image_size)

    print(f"Prepared {len(splits['train'])} train and {len(splits['val'])} val pairs in {args.out}")


def find_tid_pairs(tid_root: Path) -> list[Pair]:
    extracted = tid_root / "extracted"
    zip_path = tid_root / "tid.zip"
    if not extracted.exists() and zip_path.exists():
        extracted.mkdir(parents=True)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(extracted)

    if not extracted.exists():
        return []

    test_images = find_dir(extracted, "Test images")
    standard_images = find_dir(extracted, "Stanard images") or find_dir(extracted, "Standard images")
    if not test_images or not standard_images:
        return []

    pairs: list[Pair] = []
    for image_path in sorted(test_images.iterdir()):
        if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        stem = image_path.stem
        index = stem[1:] if stem.lower().startswith("t") else stem
        mask = first_existing(
            standard_images / f"{index}.tif",
            standard_images / f"{index}.tiff",
            standard_images / f"{index}.png",
            standard_images / f"{index}.jpg",
        )
        if mask:
            pairs.append(Pair(image=image_path, mask_source=mask, name=f"tid_{index.zfill(4)}"))
    return pairs


def find_dir(root: Path, name: str) -> Path | None:
    for candidate in root.rglob("*"):
        if candidate.is_dir() and candidate.name == name:
            return candidate
    return None


def first_existing(*paths: Path) -> Path | None:
    return next((path for path in paths if path.exists()), None)


def save_pair(pair: Pair, out_dir: Path, image_size: int) -> None:
    image = Image.open(pair.image).convert("RGB")
    mask_source = Image.open(pair.mask_source).convert("RGB")

    image = resize_square(image, image_size, resample=Image.Resampling.BILINEAR)
    mask_source = resize_square(mask_source, image_size, resample=Image.Resampling.BILINEAR)
    mask = mask_from_non_white_region(mask_source)

    image.save(out_dir / "images" / f"{pair.name}.jpg", quality=92)
    mask.save(out_dir / "masks" / f"{pair.name}.png")


def resize_square(image: Image.Image, size: int, *, resample: Image.Resampling) -> Image.Image:
    return image.resize((size, size), resample=resample)


def mask_from_non_white_region(image: Image.Image) -> Image.Image:
    mask = Image.new("L", image.size)
    pixels = []
    for red, green, blue in image.getdata():
        is_foreground = not (red > 245 and green > 245 and blue > 245)
        pixels.append(255 if is_foreground else 0)
    mask.putdata(pixels)
    return mask


if __name__ == "__main__":
    main()
