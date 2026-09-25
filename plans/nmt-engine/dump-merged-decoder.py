"""Minimal ONNX protobuf reader: dumps both branches of the merged decoder's
`If` node, so we can see which branch uses the cache and what the failing
`encoder_attn/Reshape_4` node actually consumes.

No `onnx` package needed: ONNX is plain protobuf, and we only need a handful of
fields.
"""

import os
import sys

PATH = os.path.join(
    os.environ["LOCALAPPDATA"],
    "ShiorikoTransNmtTest",
    "nllb-200-distilled-600M",
    "decoder_model_merged_quantized.onnx",
)


def read_varint(data, pos):
    result = 0
    shift = 0
    while True:
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7


def fields(data):
    """Yields (field_number, wire_type, payload) for a protobuf message."""
    pos = 0
    end = len(data)
    while pos < end:
        key, pos = read_varint(data, pos)
        field, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = read_varint(data, pos)
            yield field, wire, value
        elif wire == 2:
            length, pos = read_varint(data, pos)
            yield field, wire, data[pos : pos + length]
            pos += length
        elif wire == 5:
            yield field, wire, data[pos : pos + 4]
            pos += 4
        elif wire == 1:
            yield field, wire, data[pos : pos + 8]
            pos += 8
        else:
            raise ValueError(f"unsupported wire type {wire}")


def strings(data, wanted):
    return [payload.decode("utf-8", "replace") for field, wire, payload in fields(data) if field == wanted and wire == 2]


def graph(data):
    """Parse a GraphProto into (nodes, inputs, outputs)."""
    nodes = []
    inputs = []
    outputs = []
    for field, wire, payload in fields(data):
        if field == 1 and wire == 2:
            name = ""
            op = ""
            node_inputs = []
            node_outputs = []
            for f2, w2, p2 in fields(payload):
                if f2 == 1 and w2 == 2:
                    node_inputs.append(p2.decode("utf-8", "replace"))
                elif f2 == 2 and w2 == 2:
                    node_outputs.append(p2.decode("utf-8", "replace"))
                elif f2 == 3 and w2 == 2:
                    name = p2.decode("utf-8", "replace")
                elif f2 == 4 and w2 == 2:
                    op = p2.decode("utf-8", "replace")
            nodes.append((name, op, node_inputs, node_outputs))
        elif field == 11 and wire == 2:
            inputs.append(strings(payload, 1)[0])
        elif field == 12 and wire == 2:
            outputs.append(strings(payload, 1)[0])
    return nodes, inputs, outputs


with open(PATH, "rb") as handle:
    model = handle.read()

model_graph = None
for field, wire, payload in fields(model):
    if field == 7 and wire == 2:
        model_graph = payload
        break

nodes, inputs, outputs = graph(model_graph)
print(f"top-level graph: {len(nodes)} nodes")
print("inputs:", len(inputs))

for name, op, node_inputs, node_outputs in nodes:
    if op != "If":
        continue
    print(f"\nIf node: {name!r} cond={node_inputs}")
    for f2, w2, p2 in fields(next(p for n, o, i, oo in nodes if o == "If" and n == name and False) if False else b""):
        pass
    break

# Re-walk to get the If node's raw attributes (need the payload, not the summary).
if_node = None
for field, wire, payload in fields(model_graph):
    if field != 1 or wire != 2:
        continue
    if "If" in strings(payload, 4):
        if_node = payload
        break

if if_node is None:
    print("no If node found")
    sys.exit(0)

for f2, w2, p2 in fields(if_node):
    if f2 != 5 or w2 != 2:
        continue
    attr_name = strings(p2, 1)[0] if strings(p2, 1) else ""
    if attr_name not in ("then_branch", "else_branch"):
        continue
    for f3, w3, p3 in fields(p2):
        if f3 == 6 and w3 == 2:
            sub_nodes, sub_inputs, sub_outputs = graph(p3)
            print(f"\n=== {attr_name}: {len(sub_nodes)} nodes, {len(sub_inputs)} captured inputs")
            interesting = [n for n in sub_inputs if "past" in n or n in ("encoder_hidden_states", "encoder_attention_mask", "input_ids")]
            print("  captured:", ", ".join(sorted(interesting)))
            for name, op, ins, outs in sub_nodes:
                if "Reshape_4" in name and "encoder_attn" in name:
                    print(f"  FOUND {name!r} op={op}")
                    print("    inputs :", ins)
                    print("    outputs:", outs)
            # Which reshape targets are built in this branch?
            reshapes = [n for n in sub_nodes if n[1] == "Reshape"]
            print(f"  reshape nodes: {len(reshapes)}")
