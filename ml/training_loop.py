from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from contextlib import nullcontext
from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.optim.lr_scheduler import CosineAnnealingLR, ReduceLROnPlateau
from torch.utils.tensorboard import SummaryWriter
from tqdm import tqdm

try:
    from .data_preprocessing import DEFAULT_PROCESSED_DIR, IMG_SIZE, create_dataloaders
    from .model_architecture import DEFAULT_MODEL_NAME, TongueCNNClassifier, get_supported_model_names
    from .tongue_labels import CLASSES, IDX_TO_CLASS
except ImportError:  # Allows `python ml/training_loop.py`.
    from data_preprocessing import DEFAULT_PROCESSED_DIR, IMG_SIZE, create_dataloaders
    from model_architecture import DEFAULT_MODEL_NAME, TongueCNNClassifier, get_supported_model_names
    from tongue_labels import CLASSES, IDX_TO_CLASS


ROOT = Path(__file__).resolve().parents[1]

CONFIG: dict[str, object] = {
    "data_dir": DEFAULT_PROCESSED_DIR,
    "model_name": DEFAULT_MODEL_NAME,
    "num_classes": len(CLASSES),
    "image_size": IMG_SIZE,
    "pretrained": True,
    "dropout_rate": 0.4,
    "phase1_epochs": 10,
    "phase1_lr": 1e-3,
    "phase2_epochs": 25,
    "phase2_lr": 5e-5,
    "unfreeze_blocks": 3,
    "batch_size": 32,
    "num_workers": 0,
    "pin_memory": False,
    "amp": True,
    "weight_decay": 1e-4,
    "label_smoothing": 0.1,
    "seed": 42,
    "selection_metric": "val_macro_f1",
    "checkpoint_dir": ROOT / "ml" / "checkpoints",
    "best_model_path": ROOT / "ml" / "models" / "tongue_best.pth",
    "log_dir": ROOT / "ml" / "runs" / "tongue_training",
    "output_dir": ROOT / "ml" / "outputs",
}


def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def compute_class_weights(labels: list[int], num_classes: int) -> torch.Tensor:
    counts = Counter(labels)
    total = len(labels)
    weights = []
    for index in range(num_classes):
        count = counts.get(index, 1)
        weights.append(total / (num_classes * count))
    tensor = torch.FloatTensor(weights)
    print("Class weights:", [round(float(value), 3) for value in tensor])
    return tensor


def should_use_amp(device: torch.device, enabled: bool) -> bool:
    return enabled and device.type == "cuda"


def move_batch_to_device(images, labels, device: torch.device, *, non_blocking: bool):
    return images.to(device, non_blocking=non_blocking), labels.to(device, non_blocking=non_blocking)


def autocast_context(enabled: bool):
    if enabled:
        return torch.autocast(device_type="cuda", dtype=torch.float16)
    return nullcontext()


def macro_f1(labels: list[int], preds: list[int], num_classes: int) -> float:
    if not labels:
        return 0.0
    return float(
        f1_score(
            labels,
            preds,
            labels=list(range(num_classes)),
            average="macro",
            zero_division=0,
        )
    )


def train_one_epoch(
    model,
    loader,
    criterion,
    optimizer,
    device,
    epoch: int,
    *,
    scaler=None,
    use_amp: bool = False,
) -> tuple[float, float]:
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    pbar = tqdm(loader, desc=f"Epoch {epoch:03d} [train]", leave=False)
    for images, labels in pbar:
        images, labels = move_batch_to_device(images, labels, device, non_blocking=use_amp)

        optimizer.zero_grad(set_to_none=True)
        with autocast_context(use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)

        if scaler is not None and scaler.is_enabled():
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        total_loss += float(loss.detach().cpu()) * labels.size(0)
        preds = outputs.argmax(dim=1)
        correct += int((preds == labels).sum().detach().cpu())
        total += int(labels.size(0))
        pbar.set_postfix({"loss": f"{loss.item():.4f}", "acc": f"{correct / max(1, total):.3f}"})

    return total_loss / max(1, total), correct / max(1, total)


@torch.no_grad()
def validate(
    model,
    loader,
    criterion,
    device,
    *,
    num_classes: int,
    use_amp: bool = False,
) -> tuple[float, float, float, list[int], list[int]]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    all_preds: list[int] = []
    all_labels: list[int] = []

    for images, labels in tqdm(loader, desc="[validate]", leave=False):
        images, labels = move_batch_to_device(images, labels, device, non_blocking=use_amp)
        with autocast_context(use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)

        total_loss += float(loss.detach().cpu()) * labels.size(0)
        preds = outputs.argmax(dim=1)
        correct += int((preds == labels).sum().detach().cpu())
        total += int(labels.size(0))
        all_preds.extend(int(value) for value in preds.cpu().tolist())
        all_labels.extend(int(value) for value in labels.cpu().tolist())

    return (
        total_loss / max(1, total),
        correct / max(1, total),
        macro_f1(all_labels, all_preds, num_classes),
        all_preds,
        all_labels,
    )


def train(config: dict[str, object]) -> TongueCNNClassifier:
    checkpoint_dir = Path(config["checkpoint_dir"])
    best_model_path = Path(config["best_model_path"])
    output_dir = Path(config["output_dir"])
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    best_model_path.parent.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = pick_device()
    print(f"Using device: {device}")
    use_amp = should_use_amp(device, bool(config.get("amp", True)))
    if use_amp:
        print("AMP enabled for CUDA training.")

    writer = SummaryWriter(log_dir=str(config["log_dir"]))
    train_loader, val_loader, test_loader = create_dataloaders(
        config["data_dir"],
        batch_size=int(config["batch_size"]),
        num_workers=int(config["num_workers"]),
        image_size=int(config["image_size"]),
        seed=int(config["seed"]),
        pin_memory=bool(config.get("pin_memory", device.type == "cuda")),
    )

    model = TongueCNNClassifier(
        num_classes=int(config["num_classes"]),
        pretrained=bool(config["pretrained"]),
        dropout_rate=float(config["dropout_rate"]),
        model_name=str(config["model_name"]),
    ).to(device)

    class_weights = compute_class_weights(train_loader.dataset.labels, int(config["num_classes"])).to(device)
    criterion = nn.CrossEntropyLoss(
        weight=class_weights,
        label_smoothing=float(config["label_smoothing"]),
    )

    best_score = -1.0
    history: dict[str, list[float]] = {
        "train_loss": [],
        "val_loss": [],
        "train_acc": [],
        "val_acc": [],
        "val_macro_f1": [],
    }
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    try:
        if int(config["phase1_epochs"]) > 0:
            print("\nPhase 1: train classifier head")
            model.freeze_backbone()
            optimizer = optim.AdamW(
                filter(lambda param: param.requires_grad, model.parameters()),
                lr=float(config["phase1_lr"]),
                weight_decay=float(config["weight_decay"]),
            )
            scheduler = CosineAnnealingLR(optimizer, T_max=int(config["phase1_epochs"]))

            for epoch in range(1, int(config["phase1_epochs"]) + 1):
                train_loss, train_acc = train_one_epoch(
                    model,
                    train_loader,
                    criterion,
                    optimizer,
                    device,
                    epoch,
                    scaler=scaler,
                    use_amp=use_amp,
                )
                val_loss, val_acc, val_macro_f1, _, _ = validate(
                    model,
                    val_loader,
                    criterion,
                    device,
                    num_classes=int(config["num_classes"]),
                    use_amp=use_amp,
                )
                scheduler.step()
                best_score = record_epoch(
                    model,
                    config,
                    writer,
                    history,
                    best_model_path,
                    epoch,
                    train_loss,
                    train_acc,
                    val_loss,
                    val_acc,
                    val_macro_f1,
                    best_score,
                )

        if int(config["phase2_epochs"]) > 0:
            print("\nPhase 2: fine-tune final backbone blocks")
            model.unfreeze_backbone(unfreeze_blocks=int(config["unfreeze_blocks"]))
            backbone_params = [param for param in model.backbone.parameters() if param.requires_grad]
            head_params = [param for param in model.classifier.parameters() if param.requires_grad]
            optimizer = optim.AdamW(
                [
                    {"params": backbone_params, "lr": float(config["phase2_lr"])},
                    {"params": head_params, "lr": float(config["phase2_lr"]) * 10},
                ],
                weight_decay=float(config["weight_decay"]),
            )
            scheduler = ReduceLROnPlateau(optimizer, mode="max", patience=5, factor=0.5)

            total_epochs = int(config["phase1_epochs"]) + int(config["phase2_epochs"])
            for epoch in range(int(config["phase1_epochs"]) + 1, total_epochs + 1):
                train_loss, train_acc = train_one_epoch(
                    model,
                    train_loader,
                    criterion,
                    optimizer,
                    device,
                    epoch,
                    scaler=scaler,
                    use_amp=use_amp,
                )
                val_loss, val_acc, val_macro_f1, _, _ = validate(
                    model,
                    val_loader,
                    criterion,
                    device,
                    num_classes=int(config["num_classes"]),
                    use_amp=use_amp,
                )
                scheduler.step(val_macro_f1)
                best_score = record_epoch(
                    model,
                    config,
                    writer,
                    history,
                    best_model_path,
                    epoch,
                    train_loss,
                    train_acc,
                    val_loss,
                    val_acc,
                    val_macro_f1,
                    best_score,
                )

                if epoch % 5 == 0:
                    torch.save(model.state_dict(), checkpoint_dir / f"epoch_{epoch:03d}.pth")
    finally:
        writer.close()

    evaluate_best_model(model, config, best_model_path, test_loader, criterion, device, history, use_amp=use_amp)
    print(f"Training complete. Best validation score: {best_score:.4f}")
    return model


def record_epoch(
    model,
    config: dict[str, object],
    writer: SummaryWriter,
    history: dict[str, list[float]],
    best_model_path: Path,
    epoch: int,
    train_loss: float,
    train_acc: float,
    val_loss: float,
    val_acc: float,
    val_macro_f1: float,
    best_score: float,
) -> float:
    history["train_loss"].append(train_loss)
    history["val_loss"].append(val_loss)
    history["train_acc"].append(train_acc)
    history["val_acc"].append(val_acc)
    history["val_macro_f1"].append(val_macro_f1)

    writer.add_scalars("Loss", {"train": train_loss, "val": val_loss}, epoch)
    writer.add_scalars("Accuracy", {"train": train_acc, "val": val_acc}, epoch)
    writer.add_scalar("F1/val_macro", val_macro_f1, epoch)

    print(
        f"Epoch {epoch:03d} | "
        f"train_loss={train_loss:.4f} train_acc={train_acc:.3f} | "
        f"val_loss={val_loss:.4f} val_acc={val_acc:.3f} val_macro_f1={val_macro_f1:.3f}"
    )
    selection_metric = str(config.get("selection_metric", "val_macro_f1"))
    current_score = val_macro_f1 if selection_metric == "val_macro_f1" else val_acc
    if current_score > best_score:
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_acc": val_acc,
                "val_macro_f1": val_macro_f1,
                "selection_metric": selection_metric,
                "selection_score": current_score,
                "model_name": str(config["model_name"]),
                "image_size": int(config["image_size"]),
                "saved_at": int(time.time()),
                "config": serializable_config(config),
            },
            best_model_path,
        )
        print(f"Saved best model: {best_model_path} ({selection_metric}={current_score:.3f})")
        return current_score
    return best_score


def evaluate_best_model(
    model,
    config: dict[str, object],
    best_model_path: Path,
    test_loader,
    criterion,
    device,
    history: dict[str, list[float]],
    *,
    use_amp: bool = False,
) -> dict[str, object]:
    checkpoint = torch_load(best_model_path, device)
    model.load_state_dict(checkpoint["model_state_dict"])
    _, test_acc, test_macro_f1, test_preds, test_labels = validate(
        model,
        test_loader,
        criterion,
        device,
        num_classes=int(config["num_classes"]),
        use_amp=use_amp,
    )

    class_names = [IDX_TO_CLASS[index] for index in range(int(config["num_classes"]))]
    labels = list(range(int(config["num_classes"])))
    print(f"\nTest accuracy: {test_acc:.4f}")
    print(f"Test macro F1: {test_macro_f1:.4f}")
    report_text = classification_report(
        test_labels,
        test_preds,
        labels=labels,
        target_names=class_names,
        digits=3,
        zero_division=0,
    )
    report_dict = classification_report(
        test_labels,
        test_preds,
        labels=labels,
        target_names=class_names,
        digits=3,
        zero_division=0,
        output_dict=True,
    )
    print(report_text)

    output_dir = Path(config["output_dir"])
    plot_confusion_matrix(
        test_labels,
        test_preds,
        class_names,
        output_dir / "confusion_matrix.png",
        labels=labels,
    )
    plot_training_history(history, output_dir / "training_history.png")
    (output_dir / "training_history.json").write_text(
        json.dumps(history, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    metrics = {
        "model_name": str(config["model_name"]),
        "image_size": int(config["image_size"]),
        "best_epoch": checkpoint.get("epoch"),
        "selection_metric": checkpoint.get("selection_metric"),
        "selection_score": checkpoint.get("selection_score"),
        "val_accuracy": checkpoint.get("val_acc"),
        "val_macro_f1": checkpoint.get("val_macro_f1"),
        "test_accuracy": test_acc,
        "test_macro_f1": test_macro_f1,
        "classification_report": report_dict,
    }
    (output_dir / "evaluation_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metrics


def plot_confusion_matrix(
    labels_true: list[int],
    labels_pred: list[int],
    class_names: list[str],
    save_path: Path,
    *,
    labels: list[int],
) -> None:
    cm = confusion_matrix(labels_true, labels_pred, labels=labels)
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=class_names, yticklabels=class_names)
    plt.title("Tongue Classification Confusion Matrix")
    plt.ylabel("Actual")
    plt.xlabel("Predicted")
    plt.tight_layout()
    save_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150)
    plt.close()
    print(f"Saved confusion matrix: {save_path}")


def plot_training_history(history: dict[str, list[float]], save_path: Path) -> None:
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(18, 5))
    epochs = range(1, len(history["train_loss"]) + 1)
    ax1.plot(epochs, history["train_loss"], "b-o", markersize=3, label="train")
    ax1.plot(epochs, history["val_loss"], "r-o", markersize=3, label="val")
    ax1.set_title("Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Loss")
    ax1.legend()

    ax2.plot(epochs, history["train_acc"], "b-o", markersize=3, label="train")
    ax2.plot(epochs, history["val_acc"], "r-o", markersize=3, label="val")
    ax2.set_title("Accuracy")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy")
    ax2.legend()

    ax3.plot(epochs, history.get("val_macro_f1", []), "g-o", markersize=3, label="val macro F1")
    ax3.set_title("Macro F1")
    ax3.set_xlabel("Epoch")
    ax3.set_ylabel("F1")
    ax3.legend()

    plt.tight_layout()
    save_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150)
    plt.close(fig)
    print(f"Saved training history plot: {save_path}")


def torch_load(path: Path, device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)


def serializable_config(config: dict[str, object]) -> dict[str, object]:
    return {key: str(value) if isinstance(value, Path) else value for key, value in config.items()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Two-phase transfer-learning CNN training for tongue diagnosis.")
    parser.add_argument("--data-dir", type=Path, default=CONFIG["data_dir"])
    parser.add_argument("--model-name", default=CONFIG["model_name"])
    parser.add_argument("--image-size", type=int, default=CONFIG["image_size"])
    parser.add_argument("--batch-size", type=int, default=CONFIG["batch_size"])
    parser.add_argument("--num-workers", type=int, default=CONFIG["num_workers"])
    parser.add_argument("--phase1-epochs", type=int, default=CONFIG["phase1_epochs"])
    parser.add_argument("--phase2-epochs", type=int, default=CONFIG["phase2_epochs"])
    parser.add_argument("--phase1-lr", type=float, default=CONFIG["phase1_lr"])
    parser.add_argument("--phase2-lr", type=float, default=CONFIG["phase2_lr"])
    parser.add_argument("--dropout-rate", type=float, default=CONFIG["dropout_rate"])
    parser.add_argument("--unfreeze-blocks", type=int, default=CONFIG["unfreeze_blocks"])
    parser.add_argument("--weight-decay", type=float, default=CONFIG["weight_decay"])
    parser.add_argument("--label-smoothing", type=float, default=CONFIG["label_smoothing"])
    parser.add_argument("--seed", type=int, default=CONFIG["seed"])
    parser.add_argument(
        "--selection-metric",
        choices=["val_macro_f1", "val_acc"],
        default=CONFIG["selection_metric"],
    )
    parser.add_argument("--list-models", action="store_true")
    parser.add_argument("--no-amp", action="store_true")
    parser.add_argument("--no-pretrained", action="store_true")
    args = parser.parse_args()
    if args.list_models:
        print("Supported model candidates:")
        for name in get_supported_model_names():
            print(f"  {name}")
        raise SystemExit(0)
    return args


def main() -> None:
    args = parse_args()
    config = dict(CONFIG)
    config.update(
        {
            "data_dir": args.data_dir,
            "model_name": args.model_name,
            "image_size": args.image_size,
            "batch_size": args.batch_size,
            "num_workers": args.num_workers,
            "phase1_epochs": args.phase1_epochs,
            "phase2_epochs": args.phase2_epochs,
            "phase1_lr": args.phase1_lr,
            "phase2_lr": args.phase2_lr,
            "dropout_rate": args.dropout_rate,
            "unfreeze_blocks": args.unfreeze_blocks,
            "weight_decay": args.weight_decay,
            "label_smoothing": args.label_smoothing,
            "seed": args.seed,
            "selection_metric": args.selection_metric,
            "amp": not args.no_amp,
            "pretrained": not args.no_pretrained,
        }
    )
    train(config)


if __name__ == "__main__":
    main()
