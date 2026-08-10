interface Window {
	__setState?: import('./state/types').UpdateDesignState;
	__monacoRelayout?: () => void;
	__monacoReady?: boolean;
}