'use strict';
const masker = require("maskdata");

const maskSingleWord = (word, maskWith, unmaskedStart, unmaskedEnd) => {
    let maskedValue = null,
        maskLength = word.length - unmaskedStart - unmaskedEnd;
    if ((unmaskedStart + unmaskedEnd) >= word.length) {
        maskLength = 0;
        maskedValue = word;
    }
    if (!maskedValue) {
        maskedValue = word.substring(0, unmaskedStart) +
            `${maskWith}`.repeat(maskLength) +
            word.substring(word.length - unmaskedEnd);
    }
    return maskedValue;
};
module.exports = {
    card: (value, options) => { return masker.maskCard(value, options); },
    phone: (value, options) => { return masker.maskPhone(value, options); },
    string: (value, options) => { return masker.maskString(value, options); },
    password: (value, options) => { return masker.maskPassword(value, options); },
    word: (value, options) => {
        let skipped = "";
        if (options.skipStartCharacters > 0) {
            skipped = value.substring(0, options.skipStartCharacters);
            value = value.substring(options.skipStartCharacters);
        }
        return skipped + value.split(
            options.wordDelimiter
        ).map(word => maskSingleWord(
            word, options.maskWith,
            options.unmaskedStartCharacters,
            options.unmaskedEndCharacters
        )).join(options.wordDelimiter);
    },
    email: (email, options) => {
        const indexOfAt = email.indexOf("@");
        if (indexOfAt < 0) return email;
        const [before, after] = email.split("@");
        return maskSingleWord(before,
            options.maskWith,
            options.unmaskedStartCharacters,
            options.unmaskedEndCharacters
        ) + "@" + after.split(".").map(word => maskSingleWord(
            word, options.maskWith,
            options.unmaskedStartCharacters,
            options.unmaskedEndCharacters
        )).join(".");
    },
};
