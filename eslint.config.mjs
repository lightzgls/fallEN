import tseslint from 'typescript-eslint';
export default tseslint.config(
  {ignores:['**/node_modules/**','**/lib/**','**/dist/**','.local/**','**/*.d.ts']},
  ...tseslint.configs.recommended,
  {files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'no-empty':'error','prefer-const':'error'}}
);
