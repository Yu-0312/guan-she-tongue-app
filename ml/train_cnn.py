from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SEGMENTATION_ROOT = ROOT / "ml" / "data" / "processed" / "tongue_segmentation"
CLASSIFICATION_ROOT = ROOT / "ml" / "data" / "processed" / "tongue_classification"
MODEL_ROOT = ROOT / "ml" / "models"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a CNN model for tongue images.")
    parser.add_argument("--task", choices=["segmentation", "classification"], default="segmentation")
    parser.add_argument("--data", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    torch = import_torch()
    set_seed(torch, args.seed)
    device = pick_device(torch)
    print(f"Using device: {device}")

    data_root = args.data or (SEGMENTATION_ROOT if args.task == "segmentation" else CLASSIFICATION_ROOT)
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)

    if args.task == "segmentation":
        out_path = args.out or (MODEL_ROOT / "tongue_segmenter.pt")
        train_segmentation(torch, data_root, out_path, args, device)
    else:
        out_path = args.out or (MODEL_ROOT / "tongue_classifier.pt")
        train_classification(torch, data_root, out_path, args, device)


def train_segmentation(torch, data_root: Path, out_path: Path, args, device) -> None:
    train_set = SegmentationDataset(torch, data_root / "train", args.image_size)
    val_set = SegmentationDataset(torch, data_root / "val", args.image_size)
    if len(train_set) == 0:
        raise SystemExit(f"No segmentation training data found in {data_root}")

    train_loader = make_loader(torch, train_set, args.batch_size, shuffle=True)
    val_loader = make_loader(torch, val_set, args.batch_size, shuffle=False) if len(val_set) else None

    model = TinyUNet(torch).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    criterion = torch.nn.BCEWithLogitsLoss()

    best_dice = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        for images, masks in train_loader:
            images = images.to(device)
            masks = masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, masks)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().cpu()) * images.size(0)

        train_loss = total_loss / max(1, len(train_set))
        val_dice = evaluate_segmentation(torch, model, val_loader, device) if val_loader else math.nan
        print(f"epoch {epoch:03d} loss={train_loss:.4f} val_dice={val_dice:.4f}")
        if math.isnan(val_dice) or val_dice > best_dice:
            best_dice = val_dice if not math.isnan(val_dice) else best_dice
            save_checkpoint(
                torch,
                out_path,
                model,
                {
                    "task": "segmentation",
                    "image_size": args.image_size,
                    "threshold": 0.5,
                    "val_dice": val_dice,
                },
            )

    print(f"Saved model: {out_path}")


def train_classification(torch, data_root: Path, out_path: Path, args, device) -> None:
    train_set = ImageFolderDataset(torch, data_root / "train", args.image_size)
    val_set = ImageFolderDataset(torch, data_root / "val", args.image_size, classes=train_set.classes)
    if len(train_set) == 0 or len(train_set.classes) < 2:
        raise SystemExit(f"Need at least two classes in {data_root / 'train'}")

    train_loader = make_loader(torch, train_set, args.batch_size, shuffle=True)
    val_loader = make_loader(torch, val_set, args.batch_size, shuffle=False) if len(val_set) else None

    model = TinyClassifier(torch, num_classes=len(train_set.classes)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    criterion = torch.nn.CrossEntropyLoss()

    best_accuracy = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().cpu()) * images.size(0)

        train_loss = total_loss / max(1, len(train_set))
        val_accuracy = evaluate_classification(torch, model, val_loader, device) if val_loader else math.nan
        print(f"epoch {epoch:03d} loss={train_loss:.4f} val_acc={val_accuracy:.4f}")
        if math.isnan(val_accuracy) or val_accuracy > best_accuracy:
            best_accuracy = val_accuracy if not math.isnan(val_accuracy) else best_accuracy
            save_checkpoint(
                torch,
                out_path,
                model,
                {
                    "task": "classification",
                    "image_size": args.image_size,
                    "classes": train_set.classes,
                    "val_accuracy": val_accuracy,
                },
            )

    print(f"Saved model: {out_path}")


class SegmentationDataset:
    def __init__(self, torch, root: Path, image_size: int):
        self.torch = torch
        self.root = root
        self.image_size = image_size
        self.images = sorted((root / "images").glob("*")) if (root / "images").exists() else []
        self.images = [path for path in self.images if path.suffix.lower() in IMAGE_EXTENSIONS]

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int):
        image_path = self.images[index]
        mask_path = self.root / "masks" / f"{image_path.stem}.png"
        image = load_image_tensor(self.torch, image_path, self.image_size)
        mask = load_mask_tensor(self.torch, mask_path, self.image_size)
        return image, mask


class ImageFolderDataset:
    def __init__(self, torch, root: Path, image_size: int, classes: list[str] | None = None):
        self.torch = torch
        self.root = root
        self.image_size = image_size
        self.classes = classes or sorted(path.name for path in root.iterdir() if path.is_dir()) if root.exists() else []
        self.class_to_index = {name: index for index, name in enumerate(self.classes)}
        self.samples = []
        for class_name in self.classes:
            class_dir = root / class_name
            if not class_dir.exists():
                continue
            for path in sorted(class_dir.iterdir()):
                if path.suffix.lower() in IMAGE_EXTENSIONS:
                    self.samples.append((path, self.class_to_index[class_name]))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int):
        image_path, label = self.samples[index]
        return load_image_tensor(self.torch, image_path, self.image_size), self.torch.tensor(label).long()


def load_image_tensor(torch, path: Path, image_size: int):
    image = Image.open(path).convert("RGB").resize((image_size, image_size), Image.Resampling.BILINEAR)
    tensor = torch.frombuffer(bytearray(image.tobytes()), dtype=torch.uint8)
    tensor = tensor.view(image_size, image_size, 3).permute(2, 0, 1).float().div(255.0)
    return normalize(tensor)


def load_mask_tensor(torch, path: Path, image_size: int):
    mask = Image.open(path).convert("L").resize((image_size, image_size), Image.Resampling.NEAREST)
    tensor = torch.frombuffer(bytearray(mask.tobytes()), dtype=torch.uint8)
    return tensor.view(1, image_size, image_size).float().div(255.0).clamp(0, 1)


def normalize(tensor):
    mean = tensor.new_tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
    std = tensor.new_tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
    return (tensor - mean) / std


class TinyUNet:
    def __new__(cls, torch):
        nn = torch.nn

        class _TinyUNet(nn.Module):
            def __init__(self):
                super().__init__()
                self.down1 = block(3, 16)
                self.down2 = block(16, 32)
                self.down3 = block(32, 64)
                self.pool = nn.MaxPool2d(2)
                self.up2 = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
                self.dec2 = block(64, 32)
                self.up1 = nn.ConvTranspose2d(32, 16, kernel_size=2, stride=2)
                self.dec1 = block(32, 16)
                self.out = nn.Conv2d(16, 1, kernel_size=1)

            def forward(self, x):
                x1 = self.down1(x)
                x2 = self.down2(self.pool(x1))
                x3 = self.down3(self.pool(x2))
                x = self.up2(x3)
                x = self.dec2(torch.cat([x, x2], dim=1))
                x = self.up1(x)
                x = self.dec1(torch.cat([x, x1], dim=1))
                return self.out(x)

        def block(in_channels: int, out_channels: int):
            return nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
            )

        return _TinyUNet()


class TinyClassifier:
    def __new__(cls, torch, num_classes: int):
        nn = torch.nn

        class _TinyClassifier(nn.Module):
            def __init__(self):
                super().__init__()
                self.features = nn.Sequential(
                    conv(3, 32),
                    conv(32, 64),
                    conv(64, 128),
                    nn.AdaptiveAvgPool2d((1, 1)),
                )
                self.head = nn.Linear(128, num_classes)

            def forward(self, x):
                x = self.features(x).flatten(1)
                return self.head(x)

        def conv(in_channels: int, out_channels: int):
            return nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
            )

        return _TinyClassifier()


def make_loader(torch, dataset, batch_size: int, shuffle: bool):
    return torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=shuffle, num_workers=0)


def evaluate_segmentation(torch, model, loader, device) -> float:
    if loader is None:
        return math.nan
    model.eval()
    scores = []
    with torch.no_grad():
        for images, masks in loader:
            images = images.to(device)
            masks = masks.to(device)
            preds = (torch.sigmoid(model(images)) > 0.5).float()
            intersection = (preds * masks).sum(dim=(1, 2, 3))
            union = preds.sum(dim=(1, 2, 3)) + masks.sum(dim=(1, 2, 3))
            dice = (2 * intersection + 1.0) / (union + 1.0)
            scores.extend(float(value.cpu()) for value in dice)
    return sum(scores) / max(1, len(scores))


def evaluate_classification(torch, model, loader, device) -> float:
    if loader is None:
        return math.nan
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            predictions = model(images).argmax(dim=1)
            correct += int((predictions == labels).sum().cpu())
            total += int(labels.numel())
    return correct / max(1, total)


def save_checkpoint(torch, out_path: Path, model, metadata: dict[str, object]) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model_state": model.state_dict(), "metadata": metadata}, out_path)
    out_path.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def import_torch():
    try:
        import torch

        return torch
    except ImportError as exc:
        raise SystemExit(
            "PyTorch is not installed. Run:\n"
            "  /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m venv .venv\n"
            "  .venv/bin/python -m pip install -r ml/requirements.txt"
        ) from exc


def pick_device(torch):
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def set_seed(torch, seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)


if __name__ == "__main__":
    main()
