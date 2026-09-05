# mili 球形桌宠（Windows 原型）

这是一个透明、无边框、置顶的 Electron 桌宠窗口。空闲时只显示球形宠物，点击后展开对话；右键球体可以打开托盘菜单。

## 本地运行

```powershell
npm install
npm start
```

本机需要先安装并配置 WSL2 Ubuntu 里的 Hermes。桌宠会调用：

```text
wsl.exe -d Ubuntu -u hermes -- /home/hermes/.local/bin/hermes -z ...
```

聊天记录、人格和记忆保存在 Electron 的用户数据目录，不会写入仓库。

## 打包

```powershell
npm run dist
```

`electron-builder` 的 Windows 构建输出在 `release/`。源码运行和 `npm run pack` 使用本地 Electron 分发包，不依赖再次下载 Electron；如果需要便携版/安装器，网络可用时执行 `npm run dist`。

当前原型优先支持本机 Hermes 文字对话；网页版本的服务器多图链路保持不变，桌面端的服务器回退和本地图像输入会在下一步接入。
