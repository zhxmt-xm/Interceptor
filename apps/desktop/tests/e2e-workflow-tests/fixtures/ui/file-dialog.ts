import type { WorkflowProcessIdentity } from '../safety/workflow-host-safety-guard';
import { cancelMacosFileDialog, submitMacosFileDialogPath } from './macos-file-dialog';
import { cancelWindowsFileDialog, submitWindowsFileDialogPath } from './windows-file-dialog';

export function submitFileDialogPath(owner: WorkflowProcessIdentity, targetPath: string): Promise<void> {
  switch (process.platform) {
    case 'win32': return submitWindowsFileDialogPath(owner, targetPath);
    case 'darwin': return submitMacosFileDialogPath(owner, targetPath);
    default: throw new Error('Native file dialogs are not supported on this workflow platform.');
  }
}

export function cancelFileDialog(owner: WorkflowProcessIdentity): Promise<void> {
  switch (process.platform) {
    case 'win32': return cancelWindowsFileDialog(owner);
    case 'darwin': return cancelMacosFileDialog(owner);
    default: throw new Error('Native file dialogs are not supported on this workflow platform.');
  }
}