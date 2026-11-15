import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import {
  FILE_PREVIEW_CHARACTERS,
  filePreview,
  fileLanguage,
  isMarkdownFile,
} from "../src/lib/file-preview.ts";
import { FileContentView } from "../src/app/components/FileContentView.tsx";
import { FilesPopover } from "../src/app/components/TasksFilesSidebar.tsx";

test("custom typography retains the default Markdown prose styles", async () => {
  const source =
    '@import "tailwindcss"; @config "../../tailwind.config.mjs"; @source inline("prose prose-playground");';
  const { css } = await postcss([tailwind()]).process(source, {
    from: fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  });
  assert.match(css, /\.prose\s*\{/);
  assert.match(css, /\.prose-playground\s/);
});

test("file previews preserve small documents and bound long lines and Unicode", () => {
  const small = "# Report\n\nA complete file.\n";
  assert.equal(filePreview(small), small);
  assert.equal(
    filePreview("x".repeat(FILE_PREVIEW_CHARACTERS)).length,
    FILE_PREVIEW_CHARACTERS
  );
  assert.equal(
    filePreview("x".repeat(FILE_PREVIEW_CHARACTERS + 1)).length,
    FILE_PREVIEW_CHARACTERS
  );
  assert.equal(
    filePreview("x".repeat(FILE_PREVIEW_CHARACTERS - 1) + "😀tail"),
    "x".repeat(FILE_PREVIEW_CHARACTERS - 1)
  );
  assert.equal(
    filePreview("a\nb\n" + "x".repeat(FILE_PREVIEW_CHARACTERS)),
    "a\nb"
  );
});

test("middleware paths select Markdown and source-code formats", () => {
  assert.ok(isMarkdownFile("/_artifacts/user/thread/confluence/report.MD"));
  assert.ok(isMarkdownFile("/memories/archive/history.markdown"));
  assert.equal(isMarkdownFile("report.md.json"), false);
  assert.equal(
    fileLanguage("/_artifacts/user/thread/jira/result.json"),
    "json"
  );
  assert.equal(fileLanguage("/tools/Dockerfile"), "dockerfile");
});

test("large middleware documents are bounded before Markdown parsing", () => {
  const html = renderToStaticMarkup(
    React.createElement(FileContentView, {
      path: "/_artifacts/user/thread/report.md",
      content: "# Report\n\n" + "Paragraph.\n\n".repeat(20000) + "DOCUMENT_END",
    })
  );
  assert.match(html, /Preview is shortened/);
  assert.match(html, /<h1>Report<\/h1>/);
  assert.doesNotMatch(html, /DOCUMENT_END/);
  assert.ok((html.match(/<p>/g) ?? []).length < 5000);
});

test("listing text artifacts does not decode their contents", () => {
  const artifact = {
    get content() {
      throw new Error("Unopened content was decoded");
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(FilesPopover, {
      files: { "/_artifacts/user/thread/report.md": artifact },
      setFiles: async () => {},
      sourceImageAttachments: {},
      removeSourceImage: async () => {},
      editDisabled: false,
    })
  );
  assert.match(html, /report\.md/);
});
