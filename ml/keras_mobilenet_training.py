from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "ml" / "data" / "processed" / "tongue_diagnosis"
DEFAULT_MODEL_DIR = ROOT / "ml" / "models" / "keras"
DEFAULT_RUN_DIR = ROOT / "ml" / "runs" / "keras_tongue"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transfer-learning tongue classifier with TensorFlow/Keras."
    )
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument(
        "--backbone",
        choices=["mobilenetv2", "mobilenetv3small", "efficientnetb0"],
        default="mobilenetv3small",
    )
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--fine-tune-epochs", type=int, default=10)
    parser.add_argument("--unfreeze-last", type=int, default=30)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--fine-tune-learning-rate", type=float, default=1e-5)
    parser.add_argument("--val-split", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    tf = import_tensorflow()
    train_ds, val_ds, class_names = load_image_datasets(tf, args)
    model = build_tongue_diagnosis_model(
        tf,
        num_classes=len(class_names),
        backbone_name=args.backbone,
        image_size=args.image_size,
        learning_rate=args.learning_rate,
    )

    args.model_dir.mkdir(parents=True, exist_ok=True)
    args.run_dir.mkdir(parents=True, exist_ok=True)
    labels_path = args.model_dir / "labels.json"
    labels_path.write_text(
        json.dumps({"classes": class_names}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    checkpoint_path = args.model_dir / f"tongue_{args.backbone}.keras"
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            checkpoint_path,
            monitor="val_accuracy",
            save_best_only=True,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=6,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-7,
        ),
        tf.keras.callbacks.CSVLogger(args.run_dir / "training_log.csv"),
    ]

    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
    )

    if args.fine_tune_epochs > 0:
        fine_tune_model(
            tf,
            model,
            backbone_name=args.backbone,
            unfreeze_last=args.unfreeze_last,
            learning_rate=args.fine_tune_learning_rate,
        )
        model.fit(
            train_ds,
            validation_data=val_ds,
            epochs=args.epochs + args.fine_tune_epochs,
            initial_epoch=args.epochs,
            callbacks=callbacks,
        )

    model.save(checkpoint_path)
    print(f"Saved Keras model: {checkpoint_path}")
    print(f"Saved labels: {labels_path}")


def build_tongue_diagnosis_model(
    tf,
    *,
    num_classes: int,
    backbone_name: str = "mobilenetv3small",
    image_size: int = 224,
    learning_rate: float = 1e-3,
):
    """Build a lightweight transfer-learning CNN for tongue image classification."""
    inputs = tf.keras.Input(shape=(image_size, image_size, 3), name="image")
    x = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.04),
            tf.keras.layers.RandomZoom(0.08),
            tf.keras.layers.RandomContrast(0.15),
        ],
        name="capture_augmentation",
    )(inputs)

    base_model, preprocess = make_backbone(tf, backbone_name, image_size)
    x = preprocess(x)
    x = base_model(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.15)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax", name="class_probs")(x)

    model = tf.keras.Model(inputs, outputs, name=f"tongue_{backbone_name}")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def make_backbone(tf, backbone_name: str, image_size: int):
    input_shape = (image_size, image_size, 3)

    if backbone_name == "mobilenetv2":
        base_model = tf.keras.applications.MobileNetV2(
            input_shape=input_shape,
            include_top=False,
            weights="imagenet",
        )
        preprocess = tf.keras.layers.Lambda(
            tf.keras.applications.mobilenet_v2.preprocess_input,
            name="mobilenetv2_preprocess",
        )
    elif backbone_name == "efficientnetb0":
        base_model = tf.keras.applications.EfficientNetB0(
            input_shape=input_shape,
            include_top=False,
            weights="imagenet",
        )
        preprocess = tf.keras.layers.Rescaling(1.0, name="efficientnet_identity")
    else:
        base_model = tf.keras.applications.MobileNetV3Small(
            input_shape=input_shape,
            include_top=False,
            weights="imagenet",
            include_preprocessing=True,
        )
        preprocess = tf.keras.layers.Rescaling(1.0, name="mobilenetv3_identity")

    base_model.trainable = False
    return base_model, preprocess


def fine_tune_model(
    tf,
    model,
    *,
    backbone_name: str,
    unfreeze_last: int,
    learning_rate: float,
) -> None:
    base_model = next(
        layer
        for layer in model.layers
        if backbone_name in layer.name.lower() or "efficientnet" in layer.name.lower()
    )
    base_model.trainable = True
    if unfreeze_last > 0:
        for layer in base_model.layers[:-unfreeze_last]:
            layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    trainable = sum(1 for layer in base_model.layers if layer.trainable)
    print(f"Fine-tuning {trainable} layers in {base_model.name}")


def load_image_datasets(tf, args) -> tuple[object, object, list[str]]:
    data_dir = args.data_dir
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if train_dir.exists() and val_dir.exists():
        train_ds = tf.keras.utils.image_dataset_from_directory(
            train_dir,
            label_mode="categorical",
            image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size,
            shuffle=True,
            seed=args.seed,
        )
        val_ds = tf.keras.utils.image_dataset_from_directory(
            val_dir,
            label_mode="categorical",
            image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size,
            shuffle=False,
        )
        class_names = train_ds.class_names
    else:
        train_ds = tf.keras.utils.image_dataset_from_directory(
            data_dir,
            label_mode="categorical",
            image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size,
            validation_split=args.val_split,
            subset="training",
            shuffle=True,
            seed=args.seed,
        )
        val_ds = tf.keras.utils.image_dataset_from_directory(
            data_dir,
            label_mode="categorical",
            image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size,
            validation_split=args.val_split,
            subset="validation",
            shuffle=False,
            seed=args.seed,
        )
        class_names = train_ds.class_names

    autotune = tf.data.AUTOTUNE
    return train_ds.prefetch(autotune), val_ds.prefetch(autotune), list(class_names)


def import_tensorflow():
    try:
        import tensorflow as tf

        return tf
    except ImportError as exc:
        raise SystemExit(
            "TensorFlow is not installed. For the optional Keras pipeline run:\n"
            "  .venv/bin/python -m pip install -r ml/requirements-keras.txt"
        ) from exc


if __name__ == "__main__":
    main()
