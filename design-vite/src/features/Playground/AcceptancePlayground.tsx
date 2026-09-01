import { PlaygroundCatalog } from './PlaygroundCatalog';
import { PlaygroundHeader } from './PlaygroundHeader';
import { PlaygroundInspector } from './PlaygroundInspector';
import { PlaygroundWorkbench } from './PlaygroundWorkbench';
import styles from './AcceptancePlayground.module.css';

export function AcceptancePlayground(): React.JSX.Element {
  return (
    <main className={styles.playgroundRoot} data-parity="acceptance-playground">
      <PlaygroundHeader />
      <div className={styles.playgroundBody}>
        <PlaygroundCatalog />
        <PlaygroundWorkbench />
        <PlaygroundInspector />
      </div>
    </main>
  );
}