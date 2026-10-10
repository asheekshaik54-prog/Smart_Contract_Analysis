"""Tiny two-pass test assembler: 'PUSH1 0x00', labels 'name:', refs 'PUSH2 @name'."""
from app.analysis.opcode_metadata import BY_NAME


def asm(src: str) -> bytes:
    toks = []
    for line in src.replace(";", "\n").splitlines():
        line = line.split("#")[0].strip()
        if line:
            toks.extend(line.split())
    items, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t.endswith(":"):
            items.append(("label", t[:-1]))
        else:
            info = BY_NAME[t]
            if info.imm:
                i += 1
                items.append(("push", info, toks[i]))
            else:
                items.append(("op", info))
        i += 1
    labels, pc = {}, 0
    for it in items:
        if it[0] == "label":
            labels[it[1]] = pc
        elif it[0] == "push":
            pc += 1 + it[1].imm
        else:
            pc += 1
    out = bytearray()
    for it in items:
        if it[0] == "op":
            out.append(it[1].code)
        elif it[0] == "push":
            v = labels[it[2][1:]] if it[2].startswith("@") else int(it[2], 0)
            out.append(it[1].code)
            out += v.to_bytes(it[1].imm, "big")
    return bytes(out)
