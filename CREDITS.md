# CREDITS 署名与授权

本项目为自托管 3D 交互画廊。除下方声明外，其余代码与素材均由本项目作者编写/制作。

## 3D 建筑模型（第一代主展厅外壳）

| 项目 | 说明 |
| --- | --- |
| 模型 | modern luxury wedding arch house building design（婚礼拱廊建筑） |
| 出处 | Sketchfab · zigurat architecture studio（@ziguratarchitecturestudio） |
| 模型页 | https://sketchfab.com/3d-models/modern-luxury-wedding-arch-house-building-design-42f122f0fef34eff9b217e25a6f4b300 |
| 授权 | **CC BY 4.0**（Creative Commons Attribution 4.0 International，Sketchfab "CC Attribution"） |
| 许可链接 | https://creativecommons.org/licenses/by/4.0/ |
| 本地文件 | `models/hall/wedding-arch.glb`（约 8.4 MB） |
| 处理 | 原始 3ds Max 源文件经 Blender 转换为 GLB，贴图降采样至 1024，去 ortho 相机/灯光；游戏内按 36/27.6 等比缩放并三段实例化沿 z 覆盖全馆 |

依 CC BY 4.0 要求，此处署名：

> **modern luxury wedding arch house building design** 模型版权归 **zigurat architecture studio** 所有，
> 以 **CC BY 4.0** 协议发布（https://creativecommons.org/licenses/by/4.0/）。
> 本项目仅做格式转换、缩放与展示用途，非商业发布。

CC BY 4.0 要求转载/二次分发时保留本署名文件，请一并携带本 `CREDITS.md`。

## 3D 装饰模型（户外四座喷泉）

| 项目 | 说明 |
| --- | --- |
| 模型 | Zsolnay Fountain（布达佩斯千年之家旁喷泉，Zsolnay 瓷厂 1884–85 年炻器装饰） |
| 出处 | Sketchfab · georgiyhazankin（@georgiyhazankin） |
| 模型页 | https://sketchfab.com/3d-models/zsolnay-fountain-a3d182f3e0fb44dcbec52a60eba591dc |
| 授权 | **CC BY 4.0**（Creative Commons Attribution 4.0 International，Sketchfab "CC Attribution"） |
| 许可链接 | https://creativecommons.org/licenses/by/4.0/ |
| 本地文件 | `models/hall/zsolnay-fountain.glb`（约 6.6 MB） |
| 处理 | 原始 GLB 经 Blender 5.2 重导出：贴图 8192²→2048²（22.3 MB→6.6 MB），几何保持 19.76 万面未减面；游戏内缩放到直径 6 m，四座共享一份几何（clone 复用 geometry/material），按沙漠地形逐点落地 |

依 CC BY 4.0 要求，此处署名：

> **Zsolnay Fountain** 模型版权归 **georgiyhazankin** 所有，
> 以 **CC BY 4.0** 协议发布（https://creativecommons.org/licenses/by/4.0/）。
> 本项目仅做格式转换、贴图降采样、缩放与展示用途，非商业发布。

四座喷泉布置（2026-09-03）：南 `(0, 42)` 位于原户外白板原址，北 `(0, -26)`、东 `(32, 8)`、西 `(-32, 8)`
按距建筑边缘 14 m 的相对关系对称分布；水池为实心石结构，已加碰撞（透明玻璃类一律不挡）。

CC BY 4.0 要求转载/二次分发时保留本署名文件，请一并携带本 `CREDITS.md`。

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

## B612 剧情模型（2026-09-07）

| 项目 | 说明 |
| --- | --- |
| 模型 | The Chibi Prince（Q 版小王子） |
| 出处 | Sketchfab（作者名待补——待主人提供模型页链接后补全） |
| 授权 | **CC BY 4.0**（Creative Commons Attribution 4.0 International，主人确认"署名即可随意使用"） |
| 本地文件 | `models/b612/chibi-prince.glb`（约 2.9 MB） |
| 处理 | 等比归一化至身高 0.8m；原始模型无骨骼动画，走近/待机动效为程序化跳步与轻息 |

| 项目 | 说明 |
| --- | --- |
| 模型 | Piper PA-18（坠机残骸用真机模型） |
| 出处 | Sketchfab（作者名待补——待主人提供模型页链接后补全） |
| 授权 | **CC BY 4.0**（Creative Commons Attribution 4.0 International，主人确认"署名即可随意使用"） |
| 本地文件 | `models/b612/piper-pa18.glb`（约 1.7 MB） |
| 处理 | 保持真机比例（翼展 10.7m）；姿态调整为机头下俯扎沙、侧倾半埋作坠机残骸，机身加实心碰撞 |

依 CC BY 4.0 要求，转载/二次分发时保留本署名文件，请一并携带本 `CREDITS.md`。
