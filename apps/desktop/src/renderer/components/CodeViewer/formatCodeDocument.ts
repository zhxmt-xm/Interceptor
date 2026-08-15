import xmlFormat from 'xml-formatter';

export interface CodeDocumentFormatter {
  readonly language: string;
  readonly value: string;
  replace(value: string): void;
  run(): Promise<void>;
  setReadOnly(readOnly: boolean): void;
}

export async function formatCodeDocument(document: CodeDocumentFormatter): Promise<void> {
  if (document.language === 'xml') {
    document.replace(xmlFormat(document.value, { indentation: '  ', lineSeparator: '\n' }));
    return;
  }

  document.setReadOnly(false);
  try {
    await document.run();
  } finally {
    document.setReadOnly(true);
  }
}