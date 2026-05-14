from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

import torch

try:
    from .model_architecture import describe_model_candidates
    from .training_loop import CONFIG, train, torch_load
except ImportError:  # Allows `python ml/model_search.py`.
    from model_architecture import describe_model_candidates
    from training_loop import CONFIG, train, torch_load


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "ml" / "outputs" / "model_search"
DEFAULT_MODELS = "efficientnet_b0,mobilenetv3_large_100,efficientnet_b3,convnext_tiny"


def parse_models(value: str) -> list[str]:
    models = [item.strip() for item in value.split(",") if item.strip()]
    if not models:
        raise ValueError("At least one model name is required")
    return models


def slugify(value: str) -> str:
    return "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in value).strip("_")


def load_json(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def collect_run_metrics(model_name: str, best_model_path: Path, output_dir: Path) -> dict[str, object]:
    checkpoint = torch_load(best_model_path, torch.device("cpu")) if best_model_path.exists() else {}
    evaluation = load_json(output_dir / "evaluation_metrics.json")
    return {
        "model_name": model_name,
        "status": "ok",
        "best_epoch": checkpoint.get("epoch") or evaluation.get("best_epoch"),
        "selection_metric": checkpoint.get("selection_metric") or evaluation.get("selection_metric"),
        "selection_score": checkpoint.get("selection_score") or evaluation.get("selection_score"),
        "val_accuracy": checkpoint.get("val_acc") or evaluation.get("val_accuracy"),
        "val_macro_f1": checkpoint.get("val_macro_f1") or evaluation.get("val_macro_f1"),
        "test_accuracy": evaluation.get("test_accuracy"),
        "test_macro_f1": evaluation.get("test_macro_f1"),
        "best_model_path": str(best_model_path),
        "output_dir": str(output_dir),
    }


def sort_key(row: dict[str, object]) -> tuple[int, float]:
    score = row.get("selection_score")
    return (0 if isinstance(score, (float, int)) else 1, -float(score or 0.0))


def write_leaderboard(rows: list[dict[str, object]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    rows = sorted(rows, key=sort_key)
    (output_dir / "leaderboard.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    csv_path = output_dir / "leaderboard.csv"
    fieldnames = [
        "rank",
        "model_name",
        "status",
        "selection_metric",
        "selection_score",
        "val_macro_f1",
        "val_accuracy",
        "test_macro_f1",
        "test_accuracy",
        "runtime_sec",
        "best_epoch",
        "best_model_path",
        "output_dir",
        "error",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for rank, row in enumerate(rows, start=1):
            writer.writerow({"rank": rank, **{key: row.get(key) for key in fieldnames if key != "rank"}})

    print(f"\nSaved leaderboard: {output_dir / 'leaderboard.json'}")
    print(f"Saved leaderboard CSV: {csv_path}")
    if rows and rows[0].get("status") == "ok":
        best = rows[0]
        print(
            "Best candidate: "
            f"{best['model_name']} ({best.get('selection_metric')}={float(best.get('selection_score') or 0):.4f})"
        )


def build_run_config(args: argparse.Namespace, model_name: str) -> tuple[dict[str, object], Path, Path]:
    run_name = slugify(model_name)
    output_dir = args.output_dir / "runs" / run_name
    best_model_path = args.output_dir / "models" / f"{run_name}.pth"

    config = dict(CONFIG)
    config.update(
        {
            "data_dir": args.data_dir,
            "model_name": model_name,
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
            "pretrained": not args.no_pretrained,
            "amp": not args.no_amp,
            "checkpoint_dir": args.output_dir / "checkpoints" / run_name,
            "best_model_path": best_model_path,
            "log_dir": args.output_dir / "tensorboard" / run_name,
            "output_dir": output_dir,
        }
    )
    return config, best_model_path, output_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train several CNN backbones and write a leaderboard.")
    parser.add_argument("--data-dir", type=Path, default=CONFIG["data_dir"])
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--models", default=DEFAULT_MODELS, help="Comma-separated timm model names.")
    parser.add_argument("--image-size", type=int, default=CONFIG["image_size"])
    parser.add_argument("--batch-size", type=int, default=CONFIG["batch_size"])
    parser.add_argument("--num-workers", type=int, default=CONFIG["num_workers"])
    parser.add_argument("--phase1-epochs", type=int, default=6)
    parser.add_argument("--phase2-epochs", type=int, default=8)
    parser.add_argument("--phase1-lr", type=float, default=CONFIG["phase1_lr"])
    parser.add_argument("--phase2-lr", type=float, default=CONFIG["phase2_lr"])
    parser.add_argument("--dropout-rate", type=float, default=CONFIG["dropout_rate"])
    parser.add_argument("--unfreeze-blocks", type=int, default=CONFIG["unfreeze_blocks"])
    parser.add_argument("--weight-decay", type=float, default=CONFIG["weight_decay"])
    parser.add_argument("--label-smoothing", type=float, default=CONFIG["label_smoothing"])
    parser.add_argument("--seed", type=int, default=CONFIG["seed"])
    parser.add_argument("--selection-metric", choices=["val_macro_f1", "val_acc"], default=CONFIG["selection_metric"])
    parser.add_argument("--list-models", action="store_true")
    parser.add_argument("--no-amp", action="store_true")
    parser.add_argument("--no-pretrained", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.list_models:
        print(describe_model_candidates())
        return

    rows: list[dict[str, object]] = []
    for model_name in parse_models(args.models):
        print(f"\n=== Model search: {model_name} ===")
        config, best_model_path, output_dir = build_run_config(args, model_name)
        started = time.time()
        try:
            train(config)
            row = collect_run_metrics(model_name, best_model_path, output_dir)
        except Exception as exc:
            row = {
                "model_name": model_name,
                "status": "failed",
                "error": str(exc),
                "best_model_path": str(best_model_path),
                "output_dir": str(output_dir),
            }
            print(f"Model failed: {model_name}: {exc}")

        row["runtime_sec"] = round(time.time() - started, 1)
        rows.append(row)
        write_leaderboard(rows, args.output_dir)


if __name__ == "__main__":
    main()
