import type { Root, RootContent } from "mdast";

/** Keep a partially received bold closing delimiter from flashing as italics. */
export function remarkStreamingEmphasis() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (parent: { children: RootContent[] }) => {
      parent.children.forEach((node, index) => {
        if (node.type === "emphasis") {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start !== undefined && end !== undefined) {
            const raw = source.slice(start, end);
            const preceding = parent.children[index - 1];
            const hasUnmatchedOpener =
              preceding?.type === "text" &&
              preceding.position?.end.offset === start &&
              (raw[0] === "*" || raw[0] === "_") &&
              preceding.value.endsWith(raw[0]) &&
              source[start - 2] !== "\\";
            const marker = hasUnmatchedOpener
              ? raw[0].repeat(2)
              : raw.startsWith("**")
              ? "**"
              : raw.startsWith("__")
              ? "__"
              : null;
            // CommonMark reads `**heading*` as italic `*heading`. Keep the
            // source visible until the second closing marker arrives. Complete
            // emphasis (including ***bold italic***) retains its semantics.
            if (
              marker &&
              !raw.endsWith(marker) &&
              end === source.trimEnd().length
            ) {
              parent.children[index] = { type: "text", value: raw };
              return;
            }
          }
        }
        if ("children" in node) walk(node);
      });
    };
    walk(tree);
  };
}
