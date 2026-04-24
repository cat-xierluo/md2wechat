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

import { App, ItemView, Workspace, Notice, sanitizeHTMLToDom, apiVersion, TFile, MarkdownRenderer, FrontMatterCache } from 'obsidian';
import { applyCSS, sanitizeHTMLToDomPreserveSVG } from './utils';
import { NMPSettings } from './settings';
import AssetsManager from './assets';
import InlineCSS from './inline-css';
import { MDRendererCallback } from './markdown/extension';
import { MarkedParser } from './markdown/parser';
import { LocalFile } from './markdown/local-file';
import { CardDataManager } from './markdown/code';
import { debounce } from './utils';
import { toPng } from 'html-to-image';


const FRONT_MATTER_REGEX = /^(---)$.+?^(---)$.+?/ims;

interface Metadata {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  content_source_url?: string;
  cover?: string;
  thumb_media_id: string;
  need_open_comment?: number;
  only_fans_can_comment?: number;
  pic_crop_235_1?: string;
  pic_crop_1_1?: string;
  appid?: string;
  theme?: string;
  highlight?: string;
}

export class ArticleRender implements MDRendererCallback {
  app: App;
  itemView: ItemView;
  workspace: Workspace;
  styleEl: HTMLElement;
  articleDiv: HTMLDivElement;
  settings: NMPSettings;
  assetsManager: AssetsManager;
  articleHTML: string;
  title: string;
  _currentTheme: string;
  _currentHighlight: string;
  markedParser: MarkedParser;
  cachedElements: Map<string, string> = new Map();
  debouncedRenderMarkdown: (...args: any[]) => void;

  constructor(app: App, itemView: ItemView, styleEl: HTMLElement, articleDiv: HTMLDivElement) {
    this.app = app;
    this.itemView = itemView;
    this.styleEl = styleEl;
    this.articleDiv = articleDiv;
    this.settings = NMPSettings.getInstance();
    this.assetsManager = AssetsManager.getInstance();
    this.articleHTML = '';
    this.title = '';
    this._currentTheme = 'default';
    this._currentHighlight = 'default';
    this.markedParser = new MarkedParser(app, this);
    this.debouncedRenderMarkdown = debounce(this.renderMarkdown.bind(this), 1000);
  }

  set currentTheme(value: string) {
    this._currentTheme = value;
  }

  get currentTheme() {
    const { theme } = this.getMetadata();
    if (theme) {
      return theme;
    }
    return this._currentTheme;
  }

  set currentHighlight(value: string) {
    this._currentHighlight = value;
  }

  get currentHighlight() {
    const { highlight } = this.getMetadata();
    if (highlight) {
      return highlight;
    }
    return this._currentHighlight;
  }

  isOldTheme() {
    const theme = this.assetsManager.getTheme(this.currentTheme);
    if (theme) {
      return theme.css.indexOf('.note-to-mp') < 0;
    }
    return false;
  }

  setArticle(article: string) {
    this.articleDiv.empty();
    let className = 'note-to-mp';
    // 兼容旧版本样式
    if (this.isOldTheme()) {
      className = this.currentTheme;
    }
    const html = `<section class="${className}" id="article-section">${article}</section>`;
    const doc = sanitizeHTMLToDomPreserveSVG(html);
    if (doc.firstChild) {
      this.articleDiv.appendChild(doc.firstChild);
    }
  }

  setStyle(css: string) {
    this.styleEl.empty();
    this.styleEl.appendChild(document.createTextNode(css));
  }

  reloadStyle() {
    this.setStyle(this.getCSS());
  }

  getArticleSection() {
    return this.articleDiv.querySelector('#article-section') as HTMLElement;
  }

  getArticleContent() {
    const content = this.articleDiv.innerHTML;
    let html = applyCSS(content, this.getCSS());
    // 处理话题多余内容
    html = html.replace(/rel="noopener nofollow"/g, '');
    html = html.replace(/target="_blank"/g, '');
    html = html.replace(/data-leaf=""/g, 'leaf=""');
    return CardDataManager.getInstance().restoreCard(html);
  }

  getArticleText() {
    return this.articleDiv.innerText.trimStart();
  }

  errorContent(error: any) {
    return '<h1>渲染失败!</h1><br/>'
      + '如需帮助请前往&nbsp;&nbsp;<a href="https://github.com/cat-xierluo/md2wechat/issues">https://github.com/cat-xierluo/md2wechat/issues</a>&nbsp;&nbsp;反馈<br/><br/>'
      + '如果方便，请提供引发错误的完整Markdown内容。<br/><br/>'
      + '<br/>Obsidian版本：' + apiVersion
      + '<br/>错误信息：<br/>'
      + `${error}`;
  }

  async renderMarkdown(af: TFile | null = null) {
    try {
      let md = '';
      if (af && af.extension.toLocaleLowerCase() === 'md') {
        md = await this.app.vault.adapter.read(af.path);
        this.title = af.basename;
      }
      else {
        md = '没有可渲染的笔记或文件不支持渲染';
      }
      if (md.startsWith('---')) {
        md = md.replace(FRONT_MATTER_REGEX, '');
      }

      this.articleHTML = await this.markedParser.parse(md);
      this.setStyle(this.getCSS());
      this.setArticle(this.articleHTML);
      await this.processCachedElements();
    }
    catch (e) {
      console.error(e);
      this.setArticle(this.errorContent(e));
    }
  }

  getCSS() {
    try {
      const theme = this.assetsManager.getTheme(this.currentTheme);
      const highlight = this.assetsManager.getHighlight(this.currentHighlight);
      const customCSS = this.settings.customCSSNote.length > 0 || this.settings.useCustomCss ? this.assetsManager.customCSS : '';
      const baseCSS = this.settings.baseCSS ? `.note-to-mp {${this.settings.baseCSS}}` : '';
      return `${InlineCSS}\n\n${highlight!.css}\n\n${theme!.css}\n\n${baseCSS}\n\n${customCSS}`;
    } catch (error) {
      console.error(error);
      new Notice(`获取样式失败${this.currentTheme}|${this.currentHighlight}，请检查主题是否正确安装。`);
    }
    return '';
  }

  updateStyle(styleName: string) {
    this.currentTheme = styleName;
    this.setStyle(this.getCSS());
  }

  updateHighLight(styleName: string) {
    this.currentHighlight = styleName;
    this.setStyle(this.getCSS());
  }

  getFrontmatterValue(frontmatter: FrontMatterCache, key: string) {
    const value = frontmatter[key];

    if (value instanceof Array) {
      return value[0];
    }

    return value;
  }

  getMetadata(): Metadata {
    let res: Metadata = {
      title: '',
      author: undefined,
      digest: undefined,
      content: '',
      content_source_url: undefined,
      cover: undefined,
      thumb_media_id: '',
      need_open_comment: undefined,
      only_fans_can_comment: undefined,
      pic_crop_235_1: undefined,
      pic_crop_1_1: undefined,
      appid: undefined,
      theme: undefined,
      highlight: undefined,
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) return res;
    const metadata = this.app.metadataCache.getFileCache(file);
    if (metadata?.frontmatter) {
      const keys = this.assetsManager.expertSettings.frontmatter;
      const frontmatter = metadata.frontmatter;
      res.title = this.getFrontmatterValue(frontmatter, keys.title);
      res.author = this.getFrontmatterValue(frontmatter, keys.author);
      res.digest = this.getFrontmatterValue(frontmatter, keys.digest);
      res.content_source_url = this.getFrontmatterValue(frontmatter, keys.content_source_url);
      res.cover = this.getFrontmatterValue(frontmatter, keys.cover);
      res.thumb_media_id = this.getFrontmatterValue(frontmatter, keys.thumb_media_id);
      res.need_open_comment = frontmatter[keys.need_open_comment] ? 1 : undefined;
      res.only_fans_can_comment = frontmatter[keys.only_fans_can_comment] ? 1 : undefined;
      res.appid = this.getFrontmatterValue(frontmatter, keys.appid);
      res.theme = this.getFrontmatterValue(frontmatter, keys.theme);
      res.highlight = this.getFrontmatterValue(frontmatter, keys.highlight);
      if (frontmatter[keys.crop]) {
        res.pic_crop_235_1 = '0_0_1_0.5';
        res.pic_crop_1_1 = '0_0.525_0.404_1';
      }
    }
    return res;
  }

  async copyArticle() {
    const content = this.getArticleContent();
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([content], { type: 'text/html' })
    })])
  }

  async exportHTML() {
    const content = this.articleDiv.innerHTML;
    const globalStyle = await this.assetsManager.getStyle();
    const html = applyCSS(content, this.getCSS() + globalStyle);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.title + '.html';
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  async processCachedElements() {
    const af = this.app.workspace.getActiveFile();
    if (!af) {
      console.error('当前没有打开文件，无法处理缓存元素');
      return;
    }
    for (const [key, value] of this.cachedElements) {
      const [category, id] = key.split(':');
      if (category === 'mermaid' || category === 'excalidraw') {
        const container = this.articleDiv.querySelector('#' + id) as HTMLElement;
        if (container) {
          await MarkdownRenderer.render(this.app, value, container, af.path, this.itemView);
        }
      }
    }
  }

  async cachedElementsToImages() {
    for (const [key, cached] of this.cachedElements) {
      const [category, elementId] = key.split(':');
      const container = this.articleDiv.querySelector(`#${elementId}`) as HTMLElement;
      if (!container) continue;

      if (category === 'mermaid') {
        await this.replaceMermaidWithImage(container, elementId);
      } else if (category === 'excalidraw') {
        await this.replaceExcalidrawWithImage(container, elementId);
      }
    }
  }

  private async replaceMermaidWithImage(container: HTMLElement, id: string) {
    const mermaidContainer = container.querySelector('.mermaid') as HTMLElement;
    if (!mermaidContainer || !mermaidContainer.children.length) return;

    const svg = mermaidContainer.querySelector('svg');
    if (!svg) return;

    try {
      const pngDataUrl = await toPng(mermaidContainer.firstElementChild as HTMLElement, { pixelRatio: 2 });
      const img = document.createElement('img');
      img.id = `img-${id}`;
      img.src = pngDataUrl;
      img.style.width = `${svg.clientWidth}px`;
      img.style.height = 'auto';

      container.replaceChild(img, mermaidContainer);
    } catch (error) {
      console.warn(`Failed to render Mermaid diagram: ${id}`, error);
    }
  }

  private async replaceExcalidrawWithImage(container: HTMLElement, id: string) {
    const innerDiv = container.querySelector('div') as HTMLElement;
    if (!innerDiv) return;

    if (NMPSettings.getInstance().excalidrawToPNG) {
      const originalImg = container.querySelector('img') as HTMLImageElement;
      if (!originalImg) return;

      const style = originalImg.getAttribute('style') || '';
      try {
        const pngDataUrl = await toPng(originalImg, { pixelRatio: 2 });

        const img = document.createElement('img');
        img.id = `img-${id}`;
        img.src = pngDataUrl;
        img.setAttribute('style', style);

        container.replaceChild(img, container.firstChild!);
      } catch (error) {
        console.warn(`Failed to render Excalidraw image: ${id}`, error);
      }
    } else {
      const svg = await LocalFile.renderExcalidraw(innerDiv.innerHTML);
      this.updateElementByID(id, svg);
    }
  }

  updateElementByID(id: string, html: string): void {
    const item = this.articleDiv.querySelector('#' + id) as HTMLElement;
    if (!item) return;
    const doc = sanitizeHTMLToDomPreserveSVG(html);
    item.empty();
    if (doc.childElementCount > 0) {
      for (const child of doc.children) {
        item.appendChild(child.cloneNode(true)); // 使用 cloneNode 复制节点以避免移动它
      }
    }
    else {
      item.innerText = '渲染失败';
    }
  }

  cacheElement(category: string, id: string, data: string): void {
    const key = category + ':' + id;
    this.cachedElements.set(key, data);
  }
}