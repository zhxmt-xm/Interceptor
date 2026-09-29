import xmlFormat from 'xml-formatter';

export interface CodeDocumentFormatter {
  readonly language: string;
  readonly value: string;
  replace(value: string): void;
  run(): Promise<string>;
}

export async function formatCodeDocument(document: CodeDocumentFormatter): Promise<void> {
  try {
    const formatted = document.language === 'xml'
      ? xmlFormat(document.value, { indentation: '  ', lineSeparator: '\n' })
      : await document.run();
    document.replace(formatted);
  } catch (error) {
    document.replace(document.value);
    throw error;
  }
}