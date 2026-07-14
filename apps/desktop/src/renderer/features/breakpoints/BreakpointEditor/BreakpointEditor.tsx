import { Clock, Play, Slash, X } from 'lucide-react';

import { Button, Chip, IconButton, SectionHeader } from '../../../components';
import { BP_HEADERS } from '../data';
import styles from './BreakpointEditor.module.css';

/** Right breakpoints pane: editable headers/body for the paused request. */
export function BreakpointEditor(): React.JSX.Element {
  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <Chip>POST</Chip>
        <span className={styles.url}>
          <span className={styles.dom}>shop.example.com</span>
          <span className={styles.pth}>/checkout</span>
        </span>
        <span className={styles.phase}>Request paused</span>
        <span className={styles.countdown}>
          <Clock size={13} strokeWidth={1.9} />
          0:24
        </span>
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader count="editable">Headers</SectionHeader>
          <div className={styles.headerHead}>
            <span>Name</span>
            <span>Value</span>
            <span />
          </div>
          {BP_HEADERS.map((header, index) => (
            <div key={index} className={styles.headerRow}>
              <span className={styles.name}>{header.name}</span>
              <span className={styles.value}>{header.value}</span>
              <IconButton icon={X} label="Remove" size="sm" strokeWidth={2.2} />
            </div>
          ))}
        </div>

        <div>
          <SectionHeader count="json · editable">Body</SectionHeader>
          <div className={styles.body}>
            {'{'}&nbsp;<span className={styles.jsonKey}>&quot;cart&quot;</span>
            <span className={styles.jsonPunct}>:</span>{' '}
            <span className={styles.jsonString}>&quot;c_9f83a1&quot;</span>
            <span className={styles.jsonPunct}>,</span>{' '}
            <span className={styles.jsonKey}>&quot;total&quot;</span>
            <span className={styles.jsonPunct}>:</span> <span className={styles.jsonNumber}>4200</span>
            <span className={styles.jsonPunct}>,</span>{' '}
            <span className={styles.jsonKey}>&quot;currency&quot;</span>
            <span className={styles.jsonPunct}>:</span>{' '}
            <span className={styles.jsonString}>&quot;USD&quot;</span>
            <span className={styles.jsonPunct}>,</span>{' '}
            <span className={styles.jsonKey}>&quot;coupon&quot;</span>
            <span className={styles.jsonPunct}>:</span>{' '}
            <span className={styles.jsonString}>&quot;DEBUG50&quot;</span> {'}'}
          </div>
        </div>
      </div>

      <div className={styles.foot}>
        <Button icon={Slash} variant="danger">
          Drop
        </Button>
        <span className={styles.spacer} />
        <Button>Continue unmodified</Button>
        <Button icon={Play} variant="primary">
          Execute edited
        </Button>
      </div>
    </div>
  );
}
