/**
 * Level-two section helpers shared by the Codex build and the eval harness.
 * A section runs from its `## ` heading to the next `## ` heading or to the
 * end of the document.
 */
const HEADING = /^## .+$/gm;

export function listSections(markdown) {
  const headings = [...markdown.matchAll(HEADING)];

  return headings.map((match, index) => {
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? markdown.length;

    return { heading: match[0], start, end, text: markdown.slice(start, end).trim() };
  });
}

/**
 * Replaces the section under `heading` with `replacement`. The replacement
 * must start with the same heading so the document keeps its section order,
 * which is what lets every host build stay comparable section by section.
 */
export function replaceSection(markdown, heading, replacement) {
  const section = listSections(markdown).find((entry) => entry.heading === heading);

  if (!section) {
    throw new Error(`document has no "${heading}" section`);
  }

  const body = replacement.trim();

  if (!body.startsWith(heading)) {
    throw new Error(`replacement must start with "${heading}"`);
  }

  return `${markdown.slice(0, section.start)}${body}\n\n${markdown.slice(section.end)}`;
}
