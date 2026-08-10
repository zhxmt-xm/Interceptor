export interface FixtureTextNode {
  readonly type: 'text';
  readonly value: string;
}

export interface FixtureElementNode {
  readonly type: 'element';
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly FixtureNode[];
}

export type FixtureNode = FixtureTextNode | FixtureElementNode;