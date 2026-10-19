"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "instrumentation";
exports.ids = ["instrumentation"];
exports.modules = {

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("path");

/***/ }),

/***/ "(instrument)/./src/instrumentation.ts":
/*!********************************!*\
  !*** ./src/instrumentation.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Runs once per Next.js server instance at boot — on Vercel, that's once per cold\n * start, before any request is routed. Used to seed /tmp/lab_ninja.sqlite3 from the\n * latest Neon snapshot (when DATABASE_URL is set) instead of letting the first request\n * to touch the DB seed it from the stale git-committed file. See\n * src/lib/server/neonSync.ts for what this actually does and why it's needed.\n *\n * Must live at src/instrumentation.ts (not the project root) because this project uses\n * a src/ directory — Next.js only picks it up from whichever one holds src/app.\n */ async function register() {\n    if (true) {\n        const { ensureSeededFromNeon } = await Promise.all(/*! import() */[__webpack_require__.e(\"vendor-chunks/@neondatabase\"), __webpack_require__.e(\"_instrument_src_lib_server_neonSync_ts\")]).then(__webpack_require__.bind(__webpack_require__, /*! ./lib/server/neonSync */ \"(instrument)/./src/lib/server/neonSync.ts\"));\n        await ensureSeededFromNeon('lab_ninja');\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7Ozs7OztDQVNDLEdBQ00sZUFBZUE7SUFDcEIsSUFBSUMsSUFBcUMsRUFBRTtRQUN6QyxNQUFNLEVBQUVHLG9CQUFvQixFQUFFLEdBQUcsTUFBTSxpUkFBK0I7UUFDdEUsTUFBTUEscUJBQXFCO0lBQzdCO0FBQ0YiLCJzb3VyY2VzIjpbIi9Vc2Vycy9hYnVuZGFuY2UvRG9jdW1lbnRzL2NvZGluZy9sYWJzLW5pbmphL2Zyb250ZW5kL3NyYy9pbnN0cnVtZW50YXRpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBSdW5zIG9uY2UgcGVyIE5leHQuanMgc2VydmVyIGluc3RhbmNlIGF0IGJvb3Qg4oCUIG9uIFZlcmNlbCwgdGhhdCdzIG9uY2UgcGVyIGNvbGRcbiAqIHN0YXJ0LCBiZWZvcmUgYW55IHJlcXVlc3QgaXMgcm91dGVkLiBVc2VkIHRvIHNlZWQgL3RtcC9sYWJfbmluamEuc3FsaXRlMyBmcm9tIHRoZVxuICogbGF0ZXN0IE5lb24gc25hcHNob3QgKHdoZW4gREFUQUJBU0VfVVJMIGlzIHNldCkgaW5zdGVhZCBvZiBsZXR0aW5nIHRoZSBmaXJzdCByZXF1ZXN0XG4gKiB0byB0b3VjaCB0aGUgREIgc2VlZCBpdCBmcm9tIHRoZSBzdGFsZSBnaXQtY29tbWl0dGVkIGZpbGUuIFNlZVxuICogc3JjL2xpYi9zZXJ2ZXIvbmVvblN5bmMudHMgZm9yIHdoYXQgdGhpcyBhY3R1YWxseSBkb2VzIGFuZCB3aHkgaXQncyBuZWVkZWQuXG4gKlxuICogTXVzdCBsaXZlIGF0IHNyYy9pbnN0cnVtZW50YXRpb24udHMgKG5vdCB0aGUgcHJvamVjdCByb290KSBiZWNhdXNlIHRoaXMgcHJvamVjdCB1c2VzXG4gKiBhIHNyYy8gZGlyZWN0b3J5IOKAlCBOZXh0LmpzIG9ubHkgcGlja3MgaXQgdXAgZnJvbSB3aGljaGV2ZXIgb25lIGhvbGRzIHNyYy9hcHAuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5FWFRfUlVOVElNRSA9PT0gJ25vZGVqcycpIHtcbiAgICBjb25zdCB7IGVuc3VyZVNlZWRlZEZyb21OZW9uIH0gPSBhd2FpdCBpbXBvcnQoJy4vbGliL3NlcnZlci9uZW9uU3luYycpO1xuICAgIGF3YWl0IGVuc3VyZVNlZWRlZEZyb21OZW9uKCdsYWJfbmluamEnKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbInJlZ2lzdGVyIiwicHJvY2VzcyIsImVudiIsIk5FWFRfUlVOVElNRSIsImVuc3VyZVNlZWRlZEZyb21OZW9uIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
module.exports = __webpack_exports__;

})();