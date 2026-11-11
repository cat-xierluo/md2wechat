/**
 * Prepare the renderer's code blocks for the clipboard after theme styles are inlined.
 * WeChat can discard layout styles on paste, so line breaks and optional line numbers
 * must not depend on flex or pre formatting.
 */
export function formatClipboardCodeBlocks(root: HTMLElement) {
  for (const pre of Array.from(root.querySelectorAll<HTMLElement>('section.code-section.code-snippet__fix > pre'))) {
    const snippet = pre.parentElement!;
    const rows = Array.from(pre.children).filter((child): child is HTMLElement => child.tagName === 'CODE');
    if (!rows.length) continue;

    const doc = root.ownerDocument;
    const block = doc.createElement('section');
    block.className = 'md2wechat-code-copy';
    block.style.cssText = snippet.style.cssText;
    for (const prop of ['display', 'white-space', 'overflow', 'overflow-x', 'overflow-y', 'height', 'max-height']) {
      block.style.removeProperty(prop);
    }
    block.style.backgroundColor = pre.style.backgroundColor || snippet.style.backgroundColor || '#f5f5f5';
    block.style.color = rows[0].style.color || pre.style.color || snippet.style.color || 'inherit';
    block.style.fontFamily = rows[0].style.fontFamily || pre.style.fontFamily || 'Menlo, Consolas, monospace';
    block.style.fontSize = snippet.style.fontSize || '14px';
    block.style.lineHeight = '1.65';
    block.style.letterSpacing = '0';
    block.style.textAlign = 'left';
    block.style.overflowWrap = 'anywhere';

    const gutter = snippet.querySelector<HTMLElement>(':scope > ul');
    const digits = String(rows.length).length;
    rows.forEach((row, index) => {
      if (index) block.appendChild(doc.createElement('br'));
      const line = doc.createElement('span');
      line.className = 'md2wechat-code-line';
      if (gutter) {
        const number = doc.createElement('span');
        number.className = 'md2wechat-code-number';
        number.style.color = gutter.style.color || '#737373';
        number.textContent = String(index + 1).padStart(digits, '\u00a0') + '\u00a0\u00a0';
        line.appendChild(number);
      }
      // Highlight spans already carry inline colors; indentation is encoded as NBSP.
      // An empty row is represented by the adjacent breaks, without adding a space.
      if (row.textContent) {
        while (row.firstChild) line.appendChild(row.firstChild);
      }
      block.appendChild(line);
    });
    snippet.replaceWith(block);
  }
}
