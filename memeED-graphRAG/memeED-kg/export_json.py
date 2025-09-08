# export_json.py — Parquet -> JSON for memeED
import os, json
import pandas as pd
import numpy as np

OUT_DIR = "../../memeED-backend/graphrag_export"
os.makedirs(OUT_DIR, exist_ok=True)

def to_records(df, keep_cols):
    cols = [c for c in keep_cols if c in df.columns]
    slim = df[cols].copy()
    for c in slim.columns:
        slim[c] = slim[c].apply(lambda v: v.tolist() if isinstance(v, np.ndarray) else v)
    return slim.to_dict(orient="records")

# Load GraphRAG outputs (produced by `graphrag run`)
comms = pd.read_parquet("output/communities.parquet")
ents  = pd.read_parquet("output/entities.parquet")
rels  = pd.read_parquet("output/relationships.parquet")

COMM_COLS = ["id", "title", "summary", "keywords", "size"]
ENT_COLS  = ["id", "title", "type", "description", "community"]
REL_COLS  = ["source", "target", "type", "weight"]

communities = to_records(comms, COMM_COLS)
nodes       = to_records(ents,  ENT_COLS)
edges       = to_records(rels,  REL_COLS)

with open(os.path.join(OUT_DIR, "communities.json"), "w") as f:
    json.dump({"communities": communities}, f, indent=2)

with open(os.path.join(OUT_DIR, "graph.json"), "w") as f:
    json.dump({"nodes": nodes, "edges": edges}, f, indent=2)

print(f"Exported to {OUT_DIR}")
