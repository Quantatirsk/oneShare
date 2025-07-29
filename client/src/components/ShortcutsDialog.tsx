import { DocDialog } from './DocDialog';
import { getShortcutText } from '@/lib/platform';

interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
  const shortcutsContent = `# 快捷键指南

## ⌨️ 文件导航快捷键

| 快捷键 | 功能说明 |
|:---:|:---|
| \`↑\` \`↓\` | 在文件列表中上下选择文件 |
| \`←\` | 返回上一级目录 |
| \`→\` | 进入选中的目录 |
| \`Space\` / \`Enter\` | 打开文件或进入目录 |

## 📁 文件操作快捷键

| 快捷键 | 功能说明 |
|:---:|:---|
| \`${getShortcutText('N')}\` | 新建文件 |
| \`${getShortcutText('Shift+N')}\` | 新建目录 |
| \`${getShortcutText('C')}\` | 复制选中文件的直链地址 |
| \`${getShortcutText('S')}\` | 下载选中的文件 |
| \`${getShortcutText('Alt+S')}\` | 分享选中的文件 |
| \`${getShortcutText('D')}\` / \`Delete\` / \`Backspace\` | 删除选中的文件或目录 |
| \`${getShortcutText('V')}\` | 粘贴剪贴板内容上传（文本或文件） |

## 🔄 界面操作快捷键

| 快捷键 | 功能说明 |
|:---:|:---|
| \`${getShortcutText('A')}\` | 全选所有文件 |
| \`Esc\` | 清除选择或关闭模态框 |
| \`F5\` / \`${getShortcutText('R')}\` | 刷新文件列表 |
| \`${getShortcutText('Shift+V')}\` | 切换列表/网格视图模式 |

## ⚙️ 系统功能快捷键

| 快捷键 | 功能说明 |
|:---:|:---|
| \`${getShortcutText(',')}\` | 打开设置 |
| \`${getShortcutText('/')}\` / \`F1\` | 显示快捷键帮助 |

## 📝 编辑器快捷键

| 快捷键 | 功能说明 |
|:---:|:---|
| \`${getShortcutText('S')}\` | 保存文件（在编辑器中） |
| \`Esc\` | 关闭编辑器或模态框 |

## 🖱️ 其他操作

### 拖放操作
- 将文件拖放到页面任意位置进行上传
- 将文件/目录拖拽到目录上可移动文件

### 点击操作
- 点击文件名：打开/编辑文件
- 点击目录名：进入目录
- 点击面包屑：快速导航到指定目录层级
- Shift+点击：范围选择文件

## 💡 提示

- 快捷键在文件列表界面生效，编辑器和模态框中会自动禁用相关快捷键
- 在输入框、编辑器或模态框中时，导航快捷键会被禁用
- Mac 用户：\`⌘\` 键等同于 Windows/Linux 的 \`Ctrl\` 键
- 某些快捷键需要先选中文件才能使用（如复制链接、下载、分享等）`;

  return (
    <DocDialog
      isOpen={isOpen}
      onClose={onClose}
      title="快捷键指南"
      content={shortcutsContent}
      showCopyButton={true}
    />
  );
}