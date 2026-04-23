/*
 * Copyright (c) 2024-2025 Sun Booshi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { Marked } from "marked";
import { NMPSettings } from "src/settings";
import { App, Vault } from "obsidian";
import AssetsManager from "../assets";
import { Extension, MDRendererCallback } from "./extension";
import { Blockquote} from "./blockquote";
import { CodeRenderer } from "./code";
import { EmbedBlockMark } from "./embed-block-mark";
import { SVGIcon } from "./icons";
import { LinkRenderer } from "./link";
import { LocalFile } from "./local-file";
import { TextHighlight } from "./text-highlight";
import { Comment } from "./commnet";
import { Topic } from "./topic";
import { HeadingRenderer } from "./heading";
import { FootnoteRenderer } from "./footnote";
import { EmptyLineRenderer } from "./empty-line";
import { RemoteSvgInline } from "./remote-svg";
import { cleanUrl } from "../utils";


const markedOptiones = {
    gfm: true,
    breaks: true,
};

const customRenderer = {
	hr(): string {
		return '<hr>';
	},
	list(body: string, ordered: boolean, start: number | ''): string {
		const type = ordered ? 'ol' : 'ul';
		const startatt = (ordered && start !== 1) ? (' start="' + start + '"') : '';
		return '<' + type + startatt + ' class="list-paddingleft-1">' + body + '</' + type + '>';
	},
	listitem(text: string, task: boolean, checked: boolean): string {
		return `<li><section>${text}</section></li>`;
	},
	image(href: string, title: string | null, text: string): string {
    const cleanHref = cleanUrl(href);
    if (cleanHref === null) {
      return text;
    }
    href = cleanHref;

		let out = '';
		if (NMPSettings.getInstance().useFigcaption) {
			out = `<figure style="display: flex; flex-direction: column; align-items: center;"><img src="${href}" alt="${text}"`;
			if (title) {
				out += ` title="${title}"`;
			}
			if (text.length > 0) {
				out += `><figcaption>${text}</figcaption></figure>`;
			}
			else {
				out += '></figure>'
			}
		}
		else {
			out = `<img src="${href}" alt="${text}"`;
			if (title) {
				out += ` title="${title}"`;
			}
			out += '>';
		}
    return out;
  }
	,
	link(href: string, title: string | null, text: string): string {
		const cleanHref = cleanUrl(href);
		if (cleanHref === null) {
			return text;
		}

		const imgMatch = text.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
		let body = text;
		if (imgMatch) {
			body = customRenderer.image(imgMatch[2], imgMatch[3] || null, imgMatch[1]);
		}

		let out = `<a href="${cleanHref}"`;
		if (title) {
			out += ` title="${title}"`;
		}
		out += `>${body}</a>`;
		return out;
	}
};

const SVG_PLACEHOLDER_ATTR = 'data-note-to-mp-inline-svg';

function extractInlineSvg(content: string) {
	const svgMap = new Map<string, string>();
	const fenceRanges: Array<{ start: number; end: number }> = [];
	let inFence = false;
	let fenceStart = 0;
	let offset = 0;
	const lines = content.split('\n');
	for (const line of lines) {
		const lineStart = offset;
		const lineEnd = offset + line.length;
		const trimmed = line.trimStart();
		if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
			if (!inFence) {
				inFence = true;
				fenceStart = lineStart;
			} else {
				inFence = false;
				fenceRanges.push({ start: fenceStart, end: lineEnd });
			}
		}
		offset = lineEnd + 1;
	}
	if (inFence) {
		fenceRanges.push({ start: fenceStart, end: content.length });
	}

	let cursor = 0;
	let result = '';
	const replaceSvg = (segment: string) =>
		segment.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
			const key = `svg-${svgMap.size}`;
			svgMap.set(key, match);
			return `<span ${SVG_PLACEHOLDER_ATTR}="${key}"></span>`;
		});

	for (const range of fenceRanges) {
		if (cursor < range.start) {
			result += replaceSvg(content.slice(cursor, range.start));
		}
		result += content.slice(range.start, range.end);
		cursor = range.end;
	}
	if (cursor < content.length) {
		result += replaceSvg(content.slice(cursor));
	}

	return { content: result, svgMap };
}

function restoreInlineSvg(html: string, svgMap: Map<string, string>) {
	if (svgMap.size === 0) return html;
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<section id="note-to-mp-svg-restore">${html}</section>`, "text/html");
	const root = doc.getElementById("note-to-mp-svg-restore");
	if (!root) return html;

	const placeholders = root.querySelectorAll(`span[${SVG_PLACEHOLDER_ATTR}]`);
	for (const placeholder of placeholders) {
		const key = placeholder.getAttribute(SVG_PLACEHOLDER_ATTR);
		if (!key) continue;
		const svg = svgMap.get(key);
		if (!svg) continue;
		const svgDoc = parser.parseFromString(svg, "image/svg+xml");
		const svgEl = svgDoc.documentElement;
		if (svgEl && svgEl.tagName.toLowerCase() === "svg") {
			placeholder.replaceWith(svgEl as unknown as Node);
		}
	}

	return root.innerHTML;
}

function replaceLinkedImages(content: string) {
	const fenceRanges: Array<{ start: number; end: number }> = [];
	let inFence = false;
	let fenceStart = 0;
	let offset = 0;
	const lines = content.split('\n');
	for (const line of lines) {
		const lineStart = offset;
		const lineEnd = offset + line.length;
		const trimmed = line.trimStart();
		if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
			if (!inFence) {
				inFence = true;
				fenceStart = lineStart;
			} else {
				inFence = false;
				fenceRanges.push({ start: fenceStart, end: lineEnd });
			}
		}
		offset = lineEnd + 1;
	}
	if (inFence) {
		fenceRanges.push({ start: fenceStart, end: content.length });
	}

	const linkedImageRegex = /\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
	const replaceSegment = (segment: string) =>
		segment.replace(linkedImageRegex, (match, alt, imgSrc, imgTitle, linkHref, linkTitle) => {
			const cleanImgSrc = cleanUrl(imgSrc);
			const cleanLinkHref = cleanUrl(linkHref);
			if (cleanImgSrc === null || cleanLinkHref === null) {
				return match;
			}
			let imgTag = `<img src="${cleanImgSrc}" alt="${alt}"`;
			if (imgTitle) {
				imgTag += ` title="${imgTitle}"`;
			}
			imgTag += '>';

			let anchor = `<a href="${cleanLinkHref}"`;
			if (linkTitle) {
				anchor += ` title="${linkTitle}"`;
			}
			anchor += `>${imgTag}</a>`;
			return anchor;
		});

	let cursor = 0;
	let result = '';
	for (const range of fenceRanges) {
		if (cursor < range.start) {
			result += replaceSegment(content.slice(cursor, range.start));
		}
		result += content.slice(range.start, range.end);
		cursor = range.end;
	}
	if (cursor < content.length) {
		result += replaceSegment(content.slice(cursor));
	}
	return result;
}

export class MarkedParser {
	extensions: Extension[] = [];
	marked: Marked;
	app: App;
	vault: Vault;

	constructor(app: App, callback: MDRendererCallback) {
		this.app = app;
		this.vault = app.vault;

		const settings = NMPSettings.getInstance();
		const assetsManager = AssetsManager.getInstance();

		this.extensions.push(new LocalFile(app, settings, assetsManager, callback));
		this.extensions.push(new Blockquote(app, settings, assetsManager, callback));
		this.extensions.push(new EmbedBlockMark(app, settings, assetsManager, callback));
		this.extensions.push(new SVGIcon(app, settings, assetsManager, callback));
		this.extensions.push(new LinkRenderer(app, settings, assetsManager, callback));
		this.extensions.push(new TextHighlight(app, settings, assetsManager, callback));
		this.extensions.push(new CodeRenderer(app, settings, assetsManager, callback));
		this.extensions.push(new Comment(app, settings, assetsManager, callback));
		this.extensions.push(new Topic(app, settings, assetsManager, callback));
		this.extensions.push(new HeadingRenderer(app, settings, assetsManager, callback));
		this.extensions.push(new FootnoteRenderer(app, settings, assetsManager, callback));
		if (settings.enableEmptyLine) {
			this.extensions.push(new EmptyLineRenderer(app, settings, assetsManager, callback));
		}
		this.extensions.push(new RemoteSvgInline(app, settings, assetsManager, callback));
	}

	async buildMarked() {
	  this.marked = new Marked();
		this.marked.use(markedOptiones);
		for (const ext of this.extensions) {
			this.marked.use(ext.markedExtension());
			ext.marked = this.marked;
			await ext.prepare();
		}
		this.marked.use({renderer: customRenderer});
	}

	async prepare() {
	  this.extensions.forEach(async ext => await ext.prepare());
	}

	async postprocess(html: string) {
		let result = html;
		for (let ext of this.extensions) {
			result = await ext.postprocess(result);
		}
		return result;
	}

	async parse(content: string) {
		if (!this.marked) await this.buildMarked();
		await this.prepare();
		const normalized = replaceLinkedImages(content);
		const extracted = extractInlineSvg(normalized);
		let html = await this.marked.parse(extracted.content);
		html = await this.postprocess(html);
		html = restoreInlineSvg(html, extracted.svgMap);
		return html;
	}
}
