import { Send, X } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Checkbox,
  Count,
  cx,
  IconButton,
  InputBox,
  MethodBadge,
  Segmented,
  Select,
  Tabs,
} from '../../../components';
import { HEADERS } from '../data';
import styles from './RequestBuilder.module.css';

const REQUEST_TABS = [
  { id: 'headers', label: 'Headers', count: 4 },
  { id: 'query', label: 'Query' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
];

/** Left composer pane: method + URL, protocol and the request tabs/headers. */
export function RequestBuilder(): React.JSX.Element {
  const [tab, setTab] = useState('headers');
  const [protocol, setProtocol] = useState('Auto');

  return (
    <div className={styles.builder}>
      <div className={styles.urlrow}>
        <Select className={styles.method}>
          <MethodBadge method="post" />
        </Select>
        <InputBox className={styles.url}>
          <span className={styles.scheme}>https://</span>api.github.com/user/repos
        </InputBox>
        <Button icon={Send} variant="primary">
          Send
        </Button>
      </div>

      <div className={styles.subrow}>
        <span className={styles.protocolLabel}>Protocol</span>
        <Segmented options={['Auto', 'HTTP/1.1', 'HTTP/2']} value={protocol} onChange={setProtocol} />
        <span className={styles.spacer} />
        <Count>TLS 1.3 · h2</Count>
      </div>

      <Tabs items={REQUEST_TABS} active={tab} onSelect={setTab} />

      <div className={styles.headers}>
        <div className={styles.head}>
          <span />
          <span>Name</span>
          <span>Value</span>
          <span />
        </div>
        {HEADERS.map((header, index) => (
          <div key={index} className={styles.row}>
            <Checkbox checked={header.on} />
            <span className={styles.name}>{header.name}</span>
            <span className={styles.value}>{header.value}</span>
            <IconButton icon={X} label="Remove" size="sm" strokeWidth={2.2} />
          </div>
        ))}
        <div className={cx(styles.row, styles.add)}>
          <Checkbox checked={false} />
          <span className={styles.name}>Add header…</span>
          <span className={styles.value} />
          <span />
        </div>
      </div>
    </div>
  );
}
