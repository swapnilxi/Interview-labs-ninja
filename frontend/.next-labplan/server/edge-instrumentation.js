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
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Runs once per Next.js server instance at boot — on Vercel, that's once per cold\n * start, before any request is routed. Used to seed /tmp/lab_ninja.sqlite3 from the\n * latest Neon snapshot (when DATABASE_URL is set) instead of letting the first request\n * to touch the DB seed it from the stale git-committed file. See\n * src/lib/server/neonSync.ts for what this actually does and why it's needed.\n *\n * Must live at src/instrumentation.ts (not the project root) because this project uses\n * a src/ directory — Next.js only picks it up from whichever one holds src/app.\n */ async function register() {\n    if (false) {}\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7Ozs7OztDQVNDLEdBQ00sZUFBZUE7SUFDcEIsSUFBSUMsS0FBcUMsRUFBRSxFQUcxQztBQUNIIiwic291cmNlcyI6WyIvVXNlcnMvYWJ1bmRhbnQtc3dhcG5pbC9Eb2N1bWVudHMvQ29kaW5nL2xhYnMtbmluamEvZnJvbnRlbmQvc3JjL2luc3RydW1lbnRhdGlvbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFJ1bnMgb25jZSBwZXIgTmV4dC5qcyBzZXJ2ZXIgaW5zdGFuY2UgYXQgYm9vdCDigJQgb24gVmVyY2VsLCB0aGF0J3Mgb25jZSBwZXIgY29sZFxuICogc3RhcnQsIGJlZm9yZSBhbnkgcmVxdWVzdCBpcyByb3V0ZWQuIFVzZWQgdG8gc2VlZCAvdG1wL2xhYl9uaW5qYS5zcWxpdGUzIGZyb20gdGhlXG4gKiBsYXRlc3QgTmVvbiBzbmFwc2hvdCAod2hlbiBEQVRBQkFTRV9VUkwgaXMgc2V0KSBpbnN0ZWFkIG9mIGxldHRpbmcgdGhlIGZpcnN0IHJlcXVlc3RcbiAqIHRvIHRvdWNoIHRoZSBEQiBzZWVkIGl0IGZyb20gdGhlIHN0YWxlIGdpdC1jb21taXR0ZWQgZmlsZS4gU2VlXG4gKiBzcmMvbGliL3NlcnZlci9uZW9uU3luYy50cyBmb3Igd2hhdCB0aGlzIGFjdHVhbGx5IGRvZXMgYW5kIHdoeSBpdCdzIG5lZWRlZC5cbiAqXG4gKiBNdXN0IGxpdmUgYXQgc3JjL2luc3RydW1lbnRhdGlvbi50cyAobm90IHRoZSBwcm9qZWN0IHJvb3QpIGJlY2F1c2UgdGhpcyBwcm9qZWN0IHVzZXNcbiAqIGEgc3JjLyBkaXJlY3Rvcnkg4oCUIE5leHQuanMgb25seSBwaWNrcyBpdCB1cCBmcm9tIHdoaWNoZXZlciBvbmUgaG9sZHMgc3JjL2FwcC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyKCkge1xuICBpZiAocHJvY2Vzcy5lbnYuTkVYVF9SVU5USU1FID09PSAnbm9kZWpzJykge1xuICAgIGNvbnN0IHsgZW5zdXJlU2VlZGVkRnJvbU5lb24gfSA9IGF3YWl0IGltcG9ydCgnLi9saWIvc2VydmVyL25lb25TeW5jJyk7XG4gICAgYXdhaXQgZW5zdXJlU2VlZGVkRnJvbU5lb24oJ2xhYl9uaW5qYScpO1xuICB9XG59XG4iXSwibmFtZXMiOlsicmVnaXN0ZXIiLCJwcm9jZXNzIiwiZW52IiwiTkVYVF9SVU5USU1FIiwiZW5zdXJlU2VlZGVkRnJvbU5lb24iXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
/******/ (_ENTRIES = typeof _ENTRIES === "undefined" ? {} : _ENTRIES).middleware_instrumentation = __webpack_exports__;
/******/ }
]);