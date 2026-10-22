/** 控制会话实际协商的协议能力，不表示VPN是否启动。 */
export type InspectionCapability = 'http' | 'websocket';

/** 已校验的v2控制hello，不携带exchange身份或客户端自选凭据。 */
export interface InspectionHelloMessage {
  type: 'session.hello';
  protocolVersion: 2;
  appVersion: string;
  capabilities: InspectionCapability[];
}

/** 单个控制会话的数据授权，返回调用方时复制能力列表。 */
export interface InspectionSessionCredentials {
  sessionId: string;
  sessionToken: string;
  capabilities: InspectionCapability[];
}

/** 调用方确认设备pin及PC安装身份后交给Core的单设备入口配置。 */
export interface AndroidIngressOptions {
  identity: { key: string; cert: string };
  devicePin: string;
}

/** 仅由Core拥有的设备回环入口地址。 */
export interface AndroidIngressAddress {
  host: '127.0.0.1';
  port: number;
}
