# 启动器（电子秤服务.exe）

源码：`StatusForm.cs`（WinForms，.NET Framework 4.x）

## 功能

- 无黑窗拉起同目录 `node.exe src\index.js`
- 宽屏左右布局（约 920×560）：左栏运行状态 + 当前秤配置（两列核对），右栏本机监听与 WMS 配置
- 状态：MAC、串口、连接客户端数、重量、错误、运行状态
- 当前秤配置（核对用，只读，轮询 `/status`）：配置来源(WMS/本地缓存/热更新/未加载)、工位名、COM、波特率、数据位/校验/停止位、协议、version、启用
- 配置区：页面请求地址/端口/完整地址、查询网卡/状态/下发串口/试读重量路径、网页接收重量地址/端口、**向WMS查询秤配置的地址** / 请求方法 / 传MAC参数名 / **WMS Basic 用户名·密码**（用户名非空则带 Basic 鉴权）
- 「保存并重启服务」写入 `src\defaults.json` 后杀旧 node 再启动（启动时桥接自拉 WMS；状态窗轮询改用新 base/paths）

## 编译（发布目录）

在开发机，于**源码根目录**执行：

```bat
cd /d <源码根目录>
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
set REF=/reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll
"%CSC%" /nologo /target:winexe /out:dist\ScaleBridge\电子秤服务.exe %REF% /utf8output launcher\StatusForm.cs
copy /y dist\ScaleBridge\电子秤服务.exe dist\ScaleBridge\ScaleBridge.exe
```

`defaults.json` 与 node 共用，位于发布目录 `dist\ScaleBridge\src\defaults.json`。
