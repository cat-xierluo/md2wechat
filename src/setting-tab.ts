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

import { App, PluginSettingTab, Setting } from 'obsidian';
import NoteToMpPlugin from './main';
import { NMPSettings } from './settings';

export class NoteToMpSettingTab extends PluginSettingTab {
	plugin: NoteToMpPlugin;
	settings: NMPSettings;

	constructor(app: App, plugin: NoteToMpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = NMPSettings.getInstance();
	}

	display() {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: '插件设置'});

		new Setting(containerEl)
			.setName('默认样式')
			.addDropdown(dropdown => {
                const styles = this.plugin.assetsManager.themes;
                for (let s of styles) {
				    dropdown.addOption(s.className, s.name);
                }
				dropdown.setValue(this.settings.defaultStyle);
                dropdown.onChange(async (value) => {
					this.settings.defaultStyle = value;
					await this.plugin.saveSettings();
                });
			});

		new Setting(containerEl)
			.setName('代码高亮')
			.addDropdown(dropdown => {
                const styles = this.plugin.assetsManager.highlights;
                for (let s of styles) {
				    dropdown.addOption(s.name, s.name);
                }
				dropdown.setValue(this.settings.defaultHighlight);
                dropdown.onChange(async (value) => {
					this.settings.defaultHighlight = value;
					await this.plugin.saveSettings();
                });
			});

		new Setting(containerEl)
			.setName('在工具栏展示样式选择')
			.setDesc('建议在移动端关闭，可以增大文章预览区域')
			.addToggle(toggle => {
			    toggle.setValue(this.settings.showStyleUI);
				toggle.onChange(async (value) => {
				    this.settings.showStyleUI = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('链接展示样式')
			.addDropdown(dropdown => {
				dropdown.addOption('inline', '内嵌');
			    dropdown.addOption('footnote', '脚注');
				dropdown.setValue(this.settings.linkStyle);
				dropdown.onChange(async (value) => {
				    this.settings.linkStyle = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('文件嵌入展示样式')
			.addDropdown(dropdown => {
				dropdown.addOption('quote', '引用');
			    dropdown.addOption('content', '正文');
				dropdown.setValue(this.settings.embedStyle);
				dropdown.onChange(async (value) => {
				    this.settings.embedStyle = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('显示代码行号')
			.addToggle(toggle => {
			    toggle.setValue(this.settings.lineNumber);
				toggle.onChange(async (value) => {
				    this.settings.lineNumber = value;
					await this.plugin.saveSettings();
				});
			})

		new Setting(containerEl)
			.setName('启用空行渲染')
			.addToggle(toggle => {
			    toggle.setValue(this.settings.enableEmptyLine);
				toggle.onChange(async (value) => {
				    this.settings.enableEmptyLine = value;
					await this.plugin.saveSettings();
				});
			})

		new Setting(containerEl)
			.setName('渲染图片标题')
			.addToggle(toggle => {
				toggle.setValue(this.settings.useFigcaption);
				toggle.onChange(async (value) => {
					this.settings.useFigcaption = value;
					await this.plugin.saveSettings();
				});
			})

		new Setting(containerEl)
			.setName('清空主题')
			.addButton(button => {
			    button.setButtonText('清空');
				button.onClick(async () => {
					await this.plugin.assetsManager.removeThemes();
					this.settings.resetStyelAndHighlight();
					await this.plugin.saveSettings();
				});
			})
	}
}
