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

import { requestUrl } from "obsidian";
import { MarkedExtension } from "marked";
import { Extension } from "./extension";
import { sanitizeHTMLToDomPreserveSVG } from "../utils";

export class RemoteSvgInline extends Extension {
  private shouldCheckSvg(src: string) {
    if (!src.startsWith("http")) return false;
    const lower = src.toLowerCase();
    const rasterExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"];
    if (rasterExts.some((ext) => lower.includes(ext))) {
      return false;
    }
    return true;
  }

  private async fetchSvg(src: string) {
    try {
      const res = await requestUrl(src);
      const contentType = res.headers?.["content-type"] || res.headers?.["Content-Type"] || "";
      if (contentType.includes("image/svg+xml")) {
        return res.text;
      }
      if (res.text && res.text.includes("<svg")) {
        return res.text;
      }
    } catch (error) {
      console.warn("Failed to fetch svg:", src, error);
    }
    return null;
  }

  private copyImgAttributes(img: HTMLImageElement, svg: SVGElement) {
    const width = img.getAttribute("width");
    const height = img.getAttribute("height");
    if (width && !svg.getAttribute("width")) {
      svg.setAttribute("width", width);
    }
    if (height && !svg.getAttribute("height")) {
      svg.setAttribute("height", height);
    }

    const style = img.getAttribute("style");
    if (style) {
      const existing = svg.getAttribute("style");
      svg.setAttribute("style", existing ? `${existing};${style}` : style);
    }

    const className = img.getAttribute("class");
    if (className) {
      const existing = svg.getAttribute("class");
      svg.setAttribute("class", existing ? `${existing} ${className}` : className);
    }

    const alt = img.getAttribute("alt");
    if (alt) {
      if (!svg.getAttribute("aria-label")) {
        svg.setAttribute("aria-label", alt);
      }
      if (!svg.getAttribute("role")) {
        svg.setAttribute("role", "img");
      }
    }
  }

  async postprocess(html: string) {
    const wrapperHtml = `<section id="note-to-mp-svg-root">${html}</section>`;
    const doc = sanitizeHTMLToDomPreserveSVG(wrapperHtml);
    const root = doc.firstChild as HTMLElement | null;
    if (!root) return html;

    const images = Array.from(root.getElementsByTagName("img"));
    for (const img of images) {
      const src = img.getAttribute("src") || "";
      if (!this.shouldCheckSvg(src)) {
        continue;
      }

      const svgText = await this.fetchSvg(src);
      if (!svgText) {
        continue;
      }

      const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svgEl = svgDoc.documentElement;
      if (!svgEl || svgEl.tagName.toLowerCase() !== "svg") {
        continue;
      }

      this.copyImgAttributes(img, svgEl as SVGElement);
      const wrapper = document.createElement("span");
      wrapper.className = "note-remote-svg";
      wrapper.appendChild(svgEl as unknown as Node);
      img.replaceWith(wrapper);
    }

    return root.innerHTML;
  }

  markedExtension(): MarkedExtension {
    return {};
  }
}
