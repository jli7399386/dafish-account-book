# 大肥鱼记账 / dafish-account-book

一个只有记账该有功能的记账软件。**没有广告，没有云同步，没有理财推荐，没有开屏，不要任何账号。**

所有数据只存在这台手机上，不联网、不上传。

> 本项目为个人作品，**保留所有权利**。源码公开仅供查看与学习，未经许可请勿再分发或用于商业用途。

## 它是什么

- 完全离线的 Android 记账应用（WebView + 原生桥，单 Activity）
- 安装包约 300 KB
- 界面是单个 `assets/index.html`，业务逻辑原生侧只做存储与文件

## 功能

| 模块 | 说明 |
|---|---|
| 记一笔 | 收入 / 支出 / 转账；分类、账户、备注、日期 |
| 流水 | 按月浏览、筛选、修改、删除（删除有二次确认） |
| 账户 | 多账户余额；改余额会自动记一笔「余额变更」入流水，可查可删；余额变更不计入收支 |
| 统计 | 月收入 / 月支出 / 结余、分类占比 |
| 名录 | 常用的分类与对象，增删改 |
| 字号 | 小 15 / 标准 17 / 大 20 / 特大 23 / 超大 26，即时生效（这软件一开始就是按"看得清、点得准"做的） |
| 数据 | 本地存储；写失败会回退到文件快照并提示；显示当前占用大小 |

## 构建

需要 `aapt` / `apksigner` / `zipalign` / `d8` / `javac`，以及一个 `android.jar`。

```sh
sh build.sh
```

`android.jar` 路径默认取 `$HOME/android.jar`，可用环境变量覆盖。

**关于签名**：仓库里**不包含签名密钥**（那会把"官方更新"的签名权一并交出去）。
没有密钥也能构建，只是产出未签名包，装不上，仅用于检查编译：

```sh
sh build.sh
# → ./build/...-unsigned.apk
```

要打能覆盖升级的正式包，用你自己的 keystore：

```sh
KS=/path/to/your.keystore DAFISH_KS_PASS=你的密码 sh build.sh
```

密码也可以写进脚本同目录的 `.kspass` 文件（该文件已被 `.gitignore` 排除）。

## 自检脚本

`test_app.mjs` 用 DOM 桩把 `assets/index.html` 里的脚本跑起来，验证记账计算与日期逻辑：

```sh
node test_app.mjs assets/index.html
```

## 目录

```
AndroidManifest.xml
assets/           index.html（全部界面与逻辑）、bg.jpg（背景）
java/             com.dafish.money.MainActivity（存储、文件、弹框宿主）
res/              各密度启动图标
build.sh          构建脚本
test_app.mjs      逻辑自测
```
