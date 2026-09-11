"""Parse GGUF metadata from a (partial) GGUF file header.

Only the beginning of a GGUF file is needed: the key/value metadata block comes
before the tensor data, so a 1-2 MB range request is enough to inspect it.
"""

import struct
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else ".tmp-parakeet-head.gguf"

# GGUF value types
(T_UINT8, T_INT8, T_UINT16, T_INT16, T_UINT32, T_INT32, T_FLOAT32, T_BOOL,
 T_STRING, T_ARRAY, T_UINT64, T_INT64, T_FLOAT64) = range(13)

FMT = {
    T_UINT8: "<B", T_INT8: "<b", T_UINT16: "<H", T_INT16: "<h",
    T_UINT32: "<I", T_INT32: "<i", T_FLOAT32: "<f", T_BOOL: "<?",
    T_UINT64: "<Q", T_INT64: "<q", T_FLOAT64: "<d",
}


def read_string(buf, pos):
    (length,) = struct.unpack_from("<Q", buf, pos)
    pos += 8
    value = buf[pos:pos + length].decode("utf-8", "replace")
    return value, pos + length


def read_value(buf, pos, vtype):
    if vtype == T_STRING:
        return read_string(buf, pos)
    if vtype == T_ARRAY:
        (item_type,) = struct.unpack_from("<I", buf, pos)
        pos += 4
        (count,) = struct.unpack_from("<Q", buf, pos)
        pos += 8
        items = []
        for _ in range(count):
            item, pos = read_value(buf, pos, item_type)
            items.append(item)
        return items, pos
    fmt = FMT[vtype]
    value = struct.unpack_from(fmt, buf, pos)[0]
    return value, pos + struct.calcsize(fmt)


def main():
    with open(PATH, "rb") as handle:
        buf = handle.read()
    magic, version, n_tensors, n_kv = struct.unpack_from("<4sIQQ", buf, 0)
    print(f"magic={magic!r} version={version} tensors={n_tensors} kv={n_kv}")
    pos = 24
    interesting = ("general.", "stt.", "parakeet.", "tokenizer.ggml.model")
    for _ in range(n_kv):
        key, pos = read_string(buf, pos)
        (vtype,) = struct.unpack_from("<I", buf, pos)
        pos += 4
        value, pos = read_value(buf, pos, vtype)
        if key.startswith(interesting) or key in ("general.architecture", "general.name"):
            text = str(value)
            if len(text) > 200:
                text = text[:200] + f"… ({len(value)} items)"
            print(f"{key} = {text}")


if __name__ == "__main__":
    main()
