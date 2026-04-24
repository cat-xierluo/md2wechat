# md2wechat

> 基于 [note-to-mp](https://github.com/sunbooshi/note-to-mp) 精简的微信公众号渲染插件

一个 Obsidian 插件，用于将笔记复制到微信公众号编辑器，同时保留样式。

## 功能

- **SVG 远程渲染** - 自动将远程 SVG URL 转换为内联 SVG
- **代码高亮** - 支持多种代码高亮主题
- **Callout 支持** - 支持 Obsidian 的 Callout 语法
- **文件嵌入** - 支持 `![[file.md]]`、`![[file.md#标题]]`、`![[file.md#^段落]]`
- **主题系统** - 自动扫描 `assets/themes/` 目录下的 CSS 文件，无需注册
- **导出 HTML** - 方便排查格式问题

## 安装

1. **关闭 Obsidian 安全模式**：设置 → 第三方插件 → 关闭安全模式
2. **复制插件文件夹**到 `.obsidian/plugins/md2wechat/`
3. **下载主题资源**（可选）：将 CSS 文件放到 `.obsidian/plugins/md2wechat/assets/themes/` 目录

## 使用

1. 点击左侧工具栏图标或 `Ctrl+P` 搜索"复制到公众号"
2. 选择主题和代码高亮样式
3. 点击"复制"按钮
4. 到微信公众号编辑器粘贴

## 目录结构

```
.obsidian/plugins/md2wechat/
├── assets/
│   └── themes/          # 主题目录，放入 CSS 文件即可自动加载
│       ├── my-theme.css
│       └── ...
├── main.js
├── manifest.json
└── styles.css
```

## 自定义 CSS

在插件设置中指定一个笔记名称，该笔记的 CSS 内容会作为自定义样式加载。

## 反馈

问题和建议请提交 [GitHub Issue](https://github.com/cat-xierluo/md2wechat/issues)。
