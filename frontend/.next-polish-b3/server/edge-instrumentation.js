// runtime can't be in strict mode because a global variable is assign and maybe created.
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(self["webpackChunk_N_E"] = self["webpackChunk_N_E"] || []).push([["instrumentation"],{

/***/ "(instrument)/./src/instrumentation.ts":
/*!********************************!*\
  !*** ./src/instrumentation.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Runs once per Next.js server instance at boot — on Vercel, that's once per cold\n * start, before any request is routed. Used to seed /tmp/lab_ninja.sqlite3 from the\n * latest Neon snapshot (when DATABASE_URL is set) instead of letting the first request\n * to touch the DB seed it from the stale git-committed file. See\n * src/lib/server/neonSync.ts for what this actually does and why it's needed.\n *\n * Must live at src/instrumentation.ts (not the project root) because this project uses\n * a src/ directory — Next.js only picks it up from whichever one holds src/app.\n */ async function register() {\n    if (false) {}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7Ozs7OztDQVNDLEdBQ00sZUFBZUE7SUFDcEIsSUFBSUMsS0FBcUMsRUFBRSxFQUcxQztBQUNIIiwic291cmNlcyI6WyIvVXNlcnMvYWJ1bmRhbmNlL0RvY3VtZW50cy9jb2RpbmcvbGFicy1uaW5qYS9mcm9udGVuZC9zcmMvaW5zdHJ1bWVudGF0aW9uLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUnVucyBvbmNlIHBlciBOZXh0LmpzIHNlcnZlciBpbnN0YW5jZSBhdCBib290IOKAlCBvbiBWZXJjZWwsIHRoYXQncyBvbmNlIHBlciBjb2xkXG4gKiBzdGFydCwgYmVmb3JlIGFueSByZXF1ZXN0IGlzIHJvdXRlZC4gVXNlZCB0byBzZWVkIC90bXAvbGFiX25pbmphLnNxbGl0ZTMgZnJvbSB0aGVcbiAqIGxhdGVzdCBOZW9uIHNuYXBzaG90ICh3aGVuIERBVEFCQVNFX1VSTCBpcyBzZXQpIGluc3RlYWQgb2YgbGV0dGluZyB0aGUgZmlyc3QgcmVxdWVzdFxuICogdG8gdG91Y2ggdGhlIERCIHNlZWQgaXQgZnJvbSB0aGUgc3RhbGUgZ2l0LWNvbW1pdHRlZCBmaWxlLiBTZWVcbiAqIHNyYy9saWIvc2VydmVyL25lb25TeW5jLnRzIGZvciB3aGF0IHRoaXMgYWN0dWFsbHkgZG9lcyBhbmQgd2h5IGl0J3MgbmVlZGVkLlxuICpcbiAqIE11c3QgbGl2ZSBhdCBzcmMvaW5zdHJ1bWVudGF0aW9uLnRzIChub3QgdGhlIHByb2plY3Qgcm9vdCkgYmVjYXVzZSB0aGlzIHByb2plY3QgdXNlc1xuICogYSBzcmMvIGRpcmVjdG9yeSDigJQgTmV4dC5qcyBvbmx5IHBpY2tzIGl0IHVwIGZyb20gd2hpY2hldmVyIG9uZSBob2xkcyBzcmMvYXBwLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXIoKSB7XG4gIGlmIChwcm9jZXNzLmVudi5ORVhUX1JVTlRJTUUgPT09ICdub2RlanMnKSB7XG4gICAgY29uc3QgeyBlbnN1cmVTZWVkZWRGcm9tTmVvbiB9ID0gYXdhaXQgaW1wb3J0KCcuL2xpYi9zZXJ2ZXIvbmVvblN5bmMnKTtcbiAgICBhd2FpdCBlbnN1cmVTZWVkZWRGcm9tTmVvbignbGFiX25pbmphJyk7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJyZWdpc3RlciIsInByb2Nlc3MiLCJlbnYiLCJORVhUX1JVTlRJTUUiLCJlbnN1cmVTZWVkZWRGcm9tTmVvbiJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
/******/ (_ENTRIES = typeof _ENTRIES === "undefined" ? {} : _ENTRIES).middleware_instrumentation = __webpack_exports__;
/******/ }
]);