# C 盘清理控制台

这是一个给 Windows C 盘做“先分析、再清理”的本地小工具和静态网页。网页负责展示磁盘占用、清理候选和风险边界；PowerShell 脚本负责在本机分析或清理。

## 为什么不是纯网页一键删除

浏览器里的 GitHub Pages 网页不能直接删除你电脑上的文件，这是安全限制，也是好事。因此本项目采用：

- `index.html`：可发布到 GitHub Pages 的可视化报告页。
- `scripts/analyze-cdrive.ps1`：只读扫描 C 盘，默认生成本地私有报告 `reports/cdrive-report.local.json`。
- `scripts/clean-cdrive.ps1`：清理低风险缓存，默认 dry-run，不加 `-Execute` 不会删除。

## 当前机器扫描结论

- C: 总容量约 398.71 GB，当前可用约 44.58 GB，可用比例约 11.18%。
- 最大目录是 `C:\Users`，约 219.13 GB，不应整体删除。
- 用户临时目录 `C:\Users\User\AppData\Local\Temp` 约 22.09 GB，是优先清理目标。
- pip 缓存约 6.65 GB，`.cache` 约 3.57 GB，NuGet 缓存约 3.21 GB。
- `hiberfil.sys` 约 31.94 GB，关闭休眠可释放，但会禁用休眠/快速启动。
- WSL `ext4.vhdx` 约 32.62 GB，需要在 WSL 内清理或导出重建，不能直接删除。

## 使用方式

先分析：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\analyze-cdrive.ps1
```

如果想让网页读取最新本机报告，可以显式输出到网页数据文件：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\analyze-cdrive.ps1 -OutputPath .\reports\cdrive-report.json
```

先 dry-run，看会清理什么：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\clean-cdrive.ps1 -IncludeBrowserCache -IncludePipCache
```

确认日志没问题后执行真实清理：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\clean-cdrive.ps1 -Execute -IncludeBrowserCache -IncludePipCache
```

可选清空回收站：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\clean-cdrive.ps1 -Execute -IncludeRecycleBin
```

## 自动清理范围

自动脚本只处理低风险缓存：

- 用户临时目录中 24 小时前的文件
- Windows 临时目录中 24 小时前的文件
- Windows 缩略图缓存
- 可选浏览器缓存
- 可选 pip 缓存
- 可选回收站

## 不会自动删除

- `C:\Users` 整体目录
- 文档、视频、桌面、下载等真实用户文件
- `C:\Program Files` 和 `C:\Program Files (x86)`
- `C:\Windows` 系统文件
- WSL 虚拟磁盘
- `hiberfil.sys`、`pagefile.sys`、`swapfile.sys`
- 模型权重和大型开发依赖缓存

## GitHub 上的参考项目

- [BleachBit](https://github.com/bleachbit/bleachbit)：成熟开源清理工具，可参考清理边界。
- [Chris Titus Tech WinUtil](https://github.com/ChrisTitusTech/winutil)：Windows 优化工具集，可参考系统维护入口。
- GitHub 上也有不少低星 PowerShell 清理脚本，但质量差异大，本项目优先采用 dry-run 和白名单清理策略。

## 发布到 GitHub Pages

推送到 GitHub 后，在仓库 Settings -> Pages 中选择 `main` 分支根目录即可。页面能直接展示脱敏快照；如果要展示最新扫描结果，重新运行 `scripts/analyze-cdrive.ps1 -OutputPath .\reports\cdrive-report.json` 后再提交，但公开前应检查是否包含电脑名、用户名和完整本机路径。
