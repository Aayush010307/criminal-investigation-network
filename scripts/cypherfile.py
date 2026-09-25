"""Helpers shared by the Python scripts: .env loading and '// @name' block parsing."""
import json, os, re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

def load_env():
    """Read ROOT/.env (KEY=VALUE lines) into os.environ without overriding real env vars."""
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    return (os.environ.get("NEO4J_URI", "neo4j://localhost:7687"),
            os.environ.get("NEO4J_USER", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", "password"),
            os.environ.get("NEO4J_DATABASE", "neo4j"))

def parse(path):
    """Return an ordered list of {name, title, params, file, cypher} from a .cypher file."""
    text = open(os.path.join(ROOT, path), encoding="utf-8").read()
    out = []
    for block in re.split(r"(?m)^// @name ", text)[1:]:
        lines = block.split("\n")
        item = {"name": lines[0].strip(), "title": "", "params": {}, "file": None}
        body = []
        for ln in lines[1:]:
            m = re.match(r"// @(\w+) (.*)$", ln)
            if m and not body:
                key, val = m.groups()
                item[key] = json.loads(val) if key == "params" else val.strip()
            elif ln.startswith("// ---") or ln.startswith("// ===="):
                break
            else:
                body.append(ln)
        # drop trailing comments / blank lines, keep inline comments inside the statement
        cy = "\n".join(body).strip()
        cy = re.sub(r"(?m)^\s*//.*$\n?", "", cy).strip()
        item["cypher"] = cy.rstrip(";").strip()
        out.append(item)
    return out

def statements(path):
    """Split a plain .cypher file (no @name markers) into individual statements."""
    text = open(os.path.join(ROOT, path), encoding="utf-8").read()
    text = re.sub(r"(?m)^\s*//.*$", "", text)
    return [s.strip() for s in text.split(";") if s.strip()]
