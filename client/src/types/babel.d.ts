declare module '@babel/standalone' {
  interface BabelTransformOptions {
    presets?: any[];
    plugins?: any[];
    filename?: string;
  }

  interface BabelTransformResult {
    code?: string;
    map?: any;
    ast?: any;
  }

  export function transform(code: string, options?: BabelTransformOptions): BabelTransformResult;
}