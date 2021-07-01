import yaml from "yaml";

function parseMarkdown(text) {
  const lines = text.trim().split("\n");
  let inMeta = false;

  const metaLines = [];
  const contentLines = [];

  for (let line of lines) {
    if (inMeta) {
      if (line.startsWith("---")) {
        inMeta = false;
        continue;
      }

      metaLines.push(line);
    } else {
      if (!contentLines.length && line.startsWith("---")) {
        inMeta = true;
        continue;
      }
      contentLines.push(line);
    }
  }

  return {
    meta: yaml.parse(metaLines.join("\n")) || {},
    content: contentLines.join("\n").trim(),
  };
}

export { parseMarkdown };
