import json
from pathlib import Path

root = Path(__file__).parent
meta = json.loads((root / "models/photo-runtime.json").read_text())
(root / "photo-labels.json").write_text(json.dumps(meta["classToIndex"], indent=2))
