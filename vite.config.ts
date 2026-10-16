import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* src/ 를 루트로 빌드하고, 결과를 저장소 루트 index.html 한 장으로 인라인한다.
   → 지금까지처럼 index.html 더블클릭(file://)·정적 호스팅으로 그대로 쓸 수 있다. */
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: '..',
    emptyOutDir: false,          /* 저장소 루트를 비우지 않는다 (index.html 만 덮어씀) */
    target: 'es2019',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    reportCompressedSize: false,
  },
  server: { port: 8917 },
});
