declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/jetbrains-mono';

interface Window {
	__setState?: import('./state/types').UpdateDesignState;
	__monacoRelayout?: () => void;
	__monacoReady?: boolean;
}