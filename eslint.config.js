const {
    defineConfig,
} = require("eslint/config");

const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const _import = require("eslint-plugin-import");
const jsdoc = require("eslint-plugin-jsdoc");
const prettier = require("eslint-plugin-prettier");

const {
    fixupPluginRules,
    fixupConfigRules,
} = require("@eslint/compat");

const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
        },

        parser: tsParser,
        "sourceType": "module",
        parserOptions: {},
    },

    plugins: {
        import: fixupPluginRules(_import),
        prettier,
    },

    "rules": {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "import/no-cycle": "error",
        "import/no-unresolved": "off",
        "prettier/prettier": ["error"],

        "jsdoc/check-tag-names": ["error", {
            "definedTags": ["category"],
        }],
    },

    extends: fixupConfigRules(compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:eslint-plugin-jsdoc/recommended",
        "plugin:eslint-plugin-import/recommended",
        "plugin:import/typescript",
        "prettier",
    )),
}]);
