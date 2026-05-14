from __future__ import annotations

import argparse
import random
import shutil
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "ml" / "data" / "raw"
OUT_ROOT = ROOT / "ml" / "data" / "processed" / "tongue_classification"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert Kaggle/Roboflow/YOLO-style datasets into ImageFolder format."
    )
    parser.add_argument("--source-dir", type=Path, default=RAW_ROOT)
    parser.add_argument("--out", type=Path, default=OUT_ROOT)
    parser.add_argument(
        "--mode",
        choices=["auto", "yolo", "imagefolder"],
        default="auto",
        help="Use yolo for Roboflow/TMC exports, imagefolder for Kaggle classification folders.",
    )
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if args.out.exists() and args.force:
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True, exist_ok=True)

    mode = args.mode
    if mode == "auto":
        mode = "yolo" if find_yolo_roots(args.source_dir) else "imagefolder"

    if mode == "yolo":
        count = convert_yolo(args.source_dir, args.out)
    else:
        count = convert_imagefolder(args.source_dir, args.out, args.val_ratio, args.seed)

    if count == 0:
        raise SystemExit(f"No classification images found in {args.source_dir}")
    print(f"Prepared {count} classification images in {args.out}")


def convert_yolo(source_dir: Path, out: Path) -> int:
    count = 0
    for root in find_yolo_roots(source_dir):
        class_names = read_classes(root)
        for split in ["train", "valid", "val", "test"]:
            split_dir = root / split
            images_dir = split_dir / "images"
            labels_dir = split_dir / "labels"
            if not images_dir.exists() or not labels_dir.exists():
                continue

            target_split = "val" if split in {"valid", "val"} else split
            for image in iter_images(images_dir):
                label_file = labels_dir / f"{image.stem}.txt"
                label = read_primary_yolo_label(label_file)
                if label is None:
                    continue
                class_name = class_names.get(label, f"class_{label}")
                target = out / target_split / sanitize_class_name(class_name) / image.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(image, target)
                count += 1
    return count


def convert_imagefolder(source_dir: Path, out: Path, val_ratio: float, seed: int) -> int:
    class_dirs = [
        path
        for path in source_dir.rglob("*")
        if path.is_dir() and any(child.suffix.lower() in IMAGE_EXTENSIONS for child in path.iterdir())
    ]
    if not class_dirs:
        return 0

    rng = random.Random(seed)
    count = 0
    for class_dir in class_dirs:
        images = list(iter_images(class_dir))
        if not images:
            continue
        rng.shuffle(images)
        val_count = max(1, round(len(images) * val_ratio)) if len(images) > 1 else 0
        class_name = sanitize_class_name(class_dir.name)
        for index, image in enumerate(images):
            split = "val" if index < val_count else "train"
            target = out / split / class_name / image.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image, target)
            count += 1
    return count


def find_yolo_roots(source_dir: Path) -> list[Path]:
    roots = set()
    for classes in source_dir.rglob("classes.txt"):
        root = classes.parent
        if any((root / split / "images").exists() for split in ["train", "valid", "val", "test"]):
            roots.add(root)
    for data_yaml in list(source_dir.rglob("data.yaml")) + list(source_dir.rglob("data.yml")):
        root = data_yaml.parent
        if any((root / split / "images").exists() for split in ["train", "valid", "val", "test"]):
            roots.add(root)
    return sorted(roots)


def read_classes(root: Path) -> dict[int, str]:
    classes_file = root / "classes.txt"
    if classes_file.exists():
        return {
            index: line.strip()
            for index, line in enumerate(classes_file.read_text(encoding="utf-8").splitlines())
            if line.strip()
        }
    return {}


def read_primary_yolo_label(path: Path) -> int | None:
    if not path.exists():
        return None
    labels = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split()
        if parts and parts[0].lstrip("-").isdigit():
            labels.append(int(parts[0]))
    if not labels:
        return None
    return Counter(labels).most_common(1)[0][0]


def iter_images(directory: Path):
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            yield path


def sanitize_class_name(name: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in name.strip())
    return cleaned or "unknown"


if __name__ == "__main__":
    main()
