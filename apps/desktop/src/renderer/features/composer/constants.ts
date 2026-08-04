/**
 * 只有受容器大小影响的区域尺寸才做成可拖拽初始值：Collection 宽度与响应区高度。
 * 行高、控件尺寸、弹层宽度这类结构性尺寸沿用设计稿的固定值，不随窗口变化。
 */

/** Collection 分栏初始宽度（设计稿 216px）与拖拽下限。 */
export const COLLECTION_WIDTH = 216;
export const MIN_COLLECTION_WIDTH = 160;

/** 窗口再窄也要给工作区留出的宽度；Collection 的拖拽上限由它推导。 */
export const MIN_WORK_WIDTH = 480;

/** 分割条轨道宽度/高度。 */
export const SPLITTER_TRACK = 1;

/** 工作区顶部两条固定行的高度，参与响应区拖拽上限计算。 */
export const DOCUMENT_TABS_HEIGHT = 40;
export const URL_BAR_HEIGHT = 56;

/** 响应区初始高度（设计稿 368px）与拖拽下限。 */
export const RESPONSE_HEIGHT = 368;
export const MIN_RESPONSE_HEIGHT = 160;

/** 窗口再矮也要给请求编辑区留出的高度；响应区的拖拽上限由它推导。 */
export const MIN_REQUEST_HEIGHT = 180;

/** Collection 写回 Core 的节流间隔：编辑即生效，但不是每次按键都落库。 */
export const COLLECTION_SAVE_DELAY_MS = 600;

/** Recent sends 只保留最近这些条。 */
export const HISTORY_LIMIT = 20;

/** URL 行的 method 下拉可选值。 */
export const METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

/** method 下拉的 Select 选项。 */
export const METHOD_OPTIONS = METHODS.map((method) => ({
  value: method,
  label: method,
}));

/** 目录操作菜单宽度，菜单定位时用它对齐右边。 */
export const FOLDER_MENU_WIDTH = 190;

/** 目录行高；菜单锚在行下方。 */
export const FOLDER_ROW_HEIGHT = 30;
