import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { InputBox } from '../../../components/InputBox/InputBox';
import { Select } from '../../../components/Select/Select';
import { useComposerStore } from '../data/composerStore';
import type { CollectionRequest, ComposerAuthType } from '../interfaces';

import styles from './AuthPane.module.css';

export interface AuthPaneProps {
  request: CollectionRequest;
}

/** 认证配置；authorization 只在发送时合成，不写回 headers 列表。 */
export function AuthPane({ request }: AuthPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const updateRequest = useComposerStore((state) => state.updateRequest);
  const { auth } = request;

  return (
    <div className={styles.pane}>
      <div className={styles.row}>
        <span className={styles.label}>{t('composer.type')}</span>
        <Select
          value={auth.type}
          options={[
            { value: 'none', label: t('composer.none') },
            { value: 'bearer', label: t('composer.bearerToken') },
            { value: 'basic', label: t('composer.basic') },
          ]}
          onValueChange={(type) =>
            updateRequest({
              ...request,
              auth: { ...auth, type: type as ComposerAuthType },
            })
          }
          ariaLabel={t('composer.authType')}
          automationId={AUTOMATION_IDS.composer.authType}
        />
      </div>

      {auth.type === 'bearer' ? (
        <div className={styles.row}>
          <span className={styles.label}>{t('composer.token')}</span>
          <InputBox
            value={auth.token}
            onValueChange={(token) =>
              updateRequest({ ...request, auth: { ...auth, token } })
            }
            ariaLabel={t('composer.bearerToken')}
            automationId={AUTOMATION_IDS.composer.bearerToken}
          />
        </div>
      ) : null}

      {auth.type === 'basic' ? (
        <>
          <div className={styles.row}>
            <span className={styles.label}>{t('composer.username')}</span>
            <InputBox
              value={auth.username}
              onValueChange={(username) =>
                updateRequest({ ...request, auth: { ...auth, username } })
              }
              ariaLabel={t('composer.username')}
              automationId={AUTOMATION_IDS.composer.username}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{t('composer.password')}</span>
            <InputBox
              value={auth.password}
              onValueChange={(password) =>
                updateRequest({ ...request, auth: { ...auth, password } })
              }
              ariaLabel={t('composer.password')}
              automationId={AUTOMATION_IDS.composer.password}
            />
          </div>
        </>
      ) : null}

      {auth.type === 'none' ? (
        <div className={styles.row}>
          <span />
          <span className={styles.hint}>{t('composer.noAuthorization')}</span>
        </div>
      ) : null}
    </div>
  );
}
