# CREDITS 署名与授权

本项目为自托管 3D 交互画廊。除下方声明外，其余代码与素材均由本项目作者编写/制作。

## 3D 角色模型

| 项目 | 说明 |
| --- | --- |
| 模型 | Si（シ / 终末地管理员） |
| 出处 | 《明日方舟：终末地》(Arknights: Endfield) 官方公开模型 |
| 授权 | **CC BY 4.0**（Creative Commons Attribution 4.0 International） |
| 许可链接 | https://creativecommons.org/licenses/by/4.0/ |
| 本地文件 | `public/models/avatar/`（运行时从 CDN 拉取 `models/avatar/si.glb`） |
| 处理 | 原始 glTF 经 `@gltf-transform` 做 prune/dedup，贴图 2048→1024 降采样后打包为单一 GLB（约 7.7 MB，无 Draco 压缩以保证运行时兼容性） |

依 CC BY 4.0 要求，此处署名：

> **Si** 模型版权归 Shanghai Hypergryph Network Technology Co., Ltd.（上海鹰角网络科技有限公司）及其授权方所有，
> 以 **CC BY 4.0** 协议发布。本项目仅做格式转换、贴图降采样与展示用途，非商业发布，不代表官方立场。

CC BY 4.0 要求转载/二次分发时保留本署名文件，请一并携带本 `CREDITS.md`。

## 字体

| 字体 | 用途 | 授权状态 |
| --- | --- | --- |
| Sabon / Sabon Next LT | 开屏标题、正文衬线 | 商业字体，**授权由站点运营者自行解决** |
| Shipley | 开屏副标题斜体 | 商业字体，**授权由站点运营者自行解决** |

字体文件位于 `public/fonts/`，属用户自行提供的授权副本。若未持有对应授权，请替换为开源替代
（如 EB Garamond、Cormorant Garamond、Noto Serif SC）并修改 `src/ui/opening-bg.js` 中的 `@font-face` 声明。

## 其他

- **Three.js**（MIT）— 3D 渲染引擎，随构建打包。
- 其余场景素材（纸质地形、展厅外壳、UI 图标等）为本项目程序化生成或手绘，无第三方授权约束。
