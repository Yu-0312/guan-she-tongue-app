# Tongue AI ML Backend

這個資料夾放「觀舌」舌象 CNN 的資料前處理、模型訓練、FastAPI 推論與 Supabase schema。大型資料、模型權重與訓練輸出已在 `.gitignore` 中排除。

## 各檔案說明

`01_data_preprocessing.py` 是資料前處理入口，實作在 `data_preprocessing.py`：

- 白平衡校正，降低不同光源對舌色判斷的干擾
- 可選自動裁切：`--crop-mode mediapipe` 會用 FaceMesh 嘴部 landmarks 裁切嘴/舌區；若未安裝 MediaPipe 或偵測不到臉，會退回 lower-face 裁切
- 基於 HSV 色彩空間做舌體粗分割
- 內建 8 大類別：`normal`、`white_coat`、`yellow_coat`、`red_tongue`、`pale_tongue`、`greasy_coat`、`thick_coat`、`thin_coat`
- 訓練資料增強：輕微旋轉、縮放、亮度、色相、雜訊、翻轉與模糊
- 建立 7:1.5:1.5 的訓練、驗證、測試 DataLoader

`02_model_architecture.py` 是模型架構入口，實作在 `model_architecture.py`：

- 預設 EfficientNet-B3 backbone，也可切換 `efficientnet_b0`、`mobilenetv3_large_100`、`convnext_tiny`
- 三層自訂分類頭，包含 LayerNorm、SiLU 與 Dropout；比 BatchNorm 更適合小 batch 或最後一批只有 1 張圖的情境
- 多標籤進階模型範例，可分別輸出苔色、舌色、苔質與厚薄
- `export_to_onnx()` 可匯出 ONNX，供 iOS/Android 本地推論
- `generate_tcm_recommendation()` 產生食補、忌口與生活建議

`03_training_loop.py` 是兩階段訓練入口，實作在 `training_loop.py`：

- Phase 1：凍結 backbone，使用較高 learning rate 訓練分類頭
- Phase 2：解凍最後 3 個 block，使用低 learning rate 微調
- TensorBoard 即時監控
- 混淆矩陣、classification report、各類別 F1-score
- 預設以 validation macro F1 儲存最佳模型，避免類別不平衡時只看 accuracy
- CUDA 環境自動啟用 AMP mixed precision；DataLoader 支援 resize、pin memory、persistent workers
- 自動儲存最佳模型到 `ml/models/tongue_best.pth`

`06_model_search.py` 會用同一份資料依序訓練多個 CNN backbone，輸出 leaderboard：

- 預設比較 `efficientnet_b0`、`mobilenetv3_large_100`、`efficientnet_b3`、`convnext_tiny`
- 每個候選模型有獨立 checkpoint、TensorBoard log、confusion matrix 與 metrics
- 輸出 `ml/outputs/model_search/leaderboard.json` 與 `leaderboard.csv`
- 推論 API 會從 checkpoint 讀取 `model_name`，因此最佳模型換掉後不需要手動改 API 架構

`05_keras_mobilenet_training.py` 是可選的 TensorFlow/Keras 遷移學習範本：

- 預設使用 `MobileNetV3Small`，也可切換 `MobileNetV2` 或 `EfficientNetB0`
- 使用 ImageNet 預訓練權重，先凍結 backbone 訓練分類頭，再解凍最後幾層 fine-tuning
- 內建 Keras augmentation：水平翻轉、輕微旋轉、縮放與對比調整
- 輸出 `.keras` 模型與 `labels.json`

`04_inference_api.py` 是 FastAPI 入口，實作在 `inference_api.py`：

- `POST /analyze` 上傳舌象影像，回傳分類、信心度、全部機率與中醫建議 JSON
- 可整合 Supabase 儲存分析紀錄與影像
- 支援 `user_id` 與 `constitution_type` 串接前端體質問卷結果
- `GET /health` 與 `GET /classes` 方便部署檢查

`supabase_schema.sql`：

- 建立 `user_profiles`、`constitution_results`、`tongue_records`、`health_trends`
- 啟用 Row Level Security
- 建立常用索引與 `updated_at` 觸發器
- 建立 `tongue-images` Storage bucket

## 建議開發順序

1. 安裝 Python 依賴：

```bash
.venv/bin/python -m pip install -r ml/requirements.txt
```

2. 在 Supabase SQL Editor 執行：

```text
ml/supabase_schema.sql
```

3. 複製環境變數範例並填入金鑰：

```bash
cp ml/.env.example ml/.env
```

4. 蒐集舌象資料，放入 `ml/data/raw/tongue_diagnosis/` 各類別資料夾：

```text
ml/data/raw/tongue_diagnosis/
├── normal/
├── white_coat/
├── yellow_coat/
├── red_tongue/
├── pale_tongue/
├── greasy_coat/
├── thick_coat/
└── thin_coat/
```

5. 執行資料前處理：

```bash
.venv/bin/python ml/01_data_preprocessing.py --force
```

若原始照片包含臉部、浴室或房間背景，建議改用嘴部裁切：

```bash
.venv/bin/python ml/01_data_preprocessing.py --crop-mode mediapipe --force
```

6. 執行兩階段訓練：

```bash
.venv/bin/python ml/03_training_loop.py
```

也可以指定 backbone：

```bash
.venv/bin/python ml/03_training_loop.py \
  --model-name efficientnet_b0 \
  --phase1-epochs 10 \
  --phase2-epochs 25
```

目前這份 workspace 只有 segmentation 資料與 `tongue_segmenter.pt`，尚未看到分類資料夾 `ml/data/processed/tongue_diagnosis/`，所以不能直接宣稱某個分類模型已在本機資料上勝出。準備好分類資料後，用下面指令產生真正的 CNN 排行榜：

```bash
.venv/bin/python ml/06_model_search.py \
  --data-dir ml/data/processed/tongue_diagnosis \
  --phase1-epochs 6 \
  --phase2-epochs 8
```

選型建議：

- 手機或瀏覽器端推論優先：先看 `mobilenetv3_large_100`
- 雲端推論且希望速度/準確率平衡：先看 `efficientnet_b0`
- 雲端推論且資料量足夠：把 `efficientnet_b3` 納入候選，通常上限較高
- 想確認 EfficientNet 之外的現代 CNN baseline：納入 `convnext_tiny`

7. 可選：使用 TensorFlow/Keras 的 MobileNetV3Small 訓練：

```bash
.venv/bin/python -m pip install -r ml/requirements-keras.txt
.venv/bin/python ml/05_keras_mobilenet_training.py \
  --data-dir ml/data/processed/tongue_diagnosis \
  --backbone mobilenetv3small \
  --epochs 20 \
  --fine-tune-epochs 10
```

若要更小的模型可用 `--backbone mobilenetv2`；若雲端 API 優先、可接受稍大模型，可用 `--backbone efficientnetb0`。

8. 啟動 FastAPI：

```bash
.venv/bin/python -m uvicorn ml.inference_api:app --host 0.0.0.0 --port 8000 --reload
```

## TensorBoard

```bash
.venv/bin/python -m tensorboard --logdir ml/runs
```

## ONNX 匯出

```bash
.venv/bin/python ml/02_model_architecture.py --no-pretrained --export-onnx ml/models/tongue_model.onnx
```

實務上通常會先載入訓練完成的 `.pth` 權重，再呼叫 `export_to_onnx()` 匯出正式模型。

## 既有公開資料工具

這個 repo 原本也保留了公開資料集下載與簡易 CNN 腳本，可作為資料探索或 baseline：

```bash
.venv/bin/python ml/download_sources.py --sources tid
.venv/bin/python ml/prepare_segmentation_dataset.py --force
.venv/bin/python ml/train_cnn.py --task segmentation --epochs 20 --batch-size 8
```

Kaggle 或 Roboflow 資料下載後，可整理成 `ImageFolder` baseline：

```bash
.venv/bin/python ml/prepare_classifier_dataset.py --source-dir ml/data/raw --force
.venv/bin/python ml/train_cnn.py --task classification --epochs 30 --batch-size 16
```

注意：公開資料的授權、標註品質與類別定義不一致，正式訓練前建議人工抽查每類影像。
