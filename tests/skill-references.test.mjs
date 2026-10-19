import assert from "node:assert/strict";
import test from "node:test";
import {
  activeSkillQuery,
  searchSkills,
  insertSkillReference,
  reconcileSkillReferences,
  submittedSkillReferences,
  parseSkillReferences,
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
