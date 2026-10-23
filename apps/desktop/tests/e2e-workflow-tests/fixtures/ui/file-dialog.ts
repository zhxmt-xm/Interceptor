import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';
import { screenshotNativeDialog, screenshotStep } from '../runtime/step-screenshots';
import { cancelMacosFileDialog, submitMacosFileDialogPath } from './macos-file-dialog';
import { cancelWindowsFileDialog, submitWindowsFileDialogPath } from './windows-file-dialog';

export async function submitFileDialogPath(owner: WorkflowProcessIdentity, targetPath: string): Promise<void> {
  switch (process.platform) {
    case 'win32':
      return submitWindowsFileDialogPath(owner, targetPath, () => screenshotNativeDialog(
        '选择本次文件位置 / Choose this operation’s file location',
      ));
    case 'darwin':
      return submitMacosFileDialogPath(owner, targetPath, () => screenshotNativeDialog(
        '选择本次文件位置 / Choose this operation’s file location',
      ));
    default: throw new Error('Native file dialogs are not supported on this workflow platform.');
  }
}

export async function cancelFileDialog(owner: WorkflowProcessIdentity): Promise<void> {
  switch (process.platform) {
    case 'win32': await cancelWindowsFileDialog(owner); break;
    case 'darwin': await cancelMacosFileDialog(owner); break;
    default: throw new Error('Native file dialogs are not supported on this workflow platform.');
  }
  await screenshotStep('取消文件选择后返回App / Return to the App after cancelling file selection');
}