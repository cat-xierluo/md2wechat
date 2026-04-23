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

import { Token, Tokens, MarkedExtension } from "marked";
import { TAbstractFile } from "obsidian";
import { Extension } from "./extension";

const LocalFileRegex = /^!\[\[(.*?)\]\]/;

export class LocalFile extends Extension {
    index: number = 0;
    public static fileCache: Map<string, string> = new Map<string, string>();

    generateId() {
        this.index += 1;
        return `fid-${this.index}`;
    }

    getHeaderLevel(line: string) {
        const match = line.trimStart().match(/^#{1,6}/);
        if (match) {
            return match[0].length;
        }
        return 0;
    }

    async getFileContent(file: TAbstractFile, header: string | null, block: string | null) {
        const content = await this.app.vault.adapter.read(file.path);
        if (header == null && block == null) {
            return content;
        }

        let result = '';
        const lines = content.split('\n');
        if (header) {
            let level = 0;
            let append = false;
            for (let line of lines) {
                if (append) {
                    if (level == this.getHeaderLevel(line)) {
                        break;
                    }
                    result += line + '\n';
                    continue;
                }
                if (!line.trim().startsWith('#')) continue;
                const items = line.trim().split(' ');
                if (items.length != 2) continue;
                if (header.trim() != items[1].trim()) continue;
                if (this.getHeaderLevel(line)) {
                    result += line + '\n';
                    level = this.getHeaderLevel(line);
                    append = true;
                }
            }
        }

        function isStructuredBlock(line: string) {
            const trimmed = line.trim();
            return trimmed.startsWith('-') || trimmed.startsWith('>') || trimmed.startsWith('|') || trimmed.match(/^\d+\./);
        }

        if (block) {
            let stopAtEmpty = false;
            let totalLen = 0;
            let structured = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.indexOf(block) >= 0) {
                    result = line.replace(block, '').trim();

                    if (isStructuredBlock(line)) {
                        break;
                    }

                    for (let j = i - 1; j >= 0; j--) {
                        const l = lines[j];

                        if (l.startsWith('#')) {
                            break;
                        }

                        if (l.trim() == '') {
                            if (stopAtEmpty) break;
                            if (j < i - 1 && totalLen > 0) break;
                            stopAtEmpty = true;
                            result = l + '\n' + result;
                            continue;
                        }
                        else {
                            stopAtEmpty = true;
                        }

                        if (structured && !isStructuredBlock(l)) {
                           break;
                        }

                        if (totalLen === 0 && isStructuredBlock(l)) {
                            structured = true;
                        }

                        totalLen += result.length;
                        result = l + '\n' + result;
                    }
                    break;
                }
            }
        }

        return result;
    }

    parseFileLink(link: string) {
        const info = link.split('|')[0];
        const items = info.split('#');
        let path = items[0];
        let header = null;
        let block = null;
        if (items.length == 2) {
            if (items[1].startsWith('^')) {
                block = items[1];
            } else {
                header = items[1];
            }
        }
        return { path, head: header, block };
    }

    async renderFile(link: string, id: string) {
        let { path, head: header, block} = this.parseFileLink(link);
        let file = null;
        if (path === '') {
            file = this.app.workspace.getActiveFile();
        }
        else {
            if (!path.endsWith('.md')) {
                path = path + '.md';
            }
            file = this.assetsManager.searchFile(path);
        }

        if (file == null) {
            const msg = '找不到文件：' + path;
            console.error(msg)
            return msg;
        }

        let content = await this.getFileContent(file, header, block);
        if (content.startsWith('---')) {
            content = content.replace(/^(---)$.+?^(---)$.+?/ims, '');
        }
        const body = await this.marked.parse(content);
        return body;
    }

    parseLinkStyle(link: string) {
        let filename = '';
        let style = 'style="width:100%;height:100%"';
        let postion = 'left';
        const postions = ['left', 'center', 'right'];
        if (link.includes('|')) {
            const items = link.split('|');
            filename = items[0];
            let size = '';
            if (items.length == 2) {
                if (postions.includes(items[1])) {
                    postion = items[1];
                }
                else {
                    size = items[1];
                }
            }
            else if (items.length == 3) {
                size = items[1];
                if (postions.includes(items[1])) {
                    size = items[2];
                    postion = items[1];
                }
                else {
                    size = items[1];
                    postion = items[2];
                }
            }
            if (size != '') {
                const sizes = size.split('x');
                if (sizes.length == 2) {
                    style = `style="width:${sizes[0]}px;height:${sizes[1]}px;"`
                }
                else {
                    style = `style="width:${sizes[0]}px;"`
                }
            }
        }
        else {
            filename = link;
        }
        return { filename, style, postion };
    }

    parseSVGLink(link: string) {
        let classname = 'note-embed-svg-left';
        const postions = new Map<string, string>([
            ['left', 'note-embed-svg-left'],
            ['center', 'note-embed-svg-center'],
            ['right', 'note-embed-svg-right']
        ])

        let {filename, style, postion} = this.parseLinkStyle(link);
        classname = postions.get(postion) || classname;

        return { filename, style, classname };
    }

    async renderSVGFile(filename: string, id: string) {
        const file = this.assetsManager.searchFile(filename);

        if (file == null) {
            const msg = '找不到文件：' + file;
            console.error(msg)
            return msg;
        }

        const content = await this.getFileContent(file, null, null);
        LocalFile.fileCache.set(filename, content);
        return content;
    }

    markedExtension(): MarkedExtension {
        return {
            async: true,
            walkTokens: async (token: Tokens.Generic) => {
                if (token.type !== 'LocalImage') {
                    return;
                }

                if (token.href.endsWith('.svg') || token.href.includes('.svg|')) {
                    const info = this.parseSVGLink(token.href);
                    const id = this.generateId();
                    let svg = '渲染中';
                    if (LocalFile.fileCache.has(info.filename)) {
                        svg = LocalFile.fileCache.get(info.filename) || '渲染失败';
                    }
                    else {
                        svg = await this.renderSVGFile(info.filename, id) || '渲染失败';
                    }
                    token.html = `<span class="${info.classname}"><span class="note-embed-svg" id="${id}" ${info.style}>${svg}</span></span>`
                    return;
                }

                const id = this.generateId();
                const content = await this.renderFile(token.href, id);
                const tag = this.callback.settings.embedStyle === 'quote' ? 'blockquote' : 'section';
                token.html = `<${tag} class="note-embed-file" id="${id}">${content}</${tag}>`
            },

            extensions:[{
            name: 'LocalImage',
            level: 'block',
            start: (src: string) => {
                const index = src.indexOf('![[');
                if (index === -1) return;
                return index;
            },
            tokenizer: (src: string) => {
                const matches = src.match(LocalFileRegex);
                if (matches == null) return;
                const token: Token = {
                    type: 'LocalImage',
                    raw: matches[0],
                    href: matches[1],
                    text: matches[1]
                };
                return token;
            },
            renderer: (token: Tokens.Generic) => {
                return token.html;
            }
        }]};
    }
}