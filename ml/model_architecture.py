from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import torch
import torch.nn as nn
import timm

try:
    from torchinfo import summary
except ImportError:  # torchinfo is only needed for the optional CLI summary.
    summary = None

try:
    from .tongue_labels import CLASS_TCM_INFO, CLASSES, IDX_TO_CLASS, RECOMMENDATIONS_DB
except ImportError:  # Allows `python ml/model_architecture.py`.
    from tongue_labels import CLASS_TCM_INFO, CLASSES, IDX_TO_CLASS, RECOMMENDATIONS_DB


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ONNX_PATH = ROOT / "ml" / "models" / "tongue_model.onnx"
DEFAULT_MODEL_NAME = "efficientnet_b3"


@dataclass(frozen=True)
class BackboneSpec:
    timm_name: str
    input_size: int
    description: str


MODEL_REGISTRY: dict[str, BackboneSpec] = {
    "mobilenetv3_large_100": BackboneSpec(
        timm_name="mobilenetv3_large_100",
        input_size=224,
        description="低延遲、適合手機或邊緣端部署的 MobileNetV3 baseline。",
    ),
    "efficientnet_b0": BackboneSpec(
        timm_name="efficientnet_b0",
        input_size=224,
        description="速度與準確率平衡佳，適合資料量尚未很大時作為第一個正式模型。",
    ),
    "efficientnet_b3": BackboneSpec(
        timm_name="efficientnet_b3",
        input_size=224,
        description="目前專案既有預設，雲端推論可接受較大模型時通常有更高上限。",
    ),
    "convnext_tiny": BackboneSpec(
        timm_name="convnext_tiny",
        input_size=224,
        description="現代化 CNN 候選，適合作為 EfficientNet 系列外的強 baseline。",
    ),
}


def get_supported_model_names() -> list[str]:
    return list(MODEL_REGISTRY)


def resolve_model_name(model_name: str) -> str:
    return MODEL_REGISTRY.get(model_name, BackboneSpec(model_name, 224, "")).timm_name


def model_input_size(model_name: str) -> int:
    return MODEL_REGISTRY.get(model_name, BackboneSpec(model_name, 224, "")).input_size


def describe_model_candidates() -> str:
    rows = []
    for name, spec in MODEL_REGISTRY.items():
        rows.append(f"{name:22s} input={spec.input_size:3d}  {spec.description}")
    return "\n".join(rows)


def count_trainable_parameters(model: nn.Module) -> tuple[int, int]:
    trainable = sum(param.numel() for param in model.parameters() if param.requires_grad)
    total = sum(param.numel() for param in model.parameters())
    return trainable, total


def infer_backbone_output_features(backbone: nn.Module, image_size: int) -> int:
    was_training = backbone.training
    backbone.eval()
    with torch.no_grad():
        features = backbone(torch.zeros(1, 3, image_size, image_size))
    if was_training:
        backbone.train()
    return int(features.flatten(1).shape[1])


class TongueCNNClassifier(nn.Module):
    """Configurable timm CNN backbone with a compact tongue-classification head."""

    def __init__(
        self,
        num_classes: int = 8,
        pretrained: bool = True,
        dropout_rate: float = 0.4,
        model_name: str = DEFAULT_MODEL_NAME,
    ):
        super().__init__()
        self.model_name = model_name
        self.backbone_name = resolve_model_name(model_name)
        self.image_size = model_input_size(model_name)
        self.backbone = timm.create_model(
            self.backbone_name,
            pretrained=pretrained,
            num_classes=0,
            global_pool="avg",
        )
        backbone_out_features = infer_backbone_output_features(self.backbone, self.image_size)
        hidden_features = min(512, max(128, backbone_out_features // 2))
        bottleneck_features = min(128, max(64, hidden_features // 4))

        self.classifier = nn.Sequential(
            nn.Linear(backbone_out_features, hidden_features),
            nn.LayerNorm(hidden_features),
            nn.SiLU(inplace=True),
            nn.Dropout(p=dropout_rate),
            nn.Linear(hidden_features, bottleneck_features),
            nn.LayerNorm(bottleneck_features),
            nn.SiLU(inplace=True),
            nn.Dropout(p=dropout_rate / 2),
            nn.Linear(bottleneck_features, num_classes),
        )

    def forward(self, x):
        features = self.backbone(x)
        return self.classifier(features)

    def freeze_backbone(self) -> None:
        for param in self.backbone.parameters():
            param.requires_grad = False
        trainable, total = count_trainable_parameters(self)
        print(f"Backbone frozen; training classifier head only ({trainable:,}/{total:,} params).")

    def unfreeze_backbone(self, unfreeze_blocks: int = 3) -> None:
        for param in self.backbone.parameters():
            param.requires_grad = False

        trainable_modules: list[nn.Module] = []
        if hasattr(self.backbone, "blocks"):
            trainable_modules.extend(list(self.backbone.blocks.children())[-unfreeze_blocks:])
            trainable_modules.extend(
                module
                for module_name in ("conv_head", "bn2", "norm", "head")
                if (module := getattr(self.backbone, module_name, None)) is not None
            )
        elif hasattr(self.backbone, "stages"):
            trainable_modules.extend(list(self.backbone.stages.children())[-unfreeze_blocks:])
            trainable_modules.extend(
                module
                for module_name in ("norm_pre", "head", "norm")
                if (module := getattr(self.backbone, module_name, None)) is not None
            )
        else:
            trainable_modules.extend(list(self.backbone.children())[-unfreeze_blocks:])

        for module in trainable_modules:
            for param in module.parameters():
                param.requires_grad = True

        trainable, total = count_trainable_parameters(self)
        print(f"Unfrozen final {unfreeze_blocks} blocks: {trainable:,}/{total:,} trainable params")


class TongueMultiLabelClassifier(nn.Module):
    """Advanced multi-head model for coat color, tongue color, texture, and thickness."""

    def __init__(
        self,
        pretrained: bool = True,
        dropout_rate: float = 0.3,
        model_name: str = DEFAULT_MODEL_NAME,
    ):
        super().__init__()
        self.model_name = model_name
        self.backbone_name = resolve_model_name(model_name)
        self.backbone = timm.create_model(
            self.backbone_name,
            pretrained=pretrained,
            num_classes=0,
            global_pool="avg",
        )
        feature_dim = infer_backbone_output_features(self.backbone, model_input_size(model_name))
        self.dropout = nn.Dropout(dropout_rate)
        self.coat_color_head = nn.Linear(feature_dim, 4)
        self.tongue_color_head = nn.Linear(feature_dim, 4)
        self.coat_texture_head = nn.Linear(feature_dim, 3)
        self.coat_thickness_head = nn.Linear(feature_dim, 2)

    def forward(self, x):
        features = self.dropout(self.backbone(x))
        return {
            "coat_color": self.coat_color_head(features),
            "tongue_color": self.tongue_color_head(features),
            "coat_texture": self.coat_texture_head(features),
            "coat_thickness": self.coat_thickness_head(features),
        }


def generate_tcm_recommendation(class_name: str, confidence: float) -> dict[str, object]:
    rec = RECOMMENDATIONS_DB.get(class_name, RECOMMENDATIONS_DB["normal"])
    return {
        "diagnosis_class": class_name,
        "confidence": round(confidence * 100, 1),
        "tcm_info": CLASS_TCM_INFO.get(class_name, {}),
        "summary": rec["summary"],
        "recommendations": {
            "food_suggestions": rec["food"],
            "foods_to_avoid": rec["avoid"],
            "lifestyle": rec["lifestyle"],
        },
        "warning": rec.get("warning"),
        "disclaimer": "本分析僅供個人健康參考，不具醫療診斷功能；身體不適請尋求專業醫療協助。",
    }


def export_to_onnx(model: nn.Module, output_path: str | Path = DEFAULT_ONNX_PATH) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.eval()
    image_size = int(getattr(model, "image_size", 224))
    dummy_input = torch.randn(1, 3, image_size, image_size)
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        opset_version=13,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )
    print(f"ONNX model exported: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect or export the tongue CNN architecture.")
    parser.add_argument("--num-classes", type=int, default=len(CLASSES))
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--dropout-rate", type=float, default=0.4)
    parser.add_argument("--no-pretrained", action="store_true")
    parser.add_argument("--export-onnx", type=Path)
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--list-models", action="store_true")
    args = parser.parse_args()

    if args.list_models:
        print(describe_model_candidates())
        return

    model = TongueCNNClassifier(
        num_classes=args.num_classes,
        pretrained=not args.no_pretrained,
        dropout_rate=args.dropout_rate,
        model_name=args.model_name,
    )
    if args.summary:
        if summary is None:
            raise SystemExit("torchinfo is not installed. Run: pip install -r ml/requirements.txt")
        summary(model, input_size=(1, 3, model.image_size, model.image_size), device="cpu")
    else:
        x = torch.randn(2, 3, model.image_size, model.image_size)
        print(f"Output shape: {tuple(model(x).shape)}")

    if args.export_onnx:
        export_to_onnx(model, args.export_onnx)


if __name__ == "__main__":
    main()
