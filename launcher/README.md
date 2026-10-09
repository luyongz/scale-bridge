# 启动器（电子秤服务.exe）

源码：`StatusForm.cs`（WinForms，.NET Framework 4.x）

## 功能

- 无黑窗拉起同目录 `node.exe src\index.js`
- 状态：MAC、串口、连接客户端数、重量、错误、运行状态
- 配置区（给装箱网页调用，非串口COM）：页面请求地址/端口/完整地址、查询网卡/状态/下发串口/试读重量路径、网页接收重量地址/端口
- 「保存并重启服务」写入 `src\defaults.json` 后杀旧 node 再启动；轮询改用新 base/paths

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
