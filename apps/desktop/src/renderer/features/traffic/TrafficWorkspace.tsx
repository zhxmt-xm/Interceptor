import styles from './TrafficWorkspace.module.css';

import {
  AppstoreOutlined,
  BranchesOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { ConfigProvider, Splitter, Tabs, Typography } from 'antd';
import { useState } from 'react';

import {
  ToolIconButton,
  ToolSegmentedControl,
} from '../../components/tool-controls';

type TrafficView = 'structure' | 'sequence';
type RequestTab = 'overview' | 'headers' | 'query' | 'cookies' | 'raw';
type ResponseTab = 'body' | 'headers' | 'cookies' | 'raw';

export function TrafficWorkspace(): React.JSX.Element {
  const [trafficView, setTrafficView] = useState<TrafficView>('structure');
  const [requestTab, setRequestTab] = useState<RequestTab>('overview');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');

  return (
    <div className={styles.workbenchFrame}>
      <Splitter className={styles.workbench}>
        <Splitter.Panel defaultSize="35%" min="300px" max="48%">
          <section className={styles.requestBrowser} aria-label="Traffic browser">
          <div className={styles.browserHeading}>
            <div className={styles.browserTitle}>
              <Typography.Text strong>Traffic</Typography.Text>
              <span className={styles.itemCount}>0</span>
            </div>
            <ToolSegmentedControl<TrafficView>
              className={styles.viewSwitcher}
              label="Traffic view"
              controlSize="compact"
              value={trafficView}
              onChange={setTrafficView}
              options={[
                {
                  value: 'structure',
                  label: 'Structure view',
                  icon: <BranchesOutlined />,
                },
                {
                  value: 'sequence',
                  label: 'Sequence view',
                  icon: <UnorderedListOutlined />,
                },
              ]}
            />
          </div>

          <div className={styles.columnHeader} aria-hidden="true">
            <span>Name</span>
            <span>Method</span>
            <span>Status</span>
          </div>

          <div className={styles.emptyState}>
            <GlobalOutlined className={styles.emptyIcon} />
            <span>No traffic yet</span>
          </div>
          </section>
        </Splitter.Panel>

        <Splitter.Panel min="440px">
          <Splitter className={styles.inspectorSplitter} orientation="vertical">
            <Splitter.Panel defaultSize="56%" min="210px">
              <InspectorPane
                title="Request"
                tabs={[
                  ['overview', 'Overview'],
                  ['headers', 'Headers'],
                  ['query', 'Query'],
                  ['cookies', 'Cookies'],
                  ['raw', 'Raw'],
                ]}
                activeTab={requestTab}
                onTabChange={(value) => setRequestTab(value as RequestTab)}
              />
            </Splitter.Panel>
            <Splitter.Panel min="170px">
              <InspectorPane
                title="Response"
                tabs={[
                  ['body', 'Body'],
                  ['headers', 'Headers'],
                  ['cookies', 'Cookies'],
                  ['raw', 'Raw'],
                ]}
                activeTab={responseTab}
                onTabChange={(value) => setResponseTab(value as ResponseTab)}
              />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}

function InspectorPane({
  title,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  tabs: ReadonlyArray<readonly [string, string]>;
  activeTab: string;
  onTabChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <section className={styles.inspectorPane} aria-label={`${title} inspector`}>
      <div className={styles.inspectorHeading}>
        <div className={styles.inspectorTitle}>
          <Typography.Text strong>{title}</Typography.Text>
          <span className={styles.inspectorStatus}>No selection</span>
        </div>
        <ToolIconButton
          label={`${title} details`}
          controlSize="compact"
          icon={<InfoCircleOutlined />}
          disabled
        />
      </div>

      <ConfigProvider theme={{ token: { colorBorderSecondary: 'transparent' } }}>
        <Tabs
          className={styles.inspectorTabs}
          size="small"
          activeKey={activeTab}
          onChange={onTabChange}
          animated={false}
          aria-label={`${title} views`}
          items={tabs.map(([key, label]) => ({
            key,
            label,
            children: (
              <div className={styles.emptyState}>
                <AppstoreOutlined className={styles.emptyIcon} />
                <span>No selection</span>
              </div>
            ),
          }))}
          classNames={{
            header: styles.inspectorTabsHeader,
            body: styles.inspectorTabsBody,
            content: styles.inspectorTabsContent,
          }}
        />
      </ConfigProvider>
    </section>
  );
}