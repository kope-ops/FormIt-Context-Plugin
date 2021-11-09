module.exports = {
    "env": {
        "browser": true,
        "es2021": true,
        "node": true,
    },
    "extends": "eslint:recommended",
    "globals": {
        "WSM": "readonly",
        "FormIt": "readonly",
        "_": "readonly",
        "osmtogeojson": "readonly",
        "turf": "readonly"
    },
    "parserOptions": {
        "ecmaVersion": 13
    },
    "rules": {
    }
};
