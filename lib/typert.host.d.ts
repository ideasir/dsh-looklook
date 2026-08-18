export interface TYPERT {
  readonly package: string;
  readonly face: 'host';
  readonly schemas: readonly unknown[];
  readonly invocations: readonly unknown[];
  readonly model?: Record<string, unknown>;
}
export const TYPERT: TYPERT;
