# 月亮迟到了 · Moon, Late

一个以「但愿人长久，千里共婵娟」为灵感的 3D 月光接力解谜游戏。山遮住了月亮，玩家转动铜镜、移动小舟，让一束月光依次照亮三扇相隔的窗。

- [在线试玩](https://siuserxiaowei.github.io/moon-late/)
- [项目报告（网页）](https://siuserxiaowei.github.io/moon-late/report.html)
- [五个 Lux3D 3D 模型（GLB）](public/models/)

## 玩法

1. 按住铜镜左右拖动，将光送进东窗。
2. 点击小舟前往亮起的渡口，再转动舟上的铜镜，将光送到对岸。
3. 再次移动小舟到桥渡，让舟镜照向桥镜，再拖动桥镜照亮山寺。
4. 光线对准后稍候片刻。右下角「提示」可协助调整方向；最后一关接近正确角度时会自动吸附。

建议使用支持 WebGL 的桌面浏览器，开启声音并等待素材加载。移动端可以打开，竖屏会裁切部分场景。

## 本地运行

需要 Node.js 和 pnpm。仓库包含游戏所需的 GLB 文件。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

按终端提示访问本地地址。构建及测试：

```bash
pnpm build
node --test tests/mirror-assist.test.js
```

## 实现与素材

游戏使用 Three.js、Vite 与 WebAudio。山、水、火、木模型来自 Aholo Lux3D 的项目素材，经缩放、调色和场景布置后使用；原始月字模型保留在仓库中，最终月牙为程序化图形。铜镜、舟、桥、窗、光束和环境效果由代码实现。声音由 WebAudio 合成。

这是赛事试玩原型。素材和代码的进一步使用应先核实相应权利及平台条款。
