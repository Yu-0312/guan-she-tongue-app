from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Literal

import albumentations as A
import cv2
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset

try:
    from .tongue_labels import CLASSES, CLASS_TCM_INFO, IDX_TO_CLASS
except ImportError:  # Allows `python ml/data_preprocessing.py`.
    from tongue_labels import CLASSES, CLASS_TCM_INFO, IDX_TO_CLASS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_DIR = ROOT / "ml" / "data" / "raw" / "tongue_diagnosis"
DEFAULT_PROCESSED_DIR = ROOT / "ml" / "data" / "processed" / "tongue_diagnosis"
DEFAULT_CONFIG_PATH = ROOT / "ml" / "config" / "class_config.json"

IMG_SIZE = 224
BATCH_SIZE = 32
NUM_WORKERS = 0
RANDOM_SEED = 42
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
CropMode = Literal["none", "lower-face", "mediapipe"]

MOUTH_LANDMARKS = {
    0,
    13,
    14,
    17,
    37,
    39,
    40,
    61,
    78,
    80,
    81,
    82,
    84,
    87,
    88,
    91,
    95,
    146,
    178,
    181,
    185,
    191,
    267,
    269,
    270,
    291,
    308,
    310,
    311,
    312,
    314,
    317,
    318,
    321,
    324,
    375,
    402,
    405,
    409,
    415,
}


def correct_white_balance(image: np.ndarray) -> np.ndarray:
    """Gray-world white balance to reduce lighting bias in tongue color."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    avg_a = float(np.average(lab[:, :, 1]))
    avg_b = float(np.average(lab[:, :, 2]))
    luminance = lab[:, :, 0] / 255.0
    lab[:, :, 1] -= (avg_a - 128.0) * luminance * 1.1
    lab[:, :, 2] -= (avg_b - 128.0) * luminance * 1.1
    lab = np.clip(lab, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def crop_lower_face(image: np.ndarray) -> np.ndarray:
    """Fast fallback crop for selfie images when face landmarks are unavailable."""
    height, width = image.shape[:2]
    y1 = int(height * 0.34)
    y2 = int(height * 0.98)
    x1 = int(width * 0.16)
    x2 = int(width * 0.84)
    return image[y1:y2, x1:x2] if y2 > y1 and x2 > x1 else image


def crop_mouth_with_mediapipe(image: np.ndarray) -> np.ndarray:
    """Locate mouth landmarks with MediaPipe FaceMesh and crop around mouth/tongue."""
    try:
        import mediapipe as mp
    except ImportError:
        return crop_lower_face(image)

    height, width = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    ) as face_mesh:
        result = face_mesh.process(rgb)

    if not result.multi_face_landmarks:
        return crop_lower_face(image)

    landmarks = result.multi_face_landmarks[0].landmark
    xs = [landmarks[index].x * width for index in MOUTH_LANDMARKS if index < len(landmarks)]
    ys = [landmarks[index].y * height for index in MOUTH_LANDMARKS if index < len(landmarks)]
    if not xs or not ys:
        return crop_lower_face(image)

    x1, x2 = min(xs), max(xs)
    y1, y2 = min(ys), max(ys)
    mouth_width = max(1.0, x2 - x1)
    mouth_height = max(1.0, y2 - y1)
    crop_x1 = max(0, int(x1 - mouth_width * 0.9))
    crop_x2 = min(width, int(x2 + mouth_width * 0.9))
    crop_y1 = max(0, int(y1 - mouth_height * 1.3))
    crop_y2 = min(height, int(y2 + mouth_height * 3.6))

    if crop_y2 <= crop_y1 or crop_x2 <= crop_x1:
        return crop_lower_face(image)
    return image[crop_y1:crop_y2, crop_x1:crop_x2]


def auto_crop_mouth_region(image: np.ndarray, mode: CropMode = "none") -> np.ndarray:
    if mode == "none":
        return image
    if mode == "mediapipe":
        return crop_mouth_with_mediapipe(image)
    return crop_lower_face(image)


def segment_tongue(image: np.ndarray) -> np.ndarray:
    """HSV threshold segmentation for red/pink tongue regions."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lower_red1 = np.array([0, 30, 60])
    upper_red1 = np.array([15, 255, 255])
    lower_red2 = np.array([160, 30, 60])
    upper_red2 = np.array([180, 255, 255])

    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask = cv2.bitwise_or(mask1, mask2)

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image

    largest = max(contours, key=cv2.contourArea)
    clean_mask = np.zeros_like(mask)
    cv2.drawContours(clean_mask, [largest], -1, 255, -1)
    return cv2.bitwise_and(image, image, mask=clean_mask)


def preprocess_single_image(
    img_path: str | Path,
    save_path: str | Path | None = None,
    *,
    crop_mode: CropMode = "none",
) -> np.ndarray:
    image = cv2.imread(str(img_path))
    if image is None:
        raise ValueError(f"Cannot read image: {img_path}")

    image = auto_crop_mouth_region(image, crop_mode)
    image = correct_white_balance(image)
    image = segment_tongue(image)
    image = cv2.resize(image, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA)

    if save_path is not None:
        save_path = Path(save_path)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(save_path), image):
            raise ValueError(f"Cannot write image: {save_path}")

    return image


def preprocess_dataset(
    raw_dir: str | Path = DEFAULT_RAW_DIR,
    output_dir: str | Path = DEFAULT_PROCESSED_DIR,
    *,
    force: bool = False,
    crop_mode: CropMode = "none",
) -> dict[str, int]:
    raw_dir = Path(raw_dir)
    output_dir = Path(output_dir)
    counts: dict[str, int] = {class_name: 0 for class_name in CLASSES}

    if not raw_dir.exists():
        raise FileNotFoundError(
            f"Raw data directory does not exist: {raw_dir}. "
            "Create one folder per class before preprocessing."
        )

    for class_name in CLASSES:
        class_dir = raw_dir / class_name
        if not class_dir.exists():
            print(f"Missing class folder, skipped: {class_dir}")
            continue

        used_names: set[str] = set()
        for source in sorted(class_dir.iterdir()):
            if not source.is_file() or source.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            target_name = unique_jpg_name(source.stem, used_names)
            target = output_dir / class_name / target_name
            if target.exists() and not force:
                counts[class_name] += 1
                continue

            try:
                preprocess_single_image(source, target, crop_mode=crop_mode)
                counts[class_name] += 1
            except Exception as exc:
                print(f"Skipped {source}: {exc}")

    total = sum(counts.values())
    print(f"Preprocessed {total} images into {output_dir}")
    for class_name, count in counts.items():
        print(f"  {class_name:15s} {count:5d}")
    return counts


def unique_jpg_name(stem: str, used_names: set[str]) -> str:
    base = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in stem).strip("_")
    base = base or "image"
    candidate = f"{base}.jpg"
    index = 2
    while candidate in used_names:
        candidate = f"{base}_{index}.jpg"
        index += 1
    used_names.add(candidate)
    return candidate


def get_train_transforms(image_size: int = IMG_SIZE) -> A.Compose:
    return A.Compose(
        [
            A.Resize(image_size, image_size),
            A.Rotate(limit=8, border_mode=cv2.BORDER_REFLECT_101, p=0.45),
            A.ShiftScaleRotate(
                shift_limit=0.03,
                scale_limit=0.08,
                rotate_limit=0,
                border_mode=cv2.BORDER_REFLECT_101,
                p=0.35,
            ),
            A.HorizontalFlip(p=0.5),
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.5),
            A.HueSaturationValue(
                hue_shift_limit=10,
                sat_shift_limit=20,
                val_shift_limit=20,
                p=0.4,
            ),
            A.GaussNoise(p=0.3),
            A.Blur(blur_limit=3, p=0.2),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )


def get_val_transforms(image_size: int = IMG_SIZE) -> A.Compose:
    return A.Compose(
        [
            A.Resize(image_size, image_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )


class TongueDiagnosisDataset(Dataset):
    def __init__(self, image_paths: list[Path], labels: list[int], transform=None):
        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform

    def __len__(self) -> int:
        return len(self.image_paths)

    def __getitem__(self, index: int):
        img_path = self.image_paths[index]
        image = cv2.imread(str(img_path))
        if image is None:
            raise ValueError(f"Cannot read image: {img_path}")
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        if self.transform is not None:
            image = self.transform(image=image)["image"]

        return image, self.labels[index]


def build_dataset_from_folder(data_dir: str | Path) -> tuple[list[Path], list[int]]:
    data_dir = Path(data_dir)
    image_paths: list[Path] = []
    labels: list[int] = []

    for class_name, class_index in CLASSES.items():
        class_dir = data_dir / class_name
        if not class_dir.exists():
            print(f"Missing class folder, skipped: {class_dir}")
            continue

        for path in sorted(class_dir.iterdir()):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                image_paths.append(path)
                labels.append(class_index)

    print(f"Loaded {len(image_paths)} images across {len(set(labels))} present classes")
    for index, count in sorted(Counter(labels).items()):
        print(f"  {IDX_TO_CLASS[index]:15s} {count:5d}")

    return image_paths, labels


def create_dataloaders(
    data_dir: str | Path = DEFAULT_PROCESSED_DIR,
    *,
    batch_size: int = BATCH_SIZE,
    num_workers: int = NUM_WORKERS,
    image_size: int = IMG_SIZE,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = RANDOM_SEED,
    pin_memory: bool = False,
) -> tuple[DataLoader, DataLoader, DataLoader]:
    image_paths, labels = build_dataset_from_folder(data_dir)
    if len(image_paths) == 0:
        raise ValueError(f"No images found in {data_dir}")
    if len(set(labels)) < 2:
        raise ValueError("At least two classes are required for training")

    test_size = val_ratio + test_ratio
    stratify = labels if min(Counter(labels).values()) >= 2 else None
    train_paths, temp_paths, train_labels, temp_labels = train_test_split(
        image_paths,
        labels,
        test_size=test_size,
        random_state=seed,
        stratify=stratify,
    )

    relative_test_size = test_ratio / test_size
    temp_counts = Counter(temp_labels)
    temp_stratify = temp_labels if min(temp_counts.values()) >= 2 else None
    val_paths, test_paths, val_labels, test_labels = train_test_split(
        temp_paths,
        temp_labels,
        test_size=relative_test_size,
        random_state=seed,
        stratify=temp_stratify,
    )

    train_ds = TongueDiagnosisDataset(train_paths, train_labels, get_train_transforms(image_size))
    val_ds = TongueDiagnosisDataset(val_paths, val_labels, get_val_transforms(image_size))
    test_ds = TongueDiagnosisDataset(test_paths, test_labels, get_val_transforms(image_size))

    print(f"Split sizes: train={len(train_ds)} val={len(val_ds)} test={len(test_ds)}")
    loader_options = {
        "batch_size": batch_size,
        "num_workers": num_workers,
        "pin_memory": pin_memory,
        "persistent_workers": num_workers > 0,
    }
    if num_workers > 0:
        loader_options["prefetch_factor"] = 2

    generator = torch.Generator()
    generator.manual_seed(seed)
    return (
        DataLoader(train_ds, shuffle=True, generator=generator, **loader_options),
        DataLoader(val_ds, shuffle=False, **loader_options),
        DataLoader(test_ds, shuffle=False, **loader_options),
    )


def save_class_config(output_path: str | Path = DEFAULT_CONFIG_PATH) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    config = {
        "classes": CLASSES,
        "idx_to_class": {str(index): name for index, name in IDX_TO_CLASS.items()},
        "tcm_info": CLASS_TCM_INFO,
        "img_size": IMG_SIZE,
        "num_classes": len(CLASSES),
    }
    output_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved class config: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Preprocess tongue images for CNN training.")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    parser.add_argument("--class-config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument(
        "--crop-mode",
        choices=["none", "lower-face", "mediapipe"],
        default="none",
        help="Optional mouth/tongue crop before color normalization.",
    )
    parser.add_argument("--force", action="store_true", help="Reprocess images even if outputs exist.")
    parser.add_argument("--skip-images", action="store_true", help="Only write class_config.json.")
    args = parser.parse_args()

    save_class_config(args.class_config)
    if not args.skip_images:
        preprocess_dataset(
            args.raw_dir,
            args.processed_dir,
            force=args.force,
            crop_mode=args.crop_mode,
        )


if __name__ == "__main__":
    main()
