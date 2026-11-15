"""Package the HTML site using Python's standard library. No installs or network."""

from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path
import shutil
import sys
import tempfile

PROJECT = Path(__file__).resolve().parents[2]
SOURCE = PROJECT / "src"
FILES = {
    "q1-tree-planting": "q1_tree_planting",
    "q2-created-marshes": "q2_created_marshes",
    "q3-grassland-gaps": "q3_grassland_gaps",
}
DIRECTIONS = {
    "increase": "Increase",
    "decrease": "Decrease",
    "mixed": "Mixed",
    "no_effect": "No effect detected",
    "unclear": "Unclear direction",
    "below_reference": "Below reference",
    "above_reference": "Above reference",
    "comparable": "Comparable",
}
ENHANCED = "The source sentence says fertilization strengthened scarification’s positive effect on seedling growth. The graph therefore shows an increase, while the table’s baseline rule labels moderation claims as unclear."


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def paper_authors(path: Path):
    """Read author metadata from the pack's trailing source_documents section.

    This reads the pack's block-style scalar/list serialization, not general YAML.
    Reading backwards avoids loading the large claim graph for a small index.
    """
    marker = b"\nsource_documents:\n"
    with path.open("rb") as source:
        source.seek(0, 2)
        position, tail = source.tell(), b""
        while position and marker not in tail:
            size = min(position, 65536)
            position -= size
            source.seek(position)
            tail = source.read(size) + tail
    if marker not in tail:
        raise ValueError("Missing source_documents in the supplied graph")

    def scalar(value):
        value = value.strip()
        if value.startswith('"'):
            return json.loads(value)
        if value.startswith("'"):
            if not value.endswith("'"):
                raise ValueError("Unsupported multiline quoted paper metadata")
            return value[1:-1].replace("''", "'")
        if value in {"null", "~", ""}:
            return ""
        return value

    records, current, in_authors = {}, None, False
    for line in tail.split(marker, 1)[1].decode("utf-8").splitlines():
        if line.startswith("- document_id: "):
            current = scalar(line[len("- document_id: ") :])
            records[current] = []
            in_authors = False
        elif line == "  authors:":
            if current is None:
                raise ValueError("Authors without a source document")
            in_authors = True
        elif in_authors and line.startswith("  - "):
            records[current].append(scalar(line[4:]))
        elif in_authors and line.startswith("    ") and records[current]:
            records[current][-1] += " " + line.strip()
        elif line.strip():
            in_authors = False
    return records


def validate(answer, summary):
    findings = answer["findings"] + answer.get("with_time", [])
    valid = {
        "finding_ids": {f["id"] for f in findings},
        "gap_ids": {g["id"] for g in answer["gaps"]},
        "interaction_ids": {i["edge_id"] for i in answer.get("interactions", [])},
    }
    if summary["text"] != " ".join(s["text"] for s in summary["sentences"]):
        raise ValueError(f"Summary text and sentences disagree: {answer['id']}")
    for sentence in summary["sentences"]:
        for key, known in valid.items():
            if not set(sentence.get(key, [])).issubset(known):
                raise ValueError(f"Unknown summary evidence reference: {answer['id']}")
    for finding in findings:
        claims = [answer["evidence"][i] for i in finding["edge_ids"]]
        if len({c["document_id"] for c in claims}) != finding["studies"]:
            raise ValueError(f"Study count mismatch: {finding['id']}")
    if "summary" in answer:
        coverage = answer["summary"]
        assert coverage["filled"] == len(answer["findings"])
        assert coverage["empty"] == len(answer["gaps"])
        assert coverage["cells"] == coverage["filled"] + coverage["empty"]


def grade(finding):
    return f"{DIRECTIONS[finding['direction']]}, {finding['certainty'].replace('_', ' ')} certainty, {finding['studies']} {'study' if finding['studies'] == 1 else 'studies'}"


def limitations(answer):
    for text in answer["limitations"]:
        coverage = answer.get("summary")
        if coverage and "claims fall outside the groups" in text:
            text = f"{coverage['grassland_claims'] - coverage['claims_pooled']} of the {coverage['grassland_claims']} grassland claims are not shown because they did not fit the map’s predefined intervention or outcome categories."
        elif coverage and text.startswith("An empty cell means"):
            text = "An empty cell means no matching evidence was found in the claims mapped here; it does not mean the practice is ineffective or that no relevant research exists elsewhere."
        yield text


def fallback(questions, bundles):
    esc = html.escape
    sections = []
    for question in questions:
        answer, summary = bundles[question["id"]]
        rows = []
        for finding in answer["findings"]:
            rows.append(
                f"<li><strong>{esc(finding['subject']['label'])} → {esc(finding['outcome']['label'])}</strong>: {esc(grade(finding))}</li>"
            )
        trends = ""
        if answer.get("with_time"):
            trends = (
                "<h3>Changes with marsh age</h3><ul>"
                + "".join(
                    f"<li>{esc(f['outcome']['label'])}: {esc(grade(f))}</li>"
                    for f in answer["with_time"]
                )
                + "</ul>"
            )
        gaps = {}
        for gap in answer["gaps"]:
            gaps.setdefault(gap["subject"]["label"], []).append(gap["outcome"]["label"])
        gap_html = (
            "<h3>No mapped evidence</h3><p>These are gaps in the mapped evidence, not proof of no effect or of no research elsewhere.</p><ul>"
            + "".join(
                f"<li><strong>{esc(subject)}</strong>: {esc(', '.join(outcomes))}</li>"
                for subject, outcomes in gaps.items()
            )
            + "</ul>"
            if gaps
            else ""
        )
        interactions = ""
        if answer.get("interactions"):
            entries = []
            for item in answer["interactions"]:
                claim = answer["evidence"][item["edge_id"]]
                note = (
                    f" <em>{esc(ENHANCED)}</em>"
                    if item["edge_id"] in {"camo:edge_3fb326f2a6c3", "camo:edge_ee5aa30bcc2d"}
                    else ""
                )
                entries.append(
                    f"<li>{esc(claim['subject'])} → {esc(claim['object'])}: {esc(DIRECTIONS[item['direction']])}.{note}</li>"
                )
            interactions = "<h3>Combined treatments</h3><ul>" + "".join(entries) + "</ul>"
        graph_html = ""
        if question["id"] == "q1-tree-planting":
            graph = read(PROJECT / "answers/q1_tree_planting_graph.json")
            labels = {n["id"]: n["label"] for n in graph["nodes"]}
            shown = {f"{f['subject']['id']}->{f['outcome']['id']}" for f in answer["findings"]}
            extra = []
            for edge in graph["edges"]:
                if f"{edge['source']}->{edge['target']}" in shown:
                    continue
                if edge["kind"] == "moderation":
                    left, right = edge["target_edge"].split("->")
                    text = f"{labels[edge['source']]} changes the effect of {labels[left]} on {labels[right]}"
                else:
                    text = f"{labels[edge['source']]} → {labels[edge['target']]}"
                extra.append(f"<li>{esc(text)}: {esc(grade(edge))}</li>")
            graph_html = (
                "<h3>How the practices connect</h3><p>Each link is its own body of evidence. A path through a condition is not one tested effect.</p><ul>"
                + "".join(extra)
                + "</ul>"
            )
        headline = (
            f"<p>{esc(answer['short_answer']['time_to_reference_note'])}</p>"
            if answer.get("short_answer")
            else ""
        )
        sections.append(
            f"<section id=\"{question['id']}\"><h2>{esc(question['title'])}</h2><p>{esc(question['question'])}</p>{headline}<p>{esc(summary['text'])}</p><h3>Findings</h3><ul>{''.join(rows)}</ul>{trends}{gap_html}{interactions}{graph_html}<h3>Limitations</h3><ul>{''.join(f'<li>{esc(text)}</li>' for text in limitations(answer))}</ul></section>"
        )
    nav = " ".join(f"<a href=\"#{q['id']}\">{esc(q['title'])}</a>" for q in questions)
    return f"<noscript><style>.app-shell{{display:none}}</style><div class=\"static-answers\"><h1>What does the evidence say?</h1><nav aria-label=\"Questions\">{nav}</nav><p>Effect direction describes the results. Certainty grades the supporting evidence, not the probability of success. High certainty can accompany mixed effects.</p>{''.join(sections)}</div></noscript>"


def build(output: Path):
    output = output.resolve()
    protected = [
        PROJECT,
        SOURCE,
        PROJECT / "answers",
        PROJECT / "graph",
        PROJECT / "groups",
        PROJECT / ".git",
        SOURCE / "src",
        SOURCE / "scripts",
        SOURCE / "vendor",
    ]
    if any(output == path or output in path.parents for path in protected) or any(
        output.is_relative_to(path) for path in protected[2:]
    ):
        raise ValueError("Choose a separate output directory, such as site/ or src/dist/.")
    if (
        output.exists()
        and any(output.iterdir())
        and output not in {PROJECT / "site", SOURCE / "dist"}
        and not (output / ".understory-build").exists()
    ):
        raise ValueError(
            "The output directory contains files from another project. Choose an empty directory."
        )
    questions = read(SOURCE / "src/data/questions.json")
    bundles = {}
    for question in questions:
        name = FILES[question["id"]]
        answer = read(PROJECT / f"answers/{name}.json")
        summary = read(SOURCE / f"src/data/summaries/{question['id']}.json")
        validate(answer, summary)
        if (
            hashlib.sha256((PROJECT / summary["source_file"]).read_bytes()).hexdigest()
            != summary["source_sha256"]
        ):
            raise ValueError(f"Summary source changed: {question['id']}")
        bundles[question["id"]] = answer, summary
    documents = {
        claim["document_id"]
        for answer, _ in bundles.values()
        for claim in answer["evidence"].values()
    }
    documents.update(
        claim["document_id"]
        for claim in read(PROJECT / "answers/q1_tree_planting_graph.json")["evidence"].values()
    )
    authors = paper_authors(PROJECT / "graph/causal_graph.yaml")
    author_index = {
        document: {"first": authors[document][0], "count": len(authors[document])}
        for document in sorted(documents)
        if authors.get(document)
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".understory-", dir=output.parent) as temporary:
        stage = Path(temporary) / "site"
        stage.mkdir()
        for source in (SOURCE / "src").rglob("*"):
            if source.is_file() and source.suffix in {".js", ".css", ".json", ".html"}:
                target = stage / "src" / source.relative_to(SOURCE / "src")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
        shutil.copytree(SOURCE / "vendor", stage / "vendor")
        (stage / "src/data/paper-authors.json").write_text(
            json.dumps(author_index, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        (stage / "answers").mkdir()
        for name in [*FILES.values(), "q1_tree_planting_graph"]:
            (stage / f"answers/{name}.json").write_text(
                json.dumps(
                    read(PROJECT / f"answers/{name}.json"),
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                encoding="utf-8",
            )
        page = (
            (SOURCE / "index.html")
            .read_text(encoding="utf-8")
            .replace("<!-- STATIC_ANSWERS -->", fallback(questions, bundles))
        )
        (stage / "index.html").write_text(page, encoding="utf-8")
        (stage / ".understory-build").write_text(
            "HTML/CSS/JavaScript — offline build\n", encoding="utf-8"
        )
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(stage), str(output))
    print(f"Built {output}.")
    return output


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / "site")
