import process from 'node:process';

interface ParentPort {
  on(event: 'message', listener: (event: unknown) => void): void;
  postMessage(message: CoreMessage): void;
}

type CoreMessage =
  | {
      type: 'ready';
      pid: number;
      startedAt: string;
    }
  | {
      type: 'heartbeat';
      pid: number;
      timestamp: string;
    }
  | {
      type: 'health';
      correlationId: string;
      pid: number;
      timestamp: string;
    }
  | {
      type: 'stopped';
      pid: number;
      timestamp: string;
    };

type ParentMessage =
  | {
      type: 'health-check';
      correlationId: string;
    }
  | {
      type: 'shutdown';
    };

const HEARTBEAT_INTERVAL_MS = 1_000;

const parentPort = (
  process as NodeJS.Process & { parentPort?: ParentPort }
).parentPort;

if (!parentPort) {
  process.stderr.write('Proxy Core requires a managed parent port.\n');
  process.exitCode = 1;
} else {
  startCore(parentPort);
}

function startCore(port: ParentPort): void {
  const startedAt = new Date().toISOString();
  let stopping = false;

  const sendHeartbeat = (): void => {
    port.postMessage({
      type: 'heartbeat',
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
  };

  const stop = (): void => {
    if (stopping) {
      return;
    }

    stopping = true;
    clearInterval(heartbeatTimer);
    port.postMessage({
      type: 'stopped',
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
    setImmediate(() => process.exit(0));
  };

  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  port.on('message', (event) => {
    const message = readParentMessage(event);

    if (!message) {
      return;
    }

    if (message.type === 'shutdown') {
      stop();
      return;
    }

    port.postMessage({
      type: 'health',
      correlationId: message.correlationId,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
  });

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  port.postMessage({
    type: 'ready',
    pid: process.pid,
    startedAt,
  });
  sendHeartbeat();
}

function readParentMessage(event: unknown): ParentMessage | null {
  const message =
    isRecord(event) && 'data' in event ? event.data : event;

  if (!isRecord(message) || typeof message.type !== 'string') {
    return null;
  }

  if (message.type === 'shutdown') {
    return { type: 'shutdown' };
  }

  if (
    message.type === 'health-check' &&
    typeof message.correlationId === 'string'
  ) {
    return {
      type: 'health-check',
      correlationId: message.correlationId,
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}