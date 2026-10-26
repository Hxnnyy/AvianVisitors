"""Export trusted pinned networks; runtime never imports training frameworks."""

import hashlib
import json
from pathlib import Path
import numpy as np
import torch
import birder
import onnxruntime as ort
from PIL import Image
from torchvision.models.detection import ssdlite320_mobilenet_v3_large
from torchvision.transforms.functional import to_tensor

root = Path(__file__).parent
models = root / "models"
checksums = json.loads((root / "model-checksums.json").read_text())
for name in [
    "mobilenet_v4_l_eu-common.pt",
    "ssdlite320_mobilenet_v3_large_coco-a79551df.pth",
]:
    if hashlib.sha256((models / name).read_bytes()).hexdigest() != checksums[name]:
        raise RuntimeError("Source model checksum mismatch: " + name)
torch.set_num_threads(1)
torch.set_flush_denormal(True)
net, info = birder.load_pretrained_model(
    "mobilenet_v4_l_eu-common",
    dst=models / "mobilenet_v4_l_eu-common.pt",
    inference=True,
)
detector = ssdlite320_mobilenet_v3_large(weights=None, weights_backbone=None).eval()
detector.load_state_dict(
    torch.load(
        models / "ssdlite320_mobilenet_v3_large_coco-a79551df.pth",
        map_location="cpu",
        weights_only=True,
    )
)


class DetectorExport(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        result = self.model([image[0]])[0]
        return result["boxes"], result["labels"], result["scores"]


with torch.inference_mode():
    torch.onnx.export(
        net,
        torch.zeros(1, 3, 384, 384),
        str(models / "photo-classifier.onnx"),
        input_names=["image"],
        output_names=["logits"],
        opset_version=18,
        dynamo=False,
    )
    torch.onnx.export(
        DetectorExport(detector).eval(),
        torch.zeros(1, 3, 320, 320),
        str(models / "bird-detector.onnx"),
        input_names=["image"],
        output_names=["boxes", "labels", "scores"],
        opset_version=18,
        dynamo=False,
    )

options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
options.add_session_config_entry("session.set_denormal_as_zero", "1")
options.add_session_config_entry("session.intra_op.allow_spinning", "0")
classifier = ort.InferenceSession(
    str(models / "photo-classifier.onnx"), options, providers=["CPUExecutionProvider"]
)
presence = ort.InferenceSession(
    str(models / "bird-detector.onnx"), options, providers=["CPUExecutionProvider"]
)
transform = birder.classification_transform(
    birder.get_size_from_signature(info.signature), info.rgb_stats
)
image = Image.open(root / "tests/fixtures/robin.jpg").convert("RGB")
with torch.inference_mode():
    tensor = transform(image).unsqueeze(0)
    reference = net(tensor).softmax(1).numpy()
    logits = classifier.run(None, {"image": tensor.numpy()})[0]
    exp = np.exp(logits - logits.max(axis=1, keepdims=True))
    actual = exp / exp.sum(axis=1, keepdims=True)
    np.testing.assert_allclose(actual, reference, atol=1e-6, rtol=1e-5)
    detection_tensor = to_tensor(image.resize((320, 320)))
    reference_detection = detector([detection_tensor])[0]
    _, labels, scores = presence.run(
        None, {"image": detection_tensor.unsqueeze(0).numpy()}
    )
    bird = scores[labels == 16]
    expected = float(
        reference_detection["scores"][reference_detection["labels"] == 16].max()
    )
    assert abs(float(bird.max()) - expected) < 1e-6

metadata = {
    "size": [384, 384],
    "rgbStats": info.rgb_stats,
    "classToIndex": info.class_to_idx,
    "sourceChecksums": {
        name: checksums[name]
        for name in [
            "mobilenet_v4_l_eu-common.pt",
            "ssdlite320_mobilenet_v3_large_coco-a79551df.pth",
        ]
    },
    "onnxChecksums": {
        name: hashlib.sha256((models / name).read_bytes()).hexdigest()
        for name in ["photo-classifier.onnx", "bird-detector.onnx"]
    },
    "equivalence": {
        "robinProbabilityMaxAbsDifference": float(np.max(np.abs(actual - reference))),
        "birdPresenceAbsDifference": abs(float(bird.max()) - expected),
    },
}
(models / "photo-runtime.json").write_text(json.dumps(metadata, indent=2))
print(json.dumps(metadata["equivalence"]))
