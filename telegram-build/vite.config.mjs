import {defineConfig} from 'vite';
export default defineConfig({build:{target:'es2022',outDir:'../src/vendor',emptyOutDir:true,lib:{entry:'./telegram-entry.js',formats:['es'],fileName:'mtcute-client'},assetsInlineLimit:0,rollupOptions:{output:{entryFileNames:'mtcute-client.js'}}},optimizeDeps:{exclude:['@mtcute/wasm']}});
