import { Clock } from 'lucide-react';
import { useState } from 'react';

import { Chip, StatusBadge, Tabs } from '../../../components';
import styles from './ResponsePanel.module.css';

const RESPONSE_TABS = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers', count: 18 },
  { id: 'cookies', label: 'Cookies' },
  { id: 'raw', label: 'Raw' },
];

/** Right composer pane: response status, metrics and pretty-printed body. */
export function ResponsePanel(): React.JSX.Element {
  const [tab, setTab] = useState('body');

  return (
    <div className={styles.response}>
      <div className={styles.head}>
        <Chip tone="green">201</Chip>
        <StatusBadge>Created</StatusBadge>
        <span className={styles.spacer} />
        <span className={styles.metric}>
          <Clock size={13} strokeWidth={1.9} />
          142 ms
        </span>
        <span className={styles.metric}>1.2 KB</span>
      </div>

      <Tabs items={RESPONSE_TABS} active={tab} onSelect={setTab} />

      <div className={styles.json}>
        {'{'}&nbsp;
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;id&quot;</span>
        <span className={styles.jsonPunct}>:</span> <span className={styles.jsonNumber}>843102775</span>
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;name&quot;</span>
        <span className={styles.jsonPunct}>:</span>{' '}
        <span className={styles.jsonString}>&quot;interceptor&quot;</span>
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;full_name&quot;</span>
        <span className={styles.jsonPunct}>:</span>{' '}
        <span className={styles.jsonString}>&quot;acme/interceptor&quot;</span>
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;private&quot;</span>
        <span className={styles.jsonPunct}>:</span> <span className={styles.jsonNumber}>true</span>
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;owner&quot;</span>
        <span className={styles.jsonPunct}>:</span> {'{'}&nbsp;
        <span className={styles.jsonKey}>&quot;login&quot;</span>
        <span className={styles.jsonPunct}>:</span> <span className={styles.jsonString}>&quot;acme&quot;</span>
        <span className={styles.jsonPunct}>,</span> <span className={styles.jsonKey}>&quot;id&quot;</span>
        <span className={styles.jsonPunct}>:</span> <span className={styles.jsonNumber}>55</span> {'}'}
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;html_url&quot;</span>
        <span className={styles.jsonPunct}>:</span>{' '}
        <span className={styles.jsonString}>&quot;https://github.com/acme/interceptor&quot;</span>
        <span className={styles.jsonPunct}>,</span>
        <br />
        &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;default_branch&quot;</span>
        <span className={styles.jsonPunct}>:</span> <span className={styles.jsonString}>&quot;main&quot;</span>
        <br />
        {'}'}
      </div>
    </div>
  );
}
