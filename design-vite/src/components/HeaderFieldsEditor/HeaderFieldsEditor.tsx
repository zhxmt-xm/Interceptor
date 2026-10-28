import { Input } from 'antd';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { CollapsibleSection } from '../CollapsibleSection/CollapsibleSection';
import { IconButton } from '../IconButton/IconButton';
import styles from './HeaderFieldsEditor.module.css';

export interface HeaderField {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly ruleEffect?: 'set' | 'append';
}

interface HeaderFieldsEditorProps {
  readonly initialFields: readonly HeaderField[];
  readonly title: string;
  readonly effectPlacement?: 'inline' | 'below';
}

export function HeaderFieldsEditor({
  initialFields,
  title,
  effectPlacement = 'inline',
}: HeaderFieldsEditorProps): React.JSX.Element {
  const [fields, setFields] = useState<HeaderField[]>([...initialFields]);
  const [open, setOpen] = useState(true);
  const updateField = (id: string, key: 'name' | 'value', value: string): void => {
    setFields((current) => current.map((field) =>
      field.id === id ? { ...field, [key]: value } : field));
  };

  return (
    <CollapsibleSection
      badge={{ label: String(fields.length), tone: 'neutral' }}
      open={open}
      title={title}
      onOpenChange={setOpen}
    >
      <div className={styles.headerFieldsEditorRows}>
        {fields.map((field) => (
          <div
            className={styles.headerFieldsEditorRow}
            data-effect-placement={effectPlacement}
            key={field.id}
          >
            <Input
              aria-label="Header name"
              className={styles.headerFieldsEditorInput}
              value={field.name}
              onChange={(event) => updateField(field.id, 'name', event.target.value)}
            />
            <Input
              aria-label="Header value"
              className={styles.headerFieldsEditorInput}
              value={field.value}
              onChange={(event) => updateField(field.id, 'value', event.target.value)}
            />
            <span className={styles.headerFieldsEditorEffectSlot}>
              {field.ruleEffect ? (
                <span
                  className={styles.headerFieldsEditorEffect}
                  data-effect={field.ruleEffect}
                >
                  {field.ruleEffect === 'append' ? 'Rule appended' : 'Rule set'}
                </span>
              ) : null}
            </span>
            <IconButton
              label="Remove header"
              icon={<X aria-hidden="true" />}
              onClick={() => setFields((current) => current.filter((candidate) => candidate.id !== field.id))}
            />
          </div>
        ))}
      </div>
      <button
        className={styles.headerFieldsEditorAdd}
        type="button"
        onClick={() => setFields((current) => [
          ...current,
          { id: `header-${current.length}`, name: '', value: '' },
        ])}
      >
        <Plus aria-hidden="true" />
        Add header
      </button>
    </CollapsibleSection>
  );
}
