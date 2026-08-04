import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '../../../components/Checkbox/Checkbox';
import { cx } from '../../../components/share/cx';
import type { ComposerFieldRow } from '../interfaces';
import { emptyFieldRow } from '../utils';

import styles from './KeyValueTable.module.css';

export interface KeyValueTableProps {
  rows: readonly ComposerFieldRow[];
  onChange: (rows: ComposerFieldRow[]) => void;
  nameLabel: string;
  valueLabel: string;
}

/** Query / Headers / Form 三处共用的键值编辑表；末行是待确认的草稿行。 */
export function KeyValueTable({
  rows,
  onChange,
  nameLabel,
  valueLabel,
}: KeyValueTableProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ name: '', value: '' });
  const canConfirm = draft.name.trim() !== '';

  const patchRow = (id: string, patch: Partial<ComposerFieldRow>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const confirmDraft = (): void => {
    if (!canConfirm) {
      return;
    }
    onChange([...rows, { ...emptyFieldRow(), ...draft }]);
    setDraft({ name: '', value: '' });
  };

  return (
    <div className={styles.table}>
      <div className={styles.head}>
        <span />
        <span>{nameLabel}</span>
        <span>{valueLabel}</span>
        <span />
      </div>

      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <Checkbox
            checked={row.enabled}
            onChange={(enabled) => patchRow(row.id, { enabled })}
          />
          <input
            className={cx(styles.field, styles.name)}
            value={row.name}
            aria-label={nameLabel}
            spellCheck={false}
            onChange={(event) => patchRow(row.id, { name: event.target.value })}
          />
          <input
            className={cx(styles.field, styles.value)}
            value={row.value}
            aria-label={valueLabel}
            spellCheck={false}
            onChange={(event) => patchRow(row.id, { value: event.target.value })}
          />
          <button
            type="button"
            className={styles.remove}
            aria-label={t('composer.removeRow')}
            onClick={() => onChange(rows.filter((other) => other.id !== row.id))}
          >
            <X strokeWidth={2.2} />
          </button>
        </div>
      ))}

      <div className={styles.row}>
        <Checkbox checked={false} />
        <input
          className={cx(styles.field, styles.name)}
          value={draft.name}
          placeholder={nameLabel}
          aria-label={nameLabel}
          spellCheck={false}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          onKeyDown={(event) => event.key === 'Enter' && confirmDraft()}
        />
        <input
          className={cx(styles.field, styles.value)}
          value={draft.value}
          placeholder={valueLabel}
          aria-label={valueLabel}
          spellCheck={false}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          onKeyDown={(event) => event.key === 'Enter' && confirmDraft()}
        />
        <button
          type="button"
          className={styles.confirm}
          aria-label={t('composer.addRow')}
          disabled={!canConfirm}
          onClick={confirmDraft}
        >
          <Check strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
