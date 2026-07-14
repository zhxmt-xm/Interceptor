import { Copy, Download, Plus, RefreshCw, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, cx, IconButton, StatusBadge, Switch } from '../../../components';
import styles from './SettingsContent.module.css';

function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>{title}</div>
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.caption}>
        <b>{label}</b>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

/** Right settings pane: the Certificates section content. */
export function SettingsContent(): React.JSX.Element {
  return (
    <div className={styles.content}>
      <h2 className={styles.title}>
        Certificates
        <StatusBadge className={styles.mitm}>MITM active</StatusBadge>
      </h2>
      <div className={styles.desc}>
        Root CA used to decrypt HTTPS. Trust is only ever installed with your explicit consent.
      </div>

      <Group title="Root Certificate Authority">
        <Row label="Status" hint="Generated on this device">
          <StatusBadge>Generated</StatusBadge>
        </Row>
        <Row label="SHA-256 fingerprint">
          <span className={styles.mono}>AB:CD:12:9F:…:73:E1</span>
          <IconButton icon={Copy} label="Copy" size="sm" />
        </Row>
        <Row label="Valid until">
          <span className={styles.mono}>2035-07-10</span>
        </Row>
        <Row label="Certificate file" hint="Export the CA to trust it on another device">
          <Button icon={Download}>Export</Button>
          <Button icon={RefreshCw}>Regenerate</Button>
        </Row>
      </Group>

      <Group title="Trust status">
        <Row label="User store" hint="Current user only">
          <StatusBadge>Trusted</StatusBadge>
        </Row>
        <Row label="System store" hint="All users · requires administrator elevation">
          <span className={cx(styles.mono, styles.monoMuted)}>Not installed</span>
          <Button icon={Shield} variant="primary">
            Install…
          </Button>
        </Row>
      </Group>

      <Group title="HTTPS interception">
        <Row label="Decrypt HTTPS (MITM)" hint="Global switch for TLS interception">
          <Switch checked />
        </Row>
        <Row label="Per-host overrides" hint="api.example.com · *.internal.test">
          <Button icon={Plus}>Add host</Button>
        </Row>
        <Row label="Insecure TLS exceptions" hint="self-signed.local — origin cert not verified">
          <StatusBadge tone="yellow">1 flagged</StatusBadge>
        </Row>
      </Group>
    </div>
  );
}
