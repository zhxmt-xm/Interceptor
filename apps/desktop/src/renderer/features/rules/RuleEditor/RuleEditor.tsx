import {
  Ban,
  Check,
  Code,
  FileText,
  Gauge,
  Globe,
  MapPin,
  MoreHorizontal,
  Pause,
  Plus,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  cx,
  IconButton,
  InputBox,
  MenuItem,
  MethodBadge,
  SectionHeader,
  Select,
  StatusBadge,
  Switch,
} from '../../../components';
import { ActionCard } from '../ActionCard/ActionCard';
import styles from './RuleEditor.module.css';

function RemoveButton(): React.JSX.Element {
  return <IconButton icon={X} label="Remove" size="sm" strokeWidth={2.2} />;
}

function ActionKv({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={cx(styles.optionRow, styles.keyValue)}>
      <div className={cx(styles.label, styles.labelStart)}>{label}</div>
      {children}
    </div>
  );
}

/** Editor for the selected rule: match conditions, actions and validation. */
export function RuleEditor(): React.JSX.Element {
  const [showAddAction, setShowAddAction] = useState(false);

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <span className={styles.name}>Stub /v1/user</span>
        <StatusBadge>Enabled</StatusBadge>
        <Switch checked />
        <IconButton icon={MoreHorizontal} label="More" size="sm" />
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader>Match</SectionHeader>
          <div className={styles.matchRows}>
            <div className={styles.matchRow}>
              <Select>Host</Select>
              <Select>equals</Select>
              <InputBox>api.example.com</InputBox>
              <RemoveButton />
            </div>
            <div className={styles.matchRow}>
              <div className={styles.label}>AND</div>
              <Select>prefix</Select>
              <InputBox>/v1/user</InputBox>
              <RemoveButton />
            </div>
            <div className={styles.matchRow}>
              <div className={styles.label}>AND</div>
              <Select>any of</Select>
              <InputBox>
                <MethodBadge method="get" />
                <MethodBadge method="post" style={{ marginLeft: 6 }} />
              </InputBox>
              <RemoveButton />
            </div>
          </div>
          <button type="button" className={styles.addButton}>
            <Plus size={13} strokeWidth={2} />
            Add condition
          </button>
        </div>

        <div>
          <SectionHeader count={2}>Actions</SectionHeader>
          <div className={styles.actionCards}>
            <ActionCard icon={MapPin} tone="map" title="Map Local" sub="serve file">
              <ActionKv label="Local path">
                <InputBox>
                  <FileText size={14} strokeWidth={1.9} />
                  ~/mocks/user.json
                </InputBox>
              </ActionKv>
              <ActionKv label="Content-Type">
                <InputBox>application/json</InputBox>
              </ActionKv>
              <ActionKv label="Status">
                <InputBox>200</InputBox>
              </ActionKv>
            </ActionCard>

            <ActionCard icon={Code} tone="rewrite" title="Rewrite" sub="response header">
              <div className={cx(styles.optionRow, styles.rewrite)}>
                <Select>Set</Select>
                <Select>Header</Select>
                <InputBox>access-control-allow-origin</InputBox>
                <InputBox>*</InputBox>
              </div>
            </ActionCard>
          </div>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setShowAddAction((value) => !value)}
          >
            <Plus size={13} strokeWidth={2} />
            Add action
          </button>
        </div>

        <div className={styles.validation}>
          <Check size={15} strokeWidth={2} />
          Compiles cleanly · applied at revision 42
        </div>
      </div>

      {showAddAction ? (
        <div className={styles.popover}>
          <div className={styles.popoverTitle}>Add action</div>
          <MenuItem icon={Code} name="Rewrite" hint="header / body / status" />
          <MenuItem icon={MapPin} name="Map Local" hint="added" tag disabled />
          <MenuItem icon={Globe} name="Map Remote" hint="conflict" tag warn disabled />
          <MenuItem icon={Ban} name="Block" hint="drop / synthetic" />
          <MenuItem icon={Gauge} name="Throttle & Delay" hint="bandwidth / latency" />
          <MenuItem icon={Pause} name="Breakpoint" hint="pause & edit" />
          <div className={styles.popoverNote}>
            Map Local &amp; Map Remote are mutually exclusive — a request is either served from a
            local file or rerouted to another origin, not both.
          </div>
        </div>
      ) : null}
    </div>
  );
}
