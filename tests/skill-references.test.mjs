import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSkillQuery,
  searchSkills,
  insertSkillReference,
  reconcileSkillReferences,
  submittedSkillReferences,
  parseSkillReferences,
  matchSkillReferences,
} from "../src/lib/skill-references.ts";

const skill = {
  id: "personal-1",
  origin: "personal",
  name: "release-notes",
  description: "Summarize shipped changes for customers",
  availability: "available",
};
const selected = insertSkillReference(
  "Use $shipped please",
  {
    start: 4,
    end: 12,
    query: "shipped",
  },
  skill,
  []
);

test("dollar search follows the caret and supports descriptions with spaces", () => {
  assert.deepEqual(activeSkillQuery("Use $shipped changes", 20, []), {
    start: 4,
    end: 20,
    query: "shipped changes",
  });
  assert.deepEqual(activeSkillQuery("$", 1, []), {
    start: 0,
    end: 1,
    query: "",
  });
  for (const text of ["x$word", "\\$word", "$$math", "$word\nnext"])
    assert.equal(activeSkillQuery(text, text.length, []), null, text);
  assert.equal(activeSkillQuery(selected.text, 10, selected.references), null);
});

test("exact typed and pasted names resolve automatically without rewriting visible text", () => {
  const text = "  Use RELEASE-NOTES, then $release-notes.  ";
  const references = matchSkillReferences(text, [skill]);
  assert.deepEqual(references, [
    { id: skill.id, origin: skill.origin, name: skill.name, start: 6, end: 19 },
    {
      id: skill.id,
      origin: skill.origin,
      name: skill.name,
      start: 26,
      end: 40,
    },
  ]);
  const submitted = submittedSkillReferences(text, references);
  assert.equal(submitted[0].start, 4);
  assert.deepEqual(parseSkillReferences(submitted, text.trim()), submitted);
  assert.deepEqual(matchSkillReferences("release-note", [skill]), []);
});

test("automatic matching excludes fragments, literal code, paths, URLs, emails and escaped dollars", () => {
  for (const text of [
    "my-release-notes",
    "release-notes-extra",
    "release-notes.txt",
    "./release-notes",
    "references/release-notes",
    "release-notes/help",
    "release-notes@example.com",
    "https://example.test/release-notes",
    "`release-notes`",
    "`` release-notes ``",
    "```\nrelease-notes\n```",
    "~~~text\nrelease-notes\n~~~",
    "\\$release-notes",
    "x$release-notes",
    "变量release-notes",
    "release-notes变量",
    "release-notes𠮷",
    "release-notes\u0301",
  ])
    assert.deepEqual(matchSkillReferences(text, [skill]), [], text);
  assert.equal(
    matchSkillReferences('(release-notes), "release-notes"!', [skill]).length,
    2
  );
});

test("automatic references use available unambiguous names and prefer complete longer names", () => {
  const short = { ...skill, id: "short", name: "release" };
  assert.equal(
    matchSkillReferences("release-notes", [short, skill])[0].id,
    skill.id
  );
  assert.deepEqual(
    matchSkillReferences("release-notes", [
      { ...skill, availability: "name_conflict" },
    ]),
    []
  );
  assert.deepEqual(
    matchSkillReferences("release-notes", [
      skill,
      { ...skill, id: "other", origin: "system" },
    ]),
    []
  );
  assert.equal(
    matchSkillReferences("release-notes", [
      skill,
      { ...skill, availability: "unavailable" },
    ]).length,
    1
  );
  const numeric = { ...skill, name: "123" };
  assert.deepEqual(matchSkillReferences("Price 123", [numeric]), []);
  assert.equal(matchSkillReferences("Use $123", [numeric]).length, 1);
});

test("automatic references reconcile as names change and respect explicit selections and limits", () => {
  assert.equal(matchSkillReferences("release-notes", [skill]).length, 1);
  assert.deepEqual(matchSkillReferences("release-note", [skill]), []);
  assert.equal(matchSkillReferences("release-notes", [skill])[0].end, 13);
  assert.deepEqual(
    matchSkillReferences(selected.text, [skill], selected.references),
    selected.references
  );
  const many = Array.from({ length: 25 }, () => "release-notes").join(" ");
  assert.equal(matchSkillReferences(many, [skill]).length, 20);
  assert.equal(
    matchSkillReferences("emoji 🦊 release-notes", [skill])[0].start,
    9
  );
});

test("valid skill names can start with digits or contain only digits", () => {
  assert.deepEqual(activeSkillQuery("$3d-review", 10, []), {
    start: 0,
    end: 10,
    query: "3d-review",
  });
  assert.deepEqual(activeSkillQuery("$123", 4, []), {
    start: 0,
    end: 4,
    query: "123",
  });
});

test("introduction searches accept punctuation used in technical descriptions", () => {
  const text = "Use $React/Next.js";
  assert.deepEqual(activeSkillQuery(text, text.length, []), {
    start: 4,
    end: text.length,
    query: "React/Next.js",
  });
  assert.deepEqual(activeSkillQuery("$C++ testing", 12, []), {
    start: 0,
    end: 12,
    query: "C++ testing",
  });
});

test("continuing a message after a selected skill does not reopen its search", () => {
  const text = selected.text + " with more details";
  assert.equal(activeSkillQuery(text, text.length, selected.references), null);
  assert.deepEqual(
    activeSkillQuery(text + " $", text.length + 2, selected.references),
    {
      start: text.length + 1,
      end: text.length + 2,
      query: "",
    }
  );
});

test("search matches introductions case-insensitively and excludes unavailable skills", () => {
  const unavailable = { ...skill, id: "bad", availability: "name_conflict" };
  assert.deepEqual(searchSkills([skill, unavailable], "SHIPPED changes"), [
    skill,
  ]);
  assert.deepEqual(searchSkills([skill], "release"), [skill]);
  assert.deepEqual(searchSkills([skill], "nonexistent"), []);
});

test("selection replaces only the query, preserves surrounding text, and restores the caret", () => {
  assert.equal(selected.text, "Use $release-notes please");
  assert.equal(selected.caret, 19);
  assert.deepEqual(selected.references, [
    {
      id: skill.id,
      origin: "personal",
      name: skill.name,
      start: 4,
      end: 18,
    },
  ]);
  const atEnd = insertSkillReference(
    "$",
    { start: 0, end: 1, query: "" },
    skill,
    []
  );
  assert.equal(atEnd.text, "$release-notes ");
  assert.equal(atEnd.caret, 15);
});

test("references move with text edits and stop being selected when edited or deleted", () => {
  const { text, references } = selected;
  assert.deepEqual(reconcileSkillReferences(text, "Now " + text, references), [
    { ...references[0], start: 8, end: 22 },
  ]);
  assert.deepEqual(
    reconcileSkillReferences(text, text.replace("notes", "note"), references),
    []
  );
  assert.deepEqual(
    reconcileSkillReferences(text, "Use please", references),
    []
  );
  assert.deepEqual(
    reconcileSkillReferences(
      text,
      text.replace(" please", "Extra"),
      references
    ),
    []
  );
  assert.deepEqual(
    reconcileSkillReferences(text, text + "\nMore details", references),
    references
  );
});

test("only selected, intact references are serialized with trimmed message offsets", () => {
  const padded = "  " + selected.text + "  ";
  const refs = [{ ...selected.references[0], start: 6, end: 20 }];
  assert.deepEqual(submittedSkillReferences(padded, refs), selected.references);
  assert.deepEqual(submittedSkillReferences("$release-notes", []), []);
  assert.deepEqual(submittedSkillReferences("no skill", refs), []);
});

test("history parsing rejects malformed references without crashing message rendering", () => {
  assert.deepEqual(parseSkillReferences(null, selected.text), []);
  assert.deepEqual(
    parseSkillReferences(
      [
        null,
        {},
        {
          ...selected.references[0],
          start: "4",
        },
        ...selected.references,
      ],
      selected.text
    ),
    selected.references
  );
});
