from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from train_cnn import (
    TinyClassifier,
    TinyUNet,
    import_torch,
    load_image_tensor,
    pick_device,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "ml" / "models" / "tongue_segmenter.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a trained tongue CNN on one image.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "ml" / "runs" / "prediction.png")
    args = parser.parse_args()

    torch = import_torch()
    device = pick_device(torch)
    checkpoint = torch.load(args.model, map_location=device)
    metadata = checkpoint["metadata"]
    task = metadata["task"]
    image_size = int(metadata["image_size"])

    if task == "segmentation":
        model = TinyUNet(torch)
        model.load_state_dict(checkpoint["model_state"])
        model.to(device).eval()
        save_segmentation(torch, model, args.image, args.out, image_size, metadata, device)
    elif task == "classification":
        classes = list(metadata["classes"])
        model = TinyClassifier(torch, num_classes=len(classes))
        model.load_state_dict(checkpoint["model_state"])
        model.to(device).eval()
        save_classification(torch, model, args.image, args.out, image_size, classes, device)
    else:
        raise SystemExit(f"Unsupported task in checkpoint: {task}")


def save_segmentation(torch, model, image_path: Path, out_path: Path, image_size: int, metadata, device) -> None:
    original = Image.open(image_path).convert("RGB")
    image = load_image_tensor(torch, image_path, image_size).unsqueeze(0).to(device)
    threshold = float(metadata.get("threshold", 0.5))

    with torch.no_grad():
        probabilities = torch.sigmoid(model(image))[0, 0].detach().cpu()

    mask = Image.new("L", (image_size, image_size))
    mask.putdata([255 if float(value) >= threshold else 0 for value in probabilities.flatten()])
    mask = mask.resize(original.size, Image.Resampling.NEAREST)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    mask.save(out_path)
    print(f"Saved segmentation mask: {out_path}")


def save_classification(torch, model, image_path: Path, out_path: Path, image_size: int, classes: list[str], device) -> None:
    image = load_image_tensor(torch, image_path, image_size).unsqueeze(0).to(device)
    with torch.no_grad():
        probabilities = torch.softmax(model(image), dim=1)[0].detach().cpu()

    result = [
        {"class": class_name, "probability": float(probabilities[index])}
        for index, class_name in enumerate(classes)
    ]
    result.sort(key=lambda item: item["probability"], reverse=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved classification result: {out_path}")


if __name__ == "__main__":
    main()
