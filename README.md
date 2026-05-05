# nodebb-plugin-peipe-haa9-feed

Peipe HAA9 NodeBB 4.x plugin.

功能：

- 分类页 HAA9 帖子列表、个人主页主题列表样式。
- 分类页发帖窗口；个人主页不显示发帖按钮。
- 语伴资料 profiles 接口：`/api/peipe-haa9/profiles`，复用用户资料字段和在线缓存池。
- 原生 NodeBB 标签“精华”快捷按钮，选中红色。
- 图片 1/2/3/4 宫格排版和全屏左右滑动浏览。
- 板块 ID 7 内容权限：普通用户可看标题，正文/API 内容仅 `学习小组`、管理员、全局版主可看。
- 多语言：`zh-CN`、`en-GB`、`my-MM`、`vi`。

## GitHub 在线安装

把本目录内容上传到：

```bash
https://github.com/Hurt6465-ai/nodebb-plugin-peipe-haa9-feed
```

在 NodeBB 根目录安装：

```bash
npm install git+https://github.com/Hurt6465-ai/nodebb-plugin-peipe-haa9-feed.git
./nodebb plugin activate nodebb-plugin-peipe-haa9-feed
./nodebb build
./nodebb restart
```

也可以在 ACP -> Extend -> Plugins 启用。

## NPM / nbbpm

`package.json` 已包含：

```json
{
  "nbbpm": {
    "compatibility": "^4.0.0"
  }
}
```

发布到 npm 后，NodeBB Package Manager 才能正常索引。

## 重要说明

- 这个包是正式 NodeBB 插件结构：`plugin.json`、`library.js`、`public/src/client.js`、`public/scss/style.scss`、`languages`。
- 不包含帖子详情页前端代码。
- 不要再同时加载旧 HAA8/HAA9 hotfix、用户主题补丁、独立 CSS，否则可能重复初始化。

