# Grok Bot 角色复刻（个人学习）

素材归 xAI / 相应权利人所有，仅供个人学习，请勿商用或再分发。

登录页那个会眨眼的角色不是 GIF / Lottie，是 React 组件 `$_t` + 登录包装 `sd()`。几何和弹簧都在 Grok Bot.app v0.18.0 的主包里。

## 打开

浏览器打开 [`replica/index.html`](./replica/index.html)。

登录页原参数：`sizePx: 64`，`color: "black"`，`shape: "blob"`。  
`pjn(n) = n%2===0 ? idle : cSe[(n-1)/2]`，间隔 1200ms。  
playground 有意从 curious 起播；点「登录轮换」才按 `pjn(0)=idle` 重来。大预览默认开指针跟随，源码默认关。

## 目录

| 路径 | 内容 |
|---|---|
| `replica/index.html` | L1 舞台 |
| `replica/src/` | 拆开的引擎：character / pose / tricks / eyes / fx / math / tables |
| `replica/geometry-data.js` | `u3` 25 眼、`Jo` 18 身形、`snt` 11 色 |
| `replica/grok-blob-idle.svg` | 静态 blob + idle `u3[0]` |
| `extracted/index-UbX-y3il.js` | 主包事实源（约 5.5MB） |
| `extracted/*-raw.js` | 从主包切出的 geometry / state / spring / onboarding 片段 |
| `extract-asar.js` | 从本机 `.app` 再解 asar 的脚本 |
| `assets/icon.iconset/`、`assets/app-icon-256.png` | Dock / 应用内静态商标（不是角色引擎） |

事实源只认主包，不认截图。本机路径：

`/Applications/Grok Bot.app/Contents/Resources/app.asar`  
→ `dist/renderer/assets/index-UbX-y3il.js`

重新抽出：

```bash
node extract-asar.js "/Applications/Grok Bot.app/Contents/Resources/app.asar" /tmp/grok-asar
```

只要主包 JS，不要把整包 asar 再拷进仓库。
