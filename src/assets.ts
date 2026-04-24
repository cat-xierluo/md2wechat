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

import { App, PluginManifest, Notice, requestUrl, FileSystemAdapter, TAbstractFile, TFile, TFolder } from "obsidian";
import * as zip from "@zip.js/zip.js";
import DefaultTheme from "./default-theme";
import { CDNHighlights, DefaultHighlightCSS } from "./built-in-highlights";
import { NMPSettings } from "./settings";
import { ExpertSettings, defaultExpertSettings, expertSettingsFromString } from "./expert-settings";


export interface Theme {
    name: string
    className: string
    desc: string
    author: string
    css: string
}

export interface Highlight {
    name: string
    url: string
    css: string
}

export default class AssetsManager {
    app: App;
    defaultTheme: Theme = DefaultTheme;
    manifest: PluginManifest;
    themes: Theme[];
    highlights: Highlight[];
    assetsPath: string;
    themesPath: string;
    hilightPath: string;
    customCSS: string = '';
    themeCfg: string;
    hilightCfg: string;
    customCSSPath: string;
    iconsPath: string;
    wasmPath: string;
    expertSettings: ExpertSettings;
    isLoaded: boolean = false;

    private static instance: AssetsManager;

    // 静态方法，用于获取实例
    public static getInstance(): AssetsManager {
        if (!AssetsManager.instance) {
            AssetsManager.instance = new AssetsManager();
        }
        return AssetsManager.instance;
    }

    public static setup(app: App, manifest: PluginManifest) {
        AssetsManager.getInstance()._setup(app, manifest);
    }

    private _setup(app: App, manifest: PluginManifest) {
        this.app = app;
        this.manifest = manifest;
        this.assetsPath = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/assets/';
        this.themesPath = this.assetsPath + 'themes/';
        this.hilightPath = this.assetsPath + 'highlights/';
        this.themeCfg = this.assetsPath + 'themes.json';
        this.hilightCfg = this.assetsPath + 'highlights.json';
        this.customCSSPath = this.assetsPath + 'custom.css';
        this.iconsPath = this.assetsPath + 'icons/';
        this.wasmPath = this.assetsPath + 'lib.wasm';
    }

    private constructor() {

    }

    async loadAssets() {
        await this.loadThemes();
        await this.loadHighlights();
        await this.loadCustomCSS();
        await this.loadExpertSettings();
        this.isLoaded = true;
    }

    async loadThemes() {
        try {
            // 首先加载内置默认主题
            this.themes = [this.defaultTheme];

            // 检查 themes 目录是否存在
            if (!await this.app.vault.adapter.exists(this.themesPath)) {
                // 目录不存在，尝试创建（用户可能还没下载主题）
                return;
            }

            // 扫描 themes 目录下的所有 CSS 文件
            const files = await this.app.vault.adapter.list(this.themesPath);
            for (const file of files.files) {
                if (file.endsWith('.css')) {
                    const className = file.substring(this.themesPath.length, file.length - 4); // 去掉路径和 .css
                    try {
                        const cssContent = await this.app.vault.adapter.read(file);
                        this.themes.push({
                            name: className,
                            className: className,
                            desc: '',
                            author: '',
                            css: cssContent
                        });
                    } catch (e) {
                        console.warn('读取主题文件失败:', file, e);
                    }
                }
            }
        } catch (error) {
            console.error(error);
            new Notice('加载主题失败！');
        }
    }

    async loadCSS(themes: Theme[]) {
        try {
            for (const theme of themes) {
                const cssFile = this.themesPath + theme.className + '.css';
                const cssContent = await this.app.vault.adapter.read(cssFile);
                if (cssContent) {
                    theme.css = cssContent;
                }
            }
        } catch (error) {
            console.error(error);
            new Notice('读取CSS失败！');
        }
    }

    async loadCustomCSS() {
        try {
            const customCSSNote = NMPSettings.getInstance().customCSSNote;
            if (customCSSNote != '') {
                const file = this.searchFile(customCSSNote);
                if (file) {
                    const cssContent = await this.app.vault.adapter.read(file.path);
                    if (cssContent) {
                        this.customCSS = cssContent.replace(/```css/gi, '').replace(/```/g, '');
                    }
                }
                else {
                    new Notice(customCSSNote + '自定义CSS文件不存在！');
                }
                return;
            }

            if (!await this.app.vault.adapter.exists(this.customCSSPath)) {
                return;
            }

            const cssContent = await this.app.vault.adapter.read(this.customCSSPath);
            if (cssContent) {
                this.customCSS = cssContent;
            }
        } catch (error) {
            console.error(error);
            new Notice('读取CSS失败！');
        }
    }

    async loadExpertSettings() {
        try {
            const note = NMPSettings.getInstance().expertSettingsNote;
            if (note != '') {
                const file = this.searchFile(note);
                if (file) {
                    let content = await this.app.vault.adapter.read(file.path);
                    if (content) {
                        this.expertSettings = expertSettingsFromString(content);
                    }
                    else {
                        this.expertSettings = defaultExpertSettings;
                        new Notice(note + '专家设置文件内容为空！');
                    }
                }
                else {
                    this.expertSettings = defaultExpertSettings;
                    new Notice(note + '专家设置不存在！');
                }
            }
            else {
                this.expertSettings = defaultExpertSettings;
            }
        } catch (error) {
            console.error(error);
            new Notice('读取专家设置失败！');
        }
    }

    async loadHighlights() {
        try {
            // 添加默认高亮（内置 CSS，不依赖网络）
            this.highlights = [{ name: '默认', url: '', css: DefaultHighlightCSS }];

            // 从 CDN 加载其他高亮主题
            for (const [name, url] of Object.entries(CDNHighlights)) {
                const css = await this.fetchHighlightCSS(name, url);
                if (css) {
                    this.highlights.push({ name, url, css });
                }
            }

            // 如果用户有本地高亮主题文件，也加载它们（覆盖 CDN 版本）
            if (await this.app.vault.adapter.exists(this.hilightCfg)) {
                const data = await this.app.vault.adapter.read(this.hilightCfg);
                if (data) {
                    const items = JSON.parse(data);
                    for (const item of items) {
                        const cssFile = this.hilightPath + item.name + '.css';
                        if (await this.app.vault.adapter.exists(cssFile)) {
                            const cssContent = await this.app.vault.adapter.read(cssFile);
                            // 替换已有或添加新的
                            const existing = this.highlights.find(h => h.name === item.name);
                            if (existing) {
                                existing.css = cssContent;
                            } else {
                                this.highlights.push({ name: item.name, url: item.url, css: cssContent });
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error(error);
        }
    }

    private async fetchHighlightCSS(name: string, url: string): Promise<string | null> {
        // 先尝试从本地缓存读取
        const cacheFile = this.hilightPath + name + '.css';
        if (await this.app.vault.adapter.exists(cacheFile)) {
            try {
                return await this.app.vault.adapter.read(cacheFile);
            } catch (e) {
                console.warn(`读取高亮缓存失败: ${name}`);
            }
        }

        // 从 CDN 获取
        try {
            const response = await requestUrl(url);
            const css = response.text;
            // 缓存到本地
            if (css && !css.includes('404')) {
                await this.app.vault.adapter.write(cacheFile, css);
                return css;
            }
        } catch (e) {
            console.warn(`从 CDN 获取高亮失败: ${name}`, e);
        }
        return null;
    }

    async loadIcon(name: string) {
        const icon = this.iconsPath + name + '.svg';
        if (!await this.app.vault.adapter.exists(icon)) {
            return '';
        }
        const iconContent = await this.app.vault.adapter.read(icon);
        if (iconContent) {
            return iconContent;
        }
        return '';
    }

    async loadWasm() {
        if (!await this.app.vault.adapter.exists(this.wasmPath)) {
            return null;
        }
        const wasmContent = await this.app.vault.adapter.readBinary(this.wasmPath);
        if (wasmContent) {
            return wasmContent;
        }
        return null;
    }

    getTheme(themeName: string) {
        if (themeName === '') {
            return this.themes[0];
        }

        for (const theme of this.themes) {
            if (theme.name.toLowerCase() === themeName.toLowerCase() || theme.className.toLowerCase() === themeName.toLowerCase()) {
                return theme;
            }
        }
    }

    getHighlight(highlightName: string) {
        if (highlightName === '') {
            return this.highlights[0];
        }

        for (const highlight of this.highlights) {
            if (highlight.name.toLowerCase() === highlightName.toLowerCase()) {
                return highlight;
            }
        }
    }

    getThemeURL() {
        const version = this.manifest.version;
        return `https://github.com/cat-xierluo/md2wechat/releases/download/${version}/assets.zip`;
    }

    async getStyle() {
        const file = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/styles.css';
        if (!await this.app.vault.adapter.exists(file)) {
            return '';
        }
        const data = await this.app.vault.adapter.read(file);
        if (data) {
            return data;
        }
        return '';
    }

    async downloadThemes() {
        try {
            if (await this.app.vault.adapter.exists(this.themeCfg)) {
                new Notice('主题资源已存在！')
                return;
            }
            const res = await requestUrl(this.getThemeURL());
            const data = res.arrayBuffer;
            await this.unzip(new Blob([data]));
            await this.loadAssets();
            new Notice('主题下载完成！');
        } catch (error) {
            console.error(error);
            await this.removeThemes();
            new Notice('主题下载失败, 请检查网络！');
        }
    }

    async unzip(data:Blob) {
        const zipFileReader = new zip.BlobReader(data);
        const zipReader = new zip.ZipReader(zipFileReader);
        const entries = await zipReader.getEntries();

        if (!await this.app.vault.adapter.exists(this.assetsPath)) {
            await this.app.vault.adapter.mkdir(this.assetsPath);
        }

        for (const entry of entries) {
            if (entry.directory) {
                const dirPath = this.assetsPath + entry.filename;
                await this.app.vault.adapter.mkdir(dirPath);
            }
            else {
                const filePath = this.assetsPath + entry.filename;
                const blobWriter = new zip.Uint8ArrayWriter();
                if (entry.getData) {
                    const data = await entry.getData(blobWriter);
                    await this.app.vault.adapter.writeBinary(filePath, data.buffer as ArrayBuffer);
                }
            }
        }

        await zipReader.close();
    }

    async removeThemes() {
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.themeCfg)) {
                await adapter.remove(this.themeCfg);
            }
            if (await adapter.exists(this.hilightCfg)) {
                await adapter.remove(this.hilightCfg);
            }
            if (await adapter.exists(this.themesPath)) {
                await adapter.rmdir(this.themesPath, true);
            }
            if (await adapter.exists(this.hilightPath)) {
                await adapter.rmdir(this.hilightPath, true);
            }
            await this.loadAssets();
            new Notice('清空完成！');
        } catch (error) {
            console.error(error);
            new Notice('清空主题失败！');
        }
    }

    async openAssets() {
	    const path = require('path');
        const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultRoot = adapter.getBasePath();
		const assets = this.assetsPath;
        if (!await adapter.exists(assets)) {
            await adapter.mkdir(assets);
        }
		const dst = path.join(vaultRoot, assets);
		const { shell } = require('electron');
		shell.openPath(dst);
	}

    searchFile(nameOrPath: string): TAbstractFile | null {
        const resolvedPath = this.resolvePath(nameOrPath);
        const vault= this.app.vault;
        const attachmentFolderPath = vault.config.attachmentFolderPath || '';
        let localPath = resolvedPath;
        let file = null;

        // 先按路径查找
        file = vault.getFileByPath(resolvedPath);
        if (file) {
            return file; 
        }

        // 在根目录查找
        file = vault.getFileByPath(nameOrPath);
        if (file) {
            return file; 
        }

        // 从附件文件夹查找
        if (attachmentFolderPath != '') {
            localPath = attachmentFolderPath + '/' + nameOrPath;
            file = vault.getFileByPath(localPath)
            if (file) {
                return file;
            }

            localPath = attachmentFolderPath + '/' + resolvedPath;
            file = vault.getFileByPath(localPath)
            if (file) {
                return file;
            }
        }

        // 最后查找所有文件，这里只需要判断文件名
        const files = vault.getAllLoadedFiles();
        for (let f of files) {
            if (f instanceof TFolder) continue
            file = f as TFile;
            if (file.basename === nameOrPath || file.name === nameOrPath) {
                return f;
            }
        }

        return null;
    }

    getResourcePath(path: string): {resUrl:string, filePath:string}|null {
        const file = this.searchFile(path) as TFile;
        if (file == null) {
            return null;
        }
        const resUrl = this.app.vault.getResourcePath(file);
        return {resUrl, filePath: file.path};
    }

    resolvePath(relativePath: string): string {
        const basePath = this.getActiveFileDir();
        if (!relativePath.includes('/')) {
            return relativePath;
        }
        const stack = basePath.split("/");
        const parts = relativePath.split("/");
      
        stack.pop(); // Remove the current file name (or empty string)
    
        for (const part of parts) {
            if (part === ".") continue;
            if (part === "..") stack.pop();
            else stack.push(part);
        }
        return stack.join("/");
    }

    getActiveFileDir() {
        const af = this.app.workspace.getActiveFile();
        if (af == null) {
            return '';
        }
        const parts = af.path.split('/');
        parts.pop();
        if (parts.length == 0) {
            return '';
        }
        return parts.join('/');
    }

    async readFileBinary(path: string) {
        const vault= this.app.vault;
        const file = this.searchFile(path) as TFile;
        if (file == null) {
            return null;
        }
        return await vault.readBinary(file);
    }
}