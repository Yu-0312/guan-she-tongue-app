from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

import albumentations as A
import cv2
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

try:
    from .data_preprocessing import correct_white_balance, segment_tongue
    from .model_architecture import DEFAULT_MODEL_NAME, TongueCNNClassifier, generate_tcm_recommendation
    from .tongue_labels import CLASS_TCM_INFO, IDX_TO_CLASS
except ImportError:  # Allows `python ml/inference_api.py`.
    from data_preprocessing import correct_white_balance, segment_tongue
    from model_architecture import DEFAULT_MODEL_NAME, TongueCNNClassifier, generate_tcm_recommendation
    from tongue_labels import CLASS_TCM_INFO, IDX_TO_CLASS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_PATH = ROOT / "ml" / "models" / "tongue_best.pth"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "ml" / ".env")


def parse_origins(value: str) -> list[str]:
    origins = [item.strip() for item in value.split(",") if item.strip()]
    return origins or ["*"]


def resolve_path(path: str | Path) -> Path:
    path = Path(path)
    return path if path.is_absolute() else ROOT / path


def torch_load(path: Path, device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisResult(BaseModel):
    record_id: Optional[str] = None
    diagnosis_class: str
    confidence: float
    all_probabilities: dict[str, float]
    tcm_analysis: dict
    analyzed_at: str


class ModelManager:
    def __init__(self):
        self.device = self.pick_device()
        self.model: TongueCNNClassifier | None = None
        self.model_name = os.getenv("MODEL_NAME", DEFAULT_MODEL_NAME)
        self.image_size = int(os.getenv("IMAGE_SIZE", "224"))
        self.transform = A.Compose(
            [
                A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
                ToTensorV2(),
            ]
        )

    @staticmethod
    def pick_device() -> torch.device:
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def load(self, model_path: str | Path = DEFAULT_MODEL_PATH) -> None:
        model_path = resolve_path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(model_path)

        num_classes = int(os.getenv("NUM_CLASSES", len(IDX_TO_CLASS)))
        checkpoint = torch_load(model_path, self.device)
        checkpoint_config = checkpoint.get("config", {})
        self.model_name = str(
            os.getenv("MODEL_NAME")
            or checkpoint.get("model_name")
            or checkpoint_config.get("model_name")
            or DEFAULT_MODEL_NAME
        )
        self.image_size = int(
            os.getenv("IMAGE_SIZE")
            or checkpoint.get("image_size")
            or checkpoint_config.get("image_size")
            or self.image_size
        )
        self.model = TongueCNNClassifier(
            num_classes=num_classes,
            pretrained=False,
            model_name=self.model_name,
        )
        state_dict = checkpoint.get("model_state_dict") or checkpoint.get("model_state")
        if state_dict is None:
            raise ValueError(f"Checkpoint does not include a model state dict: {model_path}")

        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()
        print(f"Model loaded: {model_path} ({self.model_name}, image_size={self.image_size})")

    @torch.no_grad()
    def predict(self, image_np: np.ndarray) -> tuple[str, float, dict[str, float]]:
        if self.model is None:
            raise RuntimeError("Model is not loaded")

        image = correct_white_balance(image_np)
        image = segment_tongue(image)
        image = cv2.resize(image, (self.image_size, self.image_size), interpolation=cv2.INTER_AREA)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        tensor = self.transform(image=image_rgb)["image"].unsqueeze(0).to(self.device)
        outputs = self.model(tensor)
        probs = torch.softmax(outputs, dim=1)[0]
        top_idx = int(probs.argmax().item())
        confidence = float(probs[top_idx].item())
        class_name = IDX_TO_CLASS[top_idx]
        all_probs = {IDX_TO_CLASS[index]: round(float(probs[index].item()) * 100, 1) for index in range(len(probs))}
        return class_name, confidence, all_probs


model_manager = ModelManager()
app = FastAPI(
    title="舌診 AI 分析 API",
    description="基於 EfficientNet-B3 的中醫舌象分析後端",
    version="1.0.0",
)

allowed_origins = parse_origins(os.getenv("ALLOWED_ORIGINS", "*"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    model_path = os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH))
    try:
        model_manager.load(model_path)
    except FileNotFoundError:
        print(f"Model file does not exist yet: {resolve_path(model_path)}")


def get_optional_supabase() -> Client | None:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


def get_required_supabase() -> Client:
    client = get_optional_supabase()
    if client is None:
        raise HTTPException(status_code=500, detail="Supabase settings are missing")
    return client


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_tongue(
    file: UploadFile = File(...),
    user_id: Optional[str] = None,
    constitution_type: Optional[str] = None,
    supabase: Client | None = Depends(get_optional_supabase),
):
    if file.content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP images are supported")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large; max size is 10MB")

    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    if model_manager.model is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet")

    start_time = time.time()
    class_name, confidence, all_probs = model_manager.predict(image)
    inference_time = round(time.time() - start_time, 3)

    recommendation = generate_tcm_recommendation(class_name, confidence)
    if constitution_type:
        recommendation["constitution_note"] = f"已納入體質結果「{constitution_type}」作為生活建議參考。"

    record_id = None
    if user_id and supabase is not None:
        try:
            image_url = upload_image_to_storage(supabase, contents, user_id, file.content_type or "image/jpeg")
            result = (
                supabase.table("tongue_records")
                .insert(
                    {
                        "user_id": user_id,
                        "image_url": image_url,
                        "diagnosis_class": class_name,
                        "confidence": round(confidence * 100, 1),
                        "all_probabilities": all_probs,
                        "tcm_syndrome": CLASS_TCM_INFO.get(class_name, {}).get("syndrome"),
                        "constitution_type": constitution_type,
                        "ai_analysis_json": recommendation,
                        "inference_time_sec": inference_time,
                        "device_type": "web",
                        "created_at": utc_now(),
                    }
                )
                .execute()
            )
            record_id = result.data[0]["id"] if result.data else None
        except Exception as exc:
            print(f"Supabase save failed; returning analysis only: {exc}")

    return AnalysisResult(
        record_id=record_id,
        diagnosis_class=class_name,
        confidence=round(confidence * 100, 1),
        all_probabilities=all_probs,
        tcm_analysis=recommendation,
        analyzed_at=utc_now(),
    )


def upload_image_to_storage(supabase: Client, file_bytes: bytes, user_id: str, content_type: str) -> str:
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    filename = f"{user_id}/{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid4().hex}.{ext}"
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "tongue-images")
    supabase.storage.from_(bucket).upload(
        path=filename,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    return supabase.storage.from_(bucket).get_public_url(filename)


@app.get("/history/{user_id}")
async def get_user_history(
    user_id: str,
    limit: int = 30,
    supabase: Client = Depends(get_required_supabase),
):
    result = (
        supabase.table("tongue_records")
        .select("id, diagnosis_class, confidence, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"user_id": user_id, "records": result.data}


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model_loaded": model_manager.model is not None,
        "model_name": model_manager.model_name,
        "image_size": model_manager.image_size,
        "device": str(model_manager.device),
    }


@app.get("/classes")
async def list_classes():
    return {
        "num_classes": len(IDX_TO_CLASS),
        "classes": {name: CLASS_TCM_INFO.get(name, {}) for name in IDX_TO_CLASS.values()},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "inference_api:app",
        app_dir=str(Path(__file__).parent),
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        reload=True,
    )
